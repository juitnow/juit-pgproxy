import { $und } from '@plugjs/build'
import WebSocket from 'ws'

import { Server } from '../src/server'
import { databaseName } from './00-setup.test'
import { TestLogger } from './logger'
import { createToken } from './token'

describe('Server Test', () => {
  const logger = new TestLogger()
  let server: Server
  let url: URL

  beforeAll(async () => {
    server = await new Server(logger, {
      host: 'localhost',
      connections: {
        test: { secret: 'mySuperSecret', database: databaseName },
      },
    }).start()

    url = new URL(`ws://${server.address?.address}:${server.address?.port}/`)
    log.notice(`Using ${$und(url.href)} for tests`)
  })

  afterAll(async () => {
    if (server) await server.stop()
  }, 120_000)

  it('should succeed with the correct authentication', () => {
    const auth = createToken('mySuperSecret', 'test').toString('base64url')

    const ws = new WebSocket(new URL(`test?auth=${auth}`, url))
    return new Promise((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({
        id: 'testing',
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      })))

      ws.on('error', reject)

      ws.on('message', (message) => {
        log(message.toString('utf-8'))
        ws.close()
        resolve()
      })
    })
  })
})
