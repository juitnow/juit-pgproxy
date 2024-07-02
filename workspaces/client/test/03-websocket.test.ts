import { randomUUID } from 'node:crypto'

import { Server } from '@juit/pgproxy-server'
import { PGOIDs } from '@juit/pgproxy-types'
import { $und } from '@plugjs/build'
import { WebSocket as NodeWebSocket } from 'undici'

import { databaseName } from '../../../support/setup-db'
import { TestLogger, createToken } from '../../../support/utils'
import { PGClient } from '../src/client'
import { WebSocketProvider } from '../src/websocket'

import type { PGConnectionResult } from '../src/provider'

/* ===== TEST IMPLEMENTATIONS OF PROVIDER AND CLIENT ======================== */

class TestWebSocketProvider extends WebSocketProvider {
  protected _getWebSocket: () => Promise<NodeWebSocket>

  constructor(url: URL) {
    super()

    url = new URL(url.href) // clone the URL
    const secret = url.username || url.password
    if (url.protocol === 'https:') url.protocol = 'wss:'
    if (url.protocol === 'http:') url.protocol = 'ws:'
    url.username = ''
    url.password = ''

    this._getWebSocket = (): Promise<NodeWebSocket> => {
      const token = createToken(secret).toString('base64')
      const wsurl = new URL(url.href)
      wsurl.searchParams.set('auth', token)
      return this._connectWebSocket(new NodeWebSocket(wsurl))
    }
  }

