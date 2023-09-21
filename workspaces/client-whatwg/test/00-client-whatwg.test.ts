import crypto from 'node:crypto'

import { Server } from '@juit/pgproxy-server'
import { $und } from '@plugjs/build'
import WebSocket from 'ws'

import { databaseName } from '../../../support/setup-db'
import { TestLogger, restoreEnv } from '../../../support/utils'
import { WHATWGClient, WHATWGProvider } from '../src/index'


describe('WHATWG Client', () => {
  const logger = new TestLogger()
  let server: Server | undefined
  let url: URL

  beforeAll(async () => {
    server = await new Server(logger, {
      host: 'localhost',
      secret: 'mySuperSecret',
      pool: {
        database: databaseName,
        maximumIdleConnections: 0,
      },
    }).start()

    url = new URL(server.url.href)
    url.username = 'mySuperSecret'
    log.notice(`Using ${$und(url.href)} for tests`)

    // Node's "ws" is more-or-less compatible with WHATWG's websockets, it's
    // just missing "dispatchEvent" and works differently with binary types...
    WHATWGProvider.WebSocket = WebSocket as any
    // Prepare a wrapper to implement the Web Cryptography API
    WHATWGProvider.crypto = {
      subtle: crypto.subtle,
      randomUUID: crypto.randomUUID,
      getRandomValues: <T extends ArrayBufferView| null>(array: T): T => {
        if (array) crypto.getRandomValues(array)
        return array
      },
    }
    // Node's "fetch" uses undici, internally, which has a different HTTP
    // agent than the default's. In our case, it leaves connection hanging for
    // a few seconds (keep alive is on) so we *specifically* want to inject the
    // "connection: close" header to disable keep alives.
    WHATWGProvider.fetch = (
        input: URL | RequestInfo,
        init: RequestInit | undefined = {},
    ): Promise<Response> => {
      init.headers = { ...init.headers, connection: 'close' }
      return globalThis.fetch(input, init)
    }
  })

  afterAll(async () => {
    if (server) await server.stop()
  }, 120_000)

  it('should construct without arguments', () => {
    const pgurl = process.env.PGURL

    try {
      process.env.PGURL = url.href
      expect(() => new WHATWGClient()).not.toThrow()
      delete process.env.PGURL
      expect(() => new WHATWGClient())
          .toThrowError('No URL to connect to (PGURL environment variable missing?)')
    } finally {
      restoreEnv('PGURL', pgurl)
    }
  })

  it('should execute a simple query', async () => {
    const client = new WHATWGClient(url)
    try {
      const result = await client.query('SELECT str, num FROM test WHERE num < $1 ORDER BY num', [ 3 ])
      expect(result).toEqual({
        command: 'SELECT',
        rowCount: 2,
        rows: [ { str: 'foo', num: 1 }, { str: 'bar', num: 2 } ],
        tuples: [ [ 'foo', 1 ], [ 'bar', 2 ] ],
      })
    } finally {
      await client.destroy().catch(log.error) // log failures here!
    }
  })

  it('should execute a wrong query', async () => {
    const client = new WHATWGClient(url)
    try {
      await expect(client.query('this is not sql'))
          .toBeRejectedWithError(/syntax error/)
    } finally {
      await client.destroy().catch(log.error) // log failures here!
    }
  })

  it('should not run transactions with query', async () => {
    const client = new WHATWGClient(url)

    try {
      const result0 = await client.query('BEGIN')
      const result1 = await client.query('CREATE TEMPORARY TABLE a (b int) ON COMMIT DROP')
      const result2 = await client.query('SELECT pg_current_xact_id_if_assigned() AS txn')

      expect(result0).toEqual({ command: 'BEGIN', rowCount: 0, rows: [], tuples: [] })
      expect(result1).toEqual({ command: 'CREATE', rowCount: 0, rows: [], tuples: [] })
      expect(result2).toEqual({
        command: 'SELECT',
        rowCount: 1,
        rows: [ { txn: null } ],
        tuples: [ [ null ] ],
      })
    } finally {
      await client.destroy().catch(log.error) // log failures here!
    }
  })

  it('should run transactions with connect', async () => {
    const client = new WHATWGClient(url)

    try {
      const [ result0, result1, result2 ] = await client.connect(async (connection) => {
        const result0 = await connection.query('BEGIN')
        const result1 = await connection.query('CREATE TEMPORARY TABLE a (b int) ON COMMIT DROP')
        const result2 = await connection.query('SELECT pg_current_xact_id_if_assigned() as txn')
        return [ result0, result1, result2 ]
      })

      expect(result0).toEqual({ command: 'BEGIN', rowCount: 0, rows: [], tuples: [] })
      expect(result1).toEqual({ command: 'CREATE', rowCount: 0, rows: [], tuples: [] })
      expect(result2).toEqual({
        command: 'SELECT',
        rowCount: 1,
        rows: [ { txn: expect.toBeA('bigint') } ],
        tuples: [ [ expect.toBeA('bigint') ] ],
      })
      expect(result2.rows[0]!.txn).toEqual(result2.tuples[0]![0])
    } finally {
      await client.destroy().catch(log.error) // log failures here!
    }
  })
})
