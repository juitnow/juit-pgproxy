import crypto from 'node:crypto'

import { Server } from '@juit/pgproxy-server'
import { $und } from '@plugjs/build'
import WebSocket from 'ws'

import { databaseName } from '../../../support/setup-db'
import { TestLogger } from '../../../support/utils'
import { WHATWGClient, WHATWGProvider } from '../src/index'


describe('WHATWG Client', () => {
  const logger = new TestLogger()
  let server: Server | undefined
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

    url = new URL(server.url.href)
    url.username = 'mySuperSecret'
    log.notice(`Using ${$und(url.href)} for tests`)

    WHATWGProvider.WebSocket = WebSocket
    WHATWGProvider.crypto = crypto
    WHATWGProvider.fetch = (url: URL, init: any): Promise<any> => {
      init.headers['connection'] = 'close'
      return (globalThis as any).fetch(url, init)
    }
  })

  afterAll(async () => {
    if (server) await server.stop()
  }, 120_000)

  it('should construct and set the proper urls', () => {
    const client = new WHATWGClient('https://foo:bar@example.org/baz')
    expect((client as any)._provider._queryURL.href).toEqual('https://example.org/baz')
    expect((client as any)._provider._webSocketURL.href).toEqual('wss://example.org/baz')
  })

  describe('query interface', () => {
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
  })

  describe('connection interface', () => {
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

    it('should fail when the connection is closed', async () => {
      const client = new WHATWGClient(url)

      try {
        await client.connect(async (connection) => {
          const result = await connection.query('SELECT now() AS now')
          expect(result).toEqual({
            command: 'SELECT',
            rowCount: 1,
            rows: [ { now: expect.toBeInstanceOf(Date) } ],
            tuples: [ [ expect.toBeInstanceOf(Date) ] ],
          })

          await client.destroy()

          await expect(connection.query('SELECT now() AS now'))
              .toBeRejectedWithError('WebSocket Closed (1000): Normal termination')
        })
      } finally {
        await client.destroy().catch(log.error) // log failures here!
      }
    })

    it('should continue when a statement fails in a connection', async () => {
      const client = new WHATWGClient(url)

      try {
        await client.connect(async (connection) => {
          await expect(connection.query('this is not sql'))
              .toBeRejectedWithError(/syntax error/)

          const result = await connection.query('SELECT now() AS now')
          expect(result).toEqual({
            command: 'SELECT',
            rowCount: 1,
            rows: [ { now: expect.toBeInstanceOf(Date) } ],
            tuples: [ [ expect.toBeInstanceOf(Date) ] ],
          })
        })
      } finally {
        await client.destroy().catch(log.error) // log failures here!
      }
    })

    it('should fail connecting to the wrong url', async () => {
      const wrong = new URL(url.href)
      wrong.port = '1234'
      const client = new WHATWGClient(wrong)

      try {
        await expect(client.connect(() => {}))
            .toBeRejectedWithError(/ECONNREFUSED/)
      } finally {
        await client.destroy().catch(log.error) // log failures here!
      }
    })

    it('should fail connecting to the wrong password', async () => {
      const wrong = new URL(url.href)
      wrong.username = 'this is wrong'
      wrong.password = 'this is wrong'
      const client = new WHATWGClient(wrong)

      try {
        await expect(client.connect(() => {}))
            .toBeRejectedWithError(/403/)
      } finally {
        await client.destroy().catch(log.error) // log failures here!
      }
    })
  })
})
