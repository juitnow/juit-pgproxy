import { $und } from '@plugjs/build'

import { Server } from '../src/server'
import { databaseName } from './00-setup.test'
import { TestLogger, createToken, sleep } from './utils'

fdescribe('Server Test', () => {
  const request = {
    method: 'POST',
    headers: { 'connection': 'close', 'content-type': 'application/json' },
  } as const
  const logger = new TestLogger()
  let server: Server
  let url: URL

  beforeAll(async () => {
    server = await new Server(logger, {
      host: 'localhost',
      pool: {
        secret: 'mySuperSecret',
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
      host: 'localhost',
      pool: { secret: 'mySuperSecret', database: 'this-does-not-exist' },
    }).start()).toBeRejectedWithError(/"this-does-not-exist"/)
  })

  it('should only respond to post', async () => {
    const response = await fetch(url, {
      ...request,
      method: 'GET',
    })
    expect(response.status).toStrictlyEqual(405) // Method Not Allowed
  })

  it('should only respond to json content', async () => {
    const response = await fetch(url, {
      headers: { 'connection': 'close', 'content-type': 'text/plain' },
      method: 'POST',
    })
    expect(response.status).toStrictlyEqual(415) // Unsupported media type
  })

  it('should fail on missing authentication', async () => {
    const response = await fetch(url, {
      ...request,
      body: JSON.stringify({
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      }),
    })
    expect(response.status).toStrictlyEqual(401) // Unauthorized
  })

  it('should fail with the wrong database', async () => {
    const response = await fetch(new URL('wrong?auth=foobar', url), {
      ...request,
      body: JSON.stringify({
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      }),
    })
    expect(response.status).toStrictlyEqual(404) // Not found
  })

  it('should fail with the wrong authentication', async () => {
    const response = await fetch(new URL('?auth=foobar', url), {
      ...request,
      body: JSON.stringify({
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      }),
    })
    expect(response.status).toStrictlyEqual(403) // Forbidden
  })

  it('should fail with some invalid json', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await fetch(new URL(`?auth=${auth}`, url), {
      ...request,
      body: 'this is not json',
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      id: expect.toBeA('string'),
      error: 'Error parsing JSON',
      statusCode: 400,
    })
  })

  it('should fail with no payload', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await fetch(new URL(`?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify(null),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      id: expect.toBeA('string'),
      error: 'Invalid payload (or query missing)',
      statusCode: 400,
    })
  })

  it('should fail when the query is missing', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await fetch(new URL(`?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({ id: 'testing', params: [] }),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      id: 'testing',
      error: 'Invalid payload (or query missing)',
      statusCode: 400,
    })
  })

  it('should fail when the query is not a string', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await fetch(new URL(`?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({ id: 'testing', query: true, params: [] }),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      id: 'testing',
      error: 'Query is not a string',
      statusCode: 400,
    })
  })

  it('should fail when parameters are missing', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await fetch(new URL(`?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({ id: 'testing', query: 'foo' }),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      id: 'testing',
      error: 'Parameters are not an array',
      statusCode: 400,
    })
  })

  it('should fail when parameters are not an array', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await fetch(new URL(`?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({ id: 'testing', query: 'foo', params: 'bar' }),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      id: 'testing',
      error: 'Parameters are not an array',
      statusCode: 400,
    })
  })

  it('should fail when the query fails', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await fetch(new URL(`?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({ id: 'testing', query: 'foo', params: [] }),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      id: 'testing',
      error: expect.toMatch(/syntax error/),
      statusCode: 400,
    })
  })

  it('should succeed with the correct authentication', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await fetch(new URL(`?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({
        id: 'testing',
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      }),
    })
    expect(response.status).toStrictlyEqual(200) // Ok
    expect(await response.json()).toEqual({
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

    await sleep(10)

    log(server.stats)
  })

  it('should not reuse the same authentication token twice', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response1 = await fetch(new URL(`?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({
        id: 'testing',
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      }),
    })
    expect(response1.status).toStrictlyEqual(200) // Ok

    const response2 = await fetch(new URL(`?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({
        id: 'testing',
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      }),
    })
    expect(response2.status).toStrictlyEqual(403) // Forbidden
  })
})
