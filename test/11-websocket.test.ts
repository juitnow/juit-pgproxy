import { $und } from '@plugjs/build'
import WebSocket from 'ws'

import { Server } from '../src/server'
import { databaseName } from './00-setup.test'
import { TestLogger } from './logger'
import { createToken } from './token'

fdescribe('Websocket Test', () => {
  const logger = new TestLogger()
  let server: Server
  let url: URL

  beforeAll(async () => {
    server = await new Server(logger, {
      host: 'localhost',
      pool: { secret: 'mySuperSecret', database: databaseName },
    }).start()

    url = server.url
    url.protocol = 'ws'
    log.notice(`Using ${$und(url.href)} for tests`)
  })

  afterAll(async () => {
    if (server) await server.stop()
  }, 120_000)

  it('should succeed with the correct authentication', () => {
    const auth = createToken('mySuperSecret').toString('base64url')

    const ws = new WebSocket(new URL(`?auth=${auth}`, url))
    return new Promise((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({
        id: 'testing',
        query: 'SELECT "str", "num" FROM "test" ORDER BY "num"',
        params: [],
      })))

      ws.on('error', reject)

      ws.on('message', (message) => {
        log('RECEIVED', JSON.parse(message.toString('utf-8')))
        ws.close()
        resolve()
      })
    })
  })
})
