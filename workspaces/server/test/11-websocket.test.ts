import { $und } from '@plugjs/build'
import { WebSocket } from 'undici'

import { databaseName } from '../../../support/setup-db'
import { TestLogger, createToken, sleep } from '../../../support/utils'
import { Server } from '../src/index'

describe('Websocket Test', () => {
  const logger = new TestLogger()
  let server: Server
  let url: URL

  function parseAsync(data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        resolve(JSON.parse(data.toString('utf-8')))
      } catch (error) {
        reject(error)
      }
    })
  }

  beforeAll(async () => {
    server = await new Server(logger, {
      address: 'localhost',
      secret: 'mySuperSecret',
      pool: {
        database: databaseName,
        maximumIdleConnections: 0,
      },
    }).start()

    url = new URL(server.url.href)
    url.protocol = 'ws'
    log.notice(`Using ${$und(url.href)} for tests`)
  })

  afterAll(async () => {
    if (server) await server.stop()
  }, 120_000)

  it('should fail without the correct authentication', async () => {
    const ws = new WebSocket(url)

    const promise = new Promise<void>((_, reject) => {
      ws.addEventListener('error', (event) => reject(event.error))
      ws.addEventListener('open', () => {
        reject(new Error('This should not happen'))
        ws.close()
      })
    })

    await expect(promise).toBeRejectedWithError()
  })

  it('should fail without a proper query', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')

    const ws = new WebSocket(new URL(`?auth=${auth}`, url))

    const promise = new Promise<void>((resolve, reject) => {
      ws.addEventListener('error', (event) => reject(event.error))
      ws.addEventListener('message', (event) => resolve(parseAsync(event.data)))
      ws.addEventListener('open', () => ws.send(JSON.stringify({
        id: 'testing',
      })))
    })

    try {
      expect(await promise).toEqual({
        id: 'testing',
        statusCode: 400,
        error: 'Invalid payload (or query missing)',
      })
    } finally {
      ws.close()
    }

    // let the pool catch up and ensure the connection was released
    await sleep(100)
    expect(server.stats).toEqual({
      available: 0,
      borrowed: 0,
      connecting: 0,
      total: 0,
    })
  })

  it('should succeed with the correct authentication', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')

    const ws = new WebSocket(new URL(`?auth=${auth}`, url))

    const promise = new Promise((resolve, reject) => {
      ws.addEventListener('error', (event) => reject(event.error))
      ws.addEventListener('message', (event) => resolve(parseAsync(event.data)))
      ws.addEventListener('open', () => ws.send(JSON.stringify({
        id: 'testing',
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      })))
    })

    try {
      expect(await promise).toEqual({
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
    } finally {
      ws.close(4000, 'Hello from the tests!')
    }

    // let the pool catch up and ensure the connection was released
    await sleep(100)
    expect(server.stats).toEqual({
      available: 0,
      borrowed: 0,
      connecting: 0,
      total: 0,
    })
  })

  it('should succeed running transactions', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')

    const ws = new WebSocket(new URL(`?auth=${auth}`, url))

    const promise = new Promise<Promise<any>[]>((resolve, reject) => {
      const promises: Promise<any>[] = []

      ws.addEventListener('error', (event) => reject(event.error))

      ws.addEventListener('message', (event) => {
        promises.push(parseAsync(event.data))
        if (promises.length >= 6) resolve(promises)
      })
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ id: 'testing-1', query: 'BEGIN' }))
        ws.send(JSON.stringify({ id: 'testing-2', query: 'CREATE TEMPORARY TABLE a (b int) ON COMMIT DROP' }))
        ws.send(JSON.stringify({ id: 'testing-3', query: 'SELECT pg_current_xact_id_if_assigned() AS txn' }))
        ws.send(JSON.stringify({ id: 'testing-4', query: 'ROLLBACK' }))
        ws.send(JSON.stringify({ id: 'testing-5', query: 'THIS IS NOT SQL!!!' }))
        ws.send(JSON.stringify({ id: 'testing-6', query: 'SELECT pg_current_xact_id_if_assigned() AS txn' }))
      })
    })

    try {
      const results = await Promise.all(await promise)
      expect(results).toEqual([ {
        command: 'BEGIN',
        rowCount: 0,
        fields: [],
        rows: [],
        statusCode: 200,
        id: 'testing-1',
      }, {
        command: 'CREATE',
        rowCount: 0,
        fields: [],
        rows: [],
        statusCode: 200,
        id: 'testing-2',
      }, {
        command: 'SELECT',
        rowCount: 1,
        fields: [ [ 'txn', 5069 ] ], // oid 5069 => xid8
        rows: [ [ expect.toMatch(/^\d+$/) ] ],
        statusCode: 200,
        id: 'testing-3',
      }, {
        command: 'ROLLBACK',
        rowCount: 0,
        fields: [],
        rows: [],
        statusCode: 200,
        id: 'testing-4',
      }, {
        statusCode: 400,
        error: expect.toMatch(/syntax error/),
        id: 'testing-5',
      }, {
        command: 'SELECT',
        rowCount: 1,
        fields: [ [ 'txn', 5069 ] ], // oid 5069 => xid8
        rows: [ [ null ] ],
        statusCode: 200,
        id: 'testing-6',
      } ])
    } finally {
      ws.close(4000, 'Hello from the tests!')
    }

    // let the pool catch up and ensure the connection was released
    await sleep(100)
    expect(server.stats).toEqual({
      available: 0,
      borrowed: 0,
      connecting: 0,
      total: 0,
    })
  })
})
