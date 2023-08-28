import { $und } from '@plugjs/build'

import { Server } from '../src/server'
import { databaseName } from './00-setup.test'
import { TestLogger } from './logger'
import { createToken } from './token'

describe('Server Test', () => {
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
      connections: {
        test: { secret: 'mySuperSecret', dbname: databaseName },
      },
    }).start()

    url = new URL(`http://${server.address?.address}:${server.address?.port}/`)
    log.notice(`Using ${$und(url.href)} for tests`)
  })

  afterAll(async () => {
    if (server) await server.stop()
  }, 120_000)

  it('should not start when the connection pool can not be validated', async () => {
    await expect(new Server(logger, {
      host: 'localhost',
      connections: {
        test: { secret: 'mySuperSecret', dbname: 'this-does-not-exist' },
      },
    }).start()).toBeRejectedWithError(/"this-does-not-exist"/)
  })

  it('should only respond to post', async () => {
    const response = await fetch(new URL('test', url), {
      ...request,
      method: 'GET',
    })
    expect(response.status).toStrictlyEqual(405) // Method Not Allowed
  })

  it('should only respond to json content', async () => {
    const response = await fetch(new URL('test', url), {
      headers: { 'connection': 'close', 'content-type': 'text/plain' },
      method: 'POST',
    })
    expect(response.status).toStrictlyEqual(415) // Unsupported media type
  })

  it('should fail on missing authentication', async () => {
    const response = await fetch(new URL('test', url), {
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
    const response = await fetch(new URL('test?auth=foobar', url), {
      ...request,
      body: JSON.stringify({
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      }),
    })
    expect(response.status).toStrictlyEqual(405) // Forbidden
  })

  it('should fail with some invalid json', async () => {
    const auth = createToken('mySuperSecret', 'test').toString('base64url')
    const response = await fetch(new URL(`test?auth=${auth}`, url), {
      ...request,
      body: 'this is not json',
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      id: expect.toBeA('string'),
      error: 'Error parsing JSON',
    })
  })

  it('should fail with no payload', async () => {
    const auth = createToken('mySuperSecret', 'test').toString('base64url')
    const response = await fetch(new URL(`test?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify(null),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      id: expect.toBeA('string'),
      error: 'Invalid payload (or query missing)',
    })
  })

  it('should fail when the query is missing', async () => {
    const auth = createToken('mySuperSecret', 'test').toString('base64url')
    const response = await fetch(new URL(`test?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({ id: 'testing', params: [] }),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      error: 'Invalid payload (or query missing)',
      id: 'testing',
    })
  })

  it('should fail when the query is not a string', async () => {
    const auth = createToken('mySuperSecret', 'test').toString('base64url')
    const response = await fetch(new URL(`test?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({ id: 'testing', query: true, params: [] }),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      error: 'Query is not a string',
      id: 'testing',
    })
  })

  it('should fail when parameters are missing', async () => {
    const auth = createToken('mySuperSecret', 'test').toString('base64url')
    const response = await fetch(new URL(`test?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({ id: 'testing', query: 'foo' }),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      error: 'Parameters are not an array',
      id: 'testing',
    })
  })

  it('should fail when parameters are not an array', async () => {
    const auth = createToken('mySuperSecret', 'test').toString('base64url')
    const response = await fetch(new URL(`test?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({ id: 'testing', query: 'foo', params: 'bar' }),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      error: 'Parameters are not an array',
      id: 'testing',
    })
  })

  it('should fail when the query fails', async () => {
    const auth = createToken('mySuperSecret', 'test').toString('base64url')
    const response = await fetch(new URL(`test?auth=${auth}`, url), {
      ...request,
      body: JSON.stringify({ id: 'testing', query: 'foo', params: [] }),
    })
    expect(response.status).toStrictlyEqual(400) // Bad request
    expect(await response.json()).toEqual({
      error: 'SQL error',
      details: expect.toMatch(/syntax error/),
      id: 'testing',
    })
  })

  it('should succeed with the correct authentication', async () => {
    const auth = createToken('mySuperSecret', 'test').toString('base64url')
    const response = await fetch(new URL(`test?auth=${auth}`, url), {
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
      command: 'SELECT',
      rowCount: 3,
      fields: [
        { name: 'str', oid: 1043 },
        { name: 'num', oid: 23 },
      ],
      rows: [
        [ 'foo', '1' ],
        [ 'bar', '2' ],
        [ 'baz', '3' ],
      ],
    })
  })
})
