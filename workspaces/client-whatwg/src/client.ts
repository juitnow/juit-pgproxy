import { PGClient, assert, registerProvider } from '@juit/pgproxy-client'

import { getAuthenticationToken, getUniqueRequestId } from './crypto'
import { msg } from './utils'
import { WebSocketProvider } from './websocket'

import type { PGConnectionResult } from '@juit/pgproxy-client'
import type { Request, Response } from '@juit/pgproxy-server'

export interface WHATWGOptions {
  WebSocket?: typeof globalThis.WebSocket,
  crypto?: typeof globalThis.crypto,
  fetch?: typeof globalThis.fetch,
}

export class WHATWGProvider extends WebSocketProvider {
  protected getAuthenticationToken: () => Promise<string>
  protected getUniqueRequestId: () => string
  private readonly _fetch: typeof globalThis.fetch
  private readonly _queryURL: URL

  constructor(url: URL | string, options: WHATWGOptions = {}) {
    const {
      WebSocket = WHATWGProvider.WebSocket,
      crypto = WHATWGProvider.crypto,
      fetch = WHATWGProvider.fetch,
    } = options

    /* Create a a new URL from a string, or clone the specified one */
    url = new URL(url)
    assert(/^https?:$/.test(url.protocol), `Unsupported protocol "${url.protocol}"`)

    /* Extract the secret from the url, we support both "http://secret@host/..."
     * and/or "http://whomever:secret@host/..." formats, discarding username */
    const secret = url.password || url.username
    assert(secret, 'No connection secret specified in URL')
    url.password = ''
    url.username = ''

    /* Setup the websocket part of the client */
    super(url, WebSocket)

    /* Inject our provides, remember the URL for queries, and be done */
    this.getAuthenticationToken = (): Promise<string> => getAuthenticationToken(secret, crypto)
    this.getUniqueRequestId = (): string => getUniqueRequestId(crypto)
    this._queryURL = url
    this._fetch = fetch
  }

  async query(query: string, params: (string | null)[]): Promise<PGConnectionResult> {
    /* Clone our query URL and inject our authentication token */
    const url = new URL(this._queryURL)
    url.searchParams.set('auth', await this.getAuthenticationToken())

    /* Get a fresh ID to correlate requests and responses */
    const id = this.getUniqueRequestId()

    /* Fetch out our request (let errors fall through) */
    const response = await this._fetch(url, {
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
