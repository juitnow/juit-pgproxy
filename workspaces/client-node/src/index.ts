import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { request as http } from 'node:http'
import { request as https } from 'node:https'

import { PGClient, WebSocketProvider, assert, registerProvider } from '@juit/pgproxy-client'
import { WebSocket } from 'undici'

import type { PGConnectionResult } from '@juit/pgproxy-client'
import type { Request, Response } from '@juit/pgproxy-server'


/** Create our authentication token */
function getAuthenticationToken(secret: string): string {
  const buffer = randomBytes(48)

  buffer.writeBigInt64LE(BigInt(Date.now()), 0)

  createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(buffer.subarray(0, 16))
      .digest()
      .copy(buffer, 16)

  return buffer.toString('base64')
}

function makeQuery(url: URL, secret: string): (
  query: string,
  params?: (string | null)[],
) => Promise<PGConnectionResult> {
  const protocol =
      url.protocol === 'https:' ? https :
      url.protocol === 'http:' ? http :
      undefined
  assert(protocol, `Unsupported protocol "${url.protocol}"`)
  const href = url.href

  return function query(
      query: string,
      params: (string | null)[] = [],
  ): Promise<PGConnectionResult> {
    const id = randomUUID()

    return new Promise<string>((resolve, reject) => {
      const token = getAuthenticationToken(secret)
      const url = new URL(href)
      url.searchParams.set('auth', token)

      const req = protocol(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }, (res) => {
        const buffers: Buffer[] = []
        res.on('error', /* coverage ignore next */ (error) => reject(error))
        res.on('data', (buffer) => buffers.push(buffer))
        res.on('end', () => {
          if (res.headers['content-type'] !== 'application/json') {
            return reject(new Error(`Invalid response (status=${res.statusCode})`))
          } else {
            const data = Buffer.concat(buffers).toString('utf-8')
            return resolve(data)
          }
        })
      })

      const body: Request = { id, query, params }
      const buffer = JSON.stringify(body)
      req.write(buffer)
      req.end()
    }).then((data: string) => {
      let payload: Response
      /* coverage ignore catch */
      try {
        payload = JSON.parse(data)
      } catch {
        throw new Error('Unable to parse JSON payload')
      }

      /* Correlate our response to the request */
      assert(payload && (typeof payload === 'object'), 'JSON payload is not an object')
      assert(payload.id === id, 'Invalid/uncorrelated ID in response')

      /* Analyze the _payload_ status code, is successful, we have a winner! */
      if (payload.statusCode === 200) return payload
      throw new Error(`${payload.error || /* coverage ignore next */ 'Unknown error'} (${payload.statusCode})`)
    })
  }
}

/* ========================================================================== *
 *                                                                            *
 * ========================================================================== */

export class NodeProvider extends WebSocketProvider {
  constructor(url: URL) {
    super()

    /* Clone the URL and verify it's http/https */
    url = new URL(url.href)

    /* Extract the secret from the url, we support both "http://secret@host/..."
     * and/or "http://whomever:secret@host/..." formats, discarding username */
    const secret = decodeURIComponent(url.password || url.username)
    assert(secret, 'No connection secret specified in URL')
    url.password = ''
    url.username = ''

    /* Prepare the URL for http and web sockets */
    const baseHttpUrl = new URL(url.href)
    const baseWsUrl = new URL(url.href)
    baseWsUrl.protocol = `ws${baseWsUrl.protocol.slice(4)}`

    /* Our methods */
    this._getUniqueRequestId = (): string => randomUUID()

    this._getWebSocket = async (): Promise<WebSocket> => {
      const token = await getAuthenticationToken(secret)
      const wsUrl = new URL(baseWsUrl.href)
      wsUrl.searchParams.set('auth', token)
      return this._connectWebSocket(new WebSocket(wsUrl))
    }

    this.query = makeQuery(baseHttpUrl, secret)
  }

  /* ======================================================================== *
   * METHODS FROM CONSTRUCTOR                                                 *
   * ======================================================================== */

  query: (query: string, params?: (string | null)[]) => Promise<PGConnectionResult>
  protected _getWebSocket: () => Promise<WebSocket>
  protected _getUniqueRequestId: () => string
}

export class NodeClient extends PGClient {
  constructor(url?: URL | string) {
    url = url || process.env.PGURL
    assert(url, 'No URL to connect to (PGURL environment variable missing?)')
    super(new NodeProvider(typeof url === 'string' ? new URL(url) : url))
  }
}

registerProvider('http', NodeProvider)
registerProvider('https', NodeProvider)
