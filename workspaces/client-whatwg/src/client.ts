import { PGClient, WebSocketProvider, assert, registerProvider } from '@juit/pgproxy-client'

import { getAuthenticationToken, getUniqueRequestId } from './crypto'
import { msg } from './utils'

import type { PGConnectionResult } from '@juit/pgproxy-client'
import type { Request, Response } from '@juit/pgproxy-server'

export interface WHATWGOptions {
  WebSocket?: typeof globalThis.WebSocket,
  crypto?: typeof globalThis.crypto,
  fetch?: typeof globalThis.fetch,
}

export class WHATWGProvider extends WebSocketProvider {
  constructor(url: URL | string, options: WHATWGOptions = {}) {
    super()

    const {
      WebSocket = WHATWGProvider.WebSocket,
      crypto = WHATWGProvider.crypto,
      fetch = WHATWGProvider.fetch,
    } = options

    /* Clone the URL and verify it's http/https */
    url = new URL(url)
    assert(/^https?:$/.test(url.protocol), `Unsupported protocol "${url.protocol}"`)

    /* Extract the secret from the url, we support both "http://secret@host/..."
     * and/or "http://whomever:secret@host/..." formats, discarding username */
    const secret = url.password || url.username
    assert(secret, 'No connection secret specified in URL')
    url.password = ''
    url.username = ''

    /* Prepare the URL for http and web sockets */
    const baseHttpUrl = new URL(url)
    const baseWsUrl = new URL(url)
    baseWsUrl.protocol = `ws${baseWsUrl.protocol.slice(4)}`

    /* Our methods */
    this._getUniqueRequestId = (): string => getUniqueRequestId(crypto)

    this._getWebSocket = async (): Promise<WebSocket> => {
      const token = await getAuthenticationToken(secret, crypto)
      const wsUrl = new URL(baseWsUrl)
      wsUrl.searchParams.set('auth', token)
      return this._connectWebSocket(new WebSocket(wsUrl))
    }

    this.query = async (
        query: string,
        params: (string | null)[],
    ): Promise<PGConnectionResult> => {
      const token = await getAuthenticationToken(secret, crypto)
      const httpUrl = new URL(baseHttpUrl)
      httpUrl.searchParams.set('auth', token)

      /* Get a fresh ID to correlate requests and responses */
      const id = getUniqueRequestId(crypto)

      /* Fetch out our request (let errors fall through) */
      const response = await fetch(httpUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, query, params } satisfies Request),
      })

      /* Parse the response and attempt to correlate it to the request */
      const payload: Response = await response.json()
      assert(payload.id === id, 'Invalid/uncorrelated ID in response"')

      /* Analyze the _payload_ status code, is successful, we have a winner! */
      if (payload.statusCode === 200) return payload
      throw new Error(`${msg(payload.error, 'Unknown error')} (${payload.statusCode})`)
    }
  }

  /* ======================================================================== *
   * METHODS FROM CONSTRUCTOR                                                 *
   * ======================================================================== */

  query: (query: string, params: (string | null)[]) => Promise<PGConnectionResult>
  protected _getWebSocket: () => Promise<WebSocket>
  protected _getUniqueRequestId: () => string

  /* ======================================================================== *
   * ENVIRONMENT OVERRIDES                                                    *
   * ======================================================================== */

  /** Constructor for {@link WebSocket} instances (default: `globalThis.WebSocket`) */
  static WebSocket = globalThis.WebSocket
  /** Web Cryptography API implementation (default: `globalThis.crypto`) */
  static crypto = globalThis.crypto
  /** WHATWG `fetch` implementation (default: `globalThis.fetch`) */
  static fetch = globalThis.fetch
}

export class WHATWGClient extends PGClient {
  constructor(url: URL | string) {
    super(new WHATWGProvider(url))
  }
}

registerProvider('http', WHATWGProvider)
registerProvider('https', WHATWGProvider)
