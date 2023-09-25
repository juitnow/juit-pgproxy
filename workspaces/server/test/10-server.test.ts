import { request } from 'node:http'

import { $und } from '@plugjs/build'

import { databaseName } from '../../../support/setup-db'
import { TestLogger, createToken, sleep } from '../../../support/utils'
import { Server } from '../src/index'

/**
 * Use a simplified `fetch`, the normal one leaves sockets around when
 * connecting to localhost and _sometimes_ our tests don't end...
 */
export function http(url: URL, options: {
  method?: 'POST' | 'GET' | 'OPTIONS',
  headers?: Record<string, string>,
  body?: any,
  bodyRaw?: any,
}): Promise<{ status: number, body: object }> {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: options.method || 'POST',
      headers: {
        'content-type': 'application/json',
        ...options.headers,
      },
    }, (res) => {
      const buffers: Buffer[] = []

      res.on('data', (buffer) => buffers.push(buffer))
      res.on('error', (error) => reject(error))
      res.on('end', () => {
        try {
          const json = Buffer.concat(buffers).toString('utf-8')
          const body = json ? JSON.parse(json) : undefined
          return resolve({ status: res.statusCode || 500, body })
        } catch (error) {
          reject(error)
        }
      })
    })

    if (options.body) options.bodyRaw = JSON.stringify(options.body)
    if (options.bodyRaw) req.write(options.bodyRaw, (err) => (err && reject(err)))
    req.end()
  })
}

describe('Server Test', () => {
  const logger = new TestLogger()
  let server: Server
  let url: URL

  beforeAll(async () => {
    server = await new Server(logger, {
      address: 'localhost',
      secret: 'mySuperSecret',
      pool: {
        database: databaseName,
        maximumIdleConnections: 0,
      },
    }).start()

    url = server.url
    log.notice(`Using ${$und(url.href)} for tests`)
  })

  afterAll(async () => {
    if (server) await server.stop()
  }, 120_000)

  it('should not start when the connection pool can not be validated', async () => {
    await expect(new Server(logger, {
      address: 'localhost',
      secret: 'mySuperSecret',
      pool: { database: 'this-does-not-exist' },
    }).start()).toBeRejectedWithError(/"this-does-not-exist"/)
  })

  it('should only respond to json content', async () => {
    const response = await http(url, {
      headers: { 'content-type': 'text/plain' },
      method: 'POST',
    })
    expect(response.status).toStrictlyEqual(415) // Unsupported media type
  })

  it('should fail on missing authentication', async () => {
    const response = await http(url, {
      body: {
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      },
    })
    expect(response.status).toStrictlyEqual(401) // Unauthorized
  })

  it('should fail with the wrong path', async () => {
    const response = await http(new URL('wrong?auth=foobar', url), {
      body: {
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      },
    })
    expect(response.status).toStrictlyEqual(404) // Not found
  })

  it('should fail with the wrong authentication', async () => {
    const response = await http(new URL('?auth=foobar', url), {
      body: {
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      },
    })
    expect(response.status).toStrictlyEqual(403) // Forbidden
  })

  it('should only respond to post or get', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')

    const response = await http(new URL(`?auth=${auth}`, url), {
      method: 'OPTIONS',
    })
    expect(response.status).toStrictlyEqual(405) // Method Not Allowed
  })

  it('should return the pool statistics on get', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')

    const response = await http(new URL(`?auth=${auth}`, url), {
      method: 'GET',
    })
    expect(response.status).toStrictlyEqual(200) // Ok
    expect(response.body).toEqual({
      available: 0,
      borrowed: 0,
      connecting: 0,
      total: 0,
    })
  })

  it('should fail with some invalid json', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')

    const response = await http(new URL(`?auth=${auth}`, url), {
      bodyRaw: 'this is not json',
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.body).toEqual({
      id: expect.toBeA('string'),
      error: 'Error parsing JSON',
      statusCode: 400,
    })
  })

  it('should fail with no payload', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await http(new URL(`?auth=${auth}`, url), {
      bodyRaw: null,
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.body).toEqual({
      id: expect.toBeA('string'),
      error: 'Invalid payload (or query missing)',
      statusCode: 400,
    })
  })

  it('should fail when the query is missing', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await http(new URL(`?auth=${auth}`, url), {
      body: { id: 'testing', params: [] },
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.body).toEqual({
      id: 'testing',
      error: 'Invalid payload (or query missing)',
      statusCode: 400,
    })
  })

  it('should fail when the query is not a string', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await http(new URL(`?auth=${auth}`, url), {
      body: { id: 'testing', query: true, params: [] },
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.body).toEqual({
      id: 'testing',
      error: 'Query is not a string',
      statusCode: 400,
    })
  })

  it('should fail when parameters are not an array', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await http(new URL(`?auth=${auth}`, url), {
      body: { id: 'testing', query: 'foo', params: 'bar' },
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.body).toEqual({
      id: 'testing',
      error: 'Parameters are not an array',
      statusCode: 400,
    })
  })

  it('should fail when the query fails', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await http(new URL(`?auth=${auth}`, url), {
      body: { id: 'testing', query: 'foo', params: [] },
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.body).toEqual({
      id: 'testing',
      error: expect.toMatch(/syntax error/),
      statusCode: 400,
    })
  })

  it('should succeed with the correct authentication', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await http(new URL(`?auth=${auth}`, url), {
      body: {
        id: 'testing',
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
      },
    })
    expect(response.status).toStrictlyEqual(200) // Ok
    expect(await response.body).toEqual({
      id: 'testing',
      statusCode: 200,
      command: 'SELECT',
      rowCount: 3,
      fields: [
        [ 'str', 1043 ],
        [ 'num', 23 ],
      ],
      rows: [
        [ 'foo', '1' ],
        [ 'bar', '2' ],
        [ 'baz', '3' ],
      ],
    })

    // let the pool catch up and ensure the connection was released
    await sleep(10)
    expect(server.stats).toEqual({
      available: 0,
      borrowed: 0,
      connecting: 0,
      total: 0,
    })
  })

  it('should succeed with parameters', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await http(new URL(`?auth=${auth}`, url), {
      body: {
        id: 'testing',
        query: 'SELECT "str", "num" FROM "test" WHERE "num" = $1',
        params: [ 2 ],
      },
    })
    expect(response.status).toStrictlyEqual(200) // Ok
    expect(await response.body).toEqual({
      id: 'testing',
      statusCode: 200,
      command: 'SELECT',
      rowCount: 1,
      fields: [
        [ 'str', 1043 ],
        [ 'num', 23 ],
      ],
      rows: [
        [ 'bar', '2' ],
      ],
    })

    // let the pool catch up and ensure the connection was released
    await sleep(10)
    expect(server.stats).toEqual({
      available: 0,
      borrowed: 0,
      connecting: 0,
      total: 0,
    })
  })

  it('should not reuse the same authentication token twice', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response1 = await http(new URL(`?auth=${auth}`, url), {
      body: {
        id: 'testing',
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      },
    })
    expect(response1.status).toStrictlyEqual(200) // Ok

    const response2 = await http(new URL(`?auth=${auth}`, url), {
      body: {
        id: 'testing',
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      },
    })
    expect(response2.status).toStrictlyEqual(403) // Forbidden
  })
})