  query(): Promise<PGConnectionResult> {
    throw new Error('Method not implemented.')
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

/* ===== MOCK IMPLEMENTATIONS OF PROVIDER =================================== */

abstract class MockWebSocketProvider extends WebSocketProvider {
  query(): Promise<PGConnectionResult> {
    throw new Error('Method not implemented.')
  }

  protected _getUniqueRequestId(): string {
    return randomUUID()
  }
}

class MockWebSocket extends EventTarget {
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING= 2
  readonly CLOSED= 3

  readonly messages: string[] = []

  constructor(public readonly readyState: number = 0, public readonly sendError?: string) {
    super()
  }

  send(message: string): void {
    if (this.sendError) throw new Error(this.sendError)
    this.messages.push(message)
  }

  close(code: number = 999, reason: string = 'Test Reason'): void {
    const event = new MockEvent('close', { code, reason })
    this.dispatchEvent(event)
  }
}

class MockEvent extends Event {
  constructor(type: string, props: Record<string, any> = {}) {
    super(type)
    Object.entries(props).forEach(([ key, value ]) => {
      Object.defineProperty(this, key, { value })
    })
  }
}

/* ===== ACTUAL TESTS ======================================================= */

describe('WebSockets', () => {
  const logger = new TestLogger()
  let server: Server | undefined
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

    url = new URL(server.url.href)
    url.username = 'mySuperSecret'
    log.notice(`Using ${$und(url.href)} for tests`)
  })

  afterAll(async () => {
    if (server) await server.stop()
  }, 120_000)

  it('should immediately resolve when the websocket is open', async () => {
    const provider = new class extends MockWebSocketProvider {
      protected _getWebSocket = (): Promise<any> => {
        return this._connectWebSocket(new MockWebSocket(1) as any)
      }
    }()

    await provider.release(await provider.acquire())
  })

  it('should immediately reject when the websocket is not connecting', async () => {
    const provider = new class extends MockWebSocketProvider {
      protected _getWebSocket = (): Promise<any> => {
        return this._connectWebSocket(new MockWebSocket(123) as any)
      }
    }()

    await expect(provider.acquire())
        .toBeRejectedWithError('Invalid WebSocket ready state 123')
  })

  it('should reject when connecting throws an error', async () => {
    const provider = new class extends MockWebSocketProvider {
      protected _getWebSocket = (): Promise<any> => {
        const socket = new MockWebSocket()
        setTimeout(() => socket.dispatchEvent(new MockEvent('error')), 10)
        return this._connectWebSocket(socket as any)
      }
    }()

    await expect(provider.acquire())
        .toBeRejectedWithError('Uknown error opening WebSocket')

    const provider2 = new class extends MockWebSocketProvider {
      protected _getWebSocket = (): Promise<any> => {
        const socket = new MockWebSocket()
        setTimeout(() => socket.dispatchEvent(new MockEvent('error', { error: new Error('Foo!') })), 10)
        return this._connectWebSocket(socket as any)
      }
    }()

    await expect(provider2.acquire())
        .toBeRejectedWithError('Foo!')
  })

  it('should reject when connecting disconnects unexpectedly', async () => {
    const provider = new class extends MockWebSocketProvider {
      protected _getWebSocket = (): Promise<any> => {
        const socket = new MockWebSocket()
        setTimeout(() => socket.dispatchEvent(new MockEvent('close', { code: 123, reason: 'Foo!' })), 10)
        return this._connectWebSocket(socket as any)
      }
    }()

    await expect(provider.acquire())
        .toBeRejectedWithError('Connection closed with code 123: Foo!')
  })

  it('should prevent querying when send fails', async () => {
    const provider = new class extends MockWebSocketProvider {
      protected _getWebSocket = (): Promise<any> => {
        const socket = new MockWebSocket(1, 'Yo, fail on SEND!') // open!
        setTimeout(() => socket.dispatchEvent(new MockEvent('error', { error: new Error('Should not surface' ) })), 10)
        return this._connectWebSocket(socket as any)
      }
    }()

    const connection = await provider.acquire()
    await expect(connection.query('SELECT now()', []))
        .toBeRejectedWithError('Yo, fail on SEND!')
  })

  it('should prevent querying when an error is detected', async () => {
    const provider = new class extends MockWebSocketProvider {
      protected _getWebSocket = (): Promise<any> => {
        const socket = new MockWebSocket(1) // open!
        setTimeout(() => socket.dispatchEvent(new MockEvent('error', { error: new Error('My test error' ) })), 10)
        return this._connectWebSocket(socket as any)
      }
    }()

    const connection = await provider.acquire()
    const error = await connection.query('SELECT now()', []).catch((error) => error)
    await expect(error).toBeError('My test error')
    // second time, reject with the SAME error
    await expect(connection.query('SELECT now()', []))
        .toBeRejectedWith(error)

    const provider2 = new class extends MockWebSocketProvider {
      protected _getWebSocket = (): Promise<any> => {
        const socket = new MockWebSocket(1) // open!
        setTimeout(() => socket.dispatchEvent(new MockEvent('error')), 10)
        return this._connectWebSocket(socket as any)
      }
    }()

    const connection2 = await provider2.acquire()
    await expect(connection2.query('SELECT now()', []))
        .toBeRejectedWithError('Unknown WebSocket Error')
  })

  it('should prevent fail when the response can not be parsed', async () => {
    const provider = new class extends MockWebSocketProvider {
      protected _getWebSocket = (): Promise<any> => {
        const socket = new MockWebSocket(1) // open!
        setTimeout(() => socket.dispatchEvent(new MockEvent('message', { data: 'This is not JSON' })), 10)
        return this._connectWebSocket(socket as any)
      }
    }()

    const connection = await provider.acquire()
    await expect(connection.query('SELECT now()', []))
        .toBeRejectedWithError('WebSocket Closed (1003): Unable to parse JSON payload')
  })

  it('should prevent fail when the response has an invalid status', async () => {
    const provider = new class extends MockWebSocketProvider {
      protected _getWebSocket = (): Promise<any> => {
        const socket = new MockWebSocket(1) // open!
        setTimeout(() => {
          const id = JSON.parse(socket.messages[0]!).id
          const data = JSON.stringify({ id, statusCode: 599 })
          socket.dispatchEvent(new MockEvent('message', { data }))
        }, 10)
        return this._connectWebSocket(socket as any)
      }
    }()

    const connection = await provider.acquire()
    await expect(connection.query('SELECT now()', []))
        .toBeRejectedWithError('WebSocket Closed (1003): Unknown error (599)')
  })

  it('should run transactions', async () => {
    const client = new TestClient(url)

    try {
      const [ result0, result1, result2 ] = await client.connect(async (connection) => {
        const result0 = await connection.query('BEGIN')
        const result1 = await connection.query('CREATE TEMPORARY TABLE a (b int) ON COMMIT DROP')
        const result2 = await connection.query('SELECT pg_current_xact_id_if_assigned() as txn')
        return [ result0, result1, result2 ]
      })

      expect(result0).toEqual({ command: 'BEGIN', rowCount: 0, fields: [], rows: [], tuples: [] })
      expect(result1).toEqual({ command: 'CREATE', rowCount: 0, fields: [], rows: [], tuples: [] })
      expect(result2).toEqual({
        command: 'SELECT',
        rowCount: 1,
        fields: [ { name: 'txn', oid: PGOIDs.xid8 } ],
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
          fields: [ { name: 'now', oid: PGOIDs.timestamptz } ],
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
          fields: [ { name: 'now', oid: PGOIDs.timestamptz } ],
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
      await expect(client.connect(() => {})).toBeRejectedWithError()
    } finally {
      await client.destroy().catch(log.error) // log failures here!
    }
  })

  it('should fail connecting with the wrong password', async () => {
    const wrong = new URL(url.href)
    wrong.username = 'this is wrong'
    wrong.password = 'this is wrong'
    const client = new TestClient(wrong)

    try {
      await expect(client.connect(() => {})).toBeRejectedWithError()
    } finally {
      await client.destroy().catch(log.error) // log failures here!
    }
  })
})
