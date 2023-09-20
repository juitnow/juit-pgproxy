import { randomUUID } from 'node:crypto'

import { Server } from '@juit/pgproxy-server'
import { $und } from '@plugjs/build'
import NodeWebSocket from 'ws'

import { databaseName } from '../../../support/setup-db'
import { TestLogger, createToken } from '../../../support/utils'
import { PGClient } from '../src/client'
import { WebSocketProvider } from '../src/websocket'

import type { PGConnectionResult } from '../src/provider'

/* ===== TEST IMPLEMENTATIONS OF PROVIDER AND CLIENT ======================== */

class TestWebSocketProvider extends WebSocketProvider {
  constructor(url: URL) {
    super(url)
  }

  query(): Promise<PGConnectionResult> {
    throw new Error('Method not implemented.')
  }

  protected _getWebSocket(url: URL): NodeWebSocket {
    return new NodeWebSocket(url) as any as NodeWebSocket
  }

  protected _getAuthenticationToken(secret: string): Promise<string> {
    return Promise.resolve(createToken(secret).toString('base64'))
  }

  protected _getUniqueRequestId(): string {
    return randomUUID()
  }
}

class TestClient extends PGClient {
  constructor(url: URL | string) {
    if (typeof url === 'string') url = new URL(url)
    super(new TestWebSocketProvider(url))
  }
}

/* ===== ACTUAL TESTS ======================================================= */

describe('WebSockets', () => {
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
  })

  afterAll(async () => {
    if (server) await server.stop()
  }, 120_000)

  it('should construct', () => {
    const client1 = new TestClient('https://user:pass@example.org/baz')
    expect((client1 as any)._provider._wsSecret).toEqual('pass')
    expect((client1 as any)._provider._wsUrl.href).toEqual('wss://example.org/baz')

    const client2 = new TestClient('https://user@example.org/baz')
    expect((client2 as any)._provider._wsSecret).toEqual('user') // yep! user
    expect((client2 as any)._provider._wsUrl.href).toEqual('wss://example.org/baz')

    expect(() => new TestClient('https://example.org/baz'))
        .toThrowError('No connection secret specified in URL')
  })

  it('should run transactions with connect', async () => {
    const client = new TestClient(url)

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
    const client = new TestClient(url)

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
    const client = new TestClient(url)

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
    const client = new TestClient(wrong)

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
    const client = new TestClient(wrong)

    try {
      await expect(client.connect(() => {}))
          .toBeRejectedWithError(/403/)
    } finally {
      await client.destroy().catch(log.error) // log failures here!
    }
  })
})
