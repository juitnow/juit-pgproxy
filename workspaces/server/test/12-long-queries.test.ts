import { $und } from '@plugjs/build'

import { databaseName } from '../../../support/setup-db'
import { createToken, sleep } from '../../../support/utils'
import { Server } from '../src/index'
import { http } from './10-server.test'
import { parseAsync } from './11-websocket.test'

import type { Logger } from '../../pool/src/index'

describe('Long Queries', () => {
  const messages: Record<string, any[]>[] = []
  let server: Server
  let url: URL

  beforeAll(async () => {
    const logger: Logger = {
      debug: (...args: any[]) => messages.push({ debug: args }),
      info: (...args: any[]) => messages.push({ info: args }),
      warn: (...args: any[]) => messages.push({ warn: args }),
      error: (...args: any[]) => messages.push({ error: args }),
    }

    server = await new Server(logger, {
      longRunningQueryThreshold: 1000, // 2 seconds

      address: 'localhost',
      secret: 'mySuperSecret',
      healthCheck: 'healthCheck-one-two-three',
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

  beforeEach(() => messages.splice(0))


  it('should log long queries using http', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')
    const response = await http(new URL(`?auth=${auth}`, url), {
      body: {
        id: 'testing',
        query: 'SELECT pg_sleep(2)',
      },
    })
    expect(response.status).toStrictlyEqual(200) // Ok
    expect(response.body).toEqual({
      id: 'testing',
      statusCode: 200,
      command: 'SELECT',
      rowCount: 1,
      fields: [ [ 'pg_sleep', 2278 ] ],
      rows: [ [ '' ] ],
    })

    const message = messages.find((m) => m.warn)?.warn
    expect(message).toEqual([
      expect.toMatch(/^Long running query detected \(\d+(\.\d+)? ms\):/),
      'SELECT pg_sleep(2)',
    ])

    // let the pool catch up and ensure the connection was released
    await sleep(10)
    expect(server.stats).toEqual({
      available: 0,
      borrowed: 0,
      connecting: 0,
      total: 0,
    })
  })

  it('should log long queries using websocket', async () => {
    const auth = createToken('mySuperSecret').toString('base64url')

    const ws = new WebSocket(new URL(`?auth=${auth}`, url))

    const promise = new Promise((resolve, reject) => {
      ws.addEventListener('error', (event) => reject(event.error))
      ws.addEventListener('message', (event) => resolve(parseAsync(event.data)))
      ws.addEventListener('open', () => ws.send(JSON.stringify({
        id: 'testing',
        query: 'SELECT pg_sleep(2)',
        params: [],
      })))
    })

    try {
      expect(await promise).toEqual({
        id: 'testing',
        statusCode: 200,
        command: 'SELECT',
        rowCount: 1,
        fields: [ [ 'pg_sleep', 2278 ] ],
        rows: [ [ '' ] ],
      })

      const message = messages.find((m) => m.warn)?.warn
      expect(message).toEqual([
        expect.toMatch(/^Long running query detected \(\d+(\.\d+)? ms\):/),
        'SELECT pg_sleep(2)',
      ])
    } finally {
      ws.close(4000, 'Hello from the tests!')

      // let the pool catch up and ensure the connection was released
      await sleep(100)
      expect(server.stats).toEqual({
        available: 0,
        borrowed: 0,
        connecting: 0,
        total: 0,
      })
    }
  })

  it('should normalize queries', async () => {
    // Hackitahack more hack!
    const logger = Server.prototype._logLongRunningQuery as (sql: string, ms: number) => void
    expect(logger).toBeA('function')

    const messages: any[][] = []

    const self = {
      _longRunningQueryThreshold: 1000,
      _logger: {
        warn: (...args: any[]) => messages.push(args),
      },
    }

    logger.call(self, 'SELECT now(2)', 500) // ignored, under threshold
    logger.call(self, 'SELECT pg_sleep(2)', 2000)
    logger.call(self, '   THIS\r\n\tHAS WHITESPACE   ', 2000)
    logger.call(self, '   THIS   \x00\x1F\x7F   HAS CONTROLS   ', 2000)

    expect(messages).toEqual([
      [ 'Long running query detected (2000 ms):', 'SELECT pg_sleep(2)' ],
      [ 'Long running query detected (2000 ms):', 'THIS HAS WHITESPACE' ],
      [ 'Long running query detected (2000 ms):', 'THIS \\x00\\x1f\\x7f HAS CONTROLS' ],
    ])
  })
})
