import { PGClient, WebSocketProvider, assert, registerProvider } from '@juit/pgproxy-client'

import type { PGConnectionResult } from '@juit/pgproxy-client'
import type { Request, Response } from '@juit/pgproxy-server'

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

async function createToken(
    secret: string,
    crypto: Crypto = globalThis.crypto,
): Promise<string> {
  const encoder = new TextEncoder()

  /* Prepare the buffer and its Uint8Array view for the token */
  const buffer = new ArrayBuffer(48)
  const token = new Uint8Array(buffer)

  /* Fill the whole token with random data */
  crypto.getRandomValues(token)

  /* Write the timestamp at offset 0 as a little endian 64-bits bigint */
  const timestamp = new DataView(buffer, 0, 8)
  timestamp.setBigInt64(0, BigInt(Date.now()), true)

  /* Prepare the message, concatenating the header and database name */
  const header = new Uint8Array(buffer, 0, 16)

  /* Prepare the key for HMAC-SHA-256 */
  const key = await crypto.subtle.importKey(
      'raw', // ........................ // Our key type
      encoder.encode(secret), // ....... // UTF-8 representation of the secret
      { name: 'HMAC', hash: 'SHA-256' }, // We want the HMAC(SHA-256)
      false, // ........................ // The key is not exportable
      [ 'sign', 'verify' ]) // ......... // Key is used to sign and verify

  /* Compute the signature of the message using the key */
  const signature = await crypto.subtle.sign(
      'HMAC', // ............. // We need an HMAC
      key, // ................ // Use the key as allocated above
      header) // ............ // The message to sign, as UTF-8

  /* Copy the signature into our token */
  token.set(new Uint8Array(signature), 16)

  /* Encode the token as an URL-safe BASE-64 string */
  const string = String.fromCharCode(...token)
  return btoa(string)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
}

/* ========================================================================== *
 * WHATWG PROVIDER AND CLIENT IMPLEMENTATION                                  *
 * ========================================================================== */

export interface WHATWGOptions {
  WebSocket?: typeof globalThis.WebSocket,
  crypto?: typeof globalThis.crypto,
  fetch?: typeof globalThis.fetch,
}

export class WHATWGProvider extends WebSocketProvider {
  constructor(url: URL, options: WHATWGOptions = {}) {
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
    this._getUniqueRequestId = (): string => crypto.randomUUID()

    this._getWebSocket = async (): Promise<WebSocket> => {
      const token = await createToken(secret, crypto)
      const wsUrl = new URL(baseWsUrl)
      wsUrl.searchParams.set('auth', token)
      return this._connectWebSocket(new WebSocket(wsUrl))
    }

    this.query = async (
        query: string,
        params: (string | null)[],
    ): Promise<PGConnectionResult> => {
      const token = await createToken(secret, crypto)
      const httpUrl = new URL(baseHttpUrl)
      httpUrl.searchParams.set('auth', token)

      /* Get a fresh ID to correlate requests and responses */
      const id = crypto.randomUUID()

      /* Fetch out our request (let errors fall through) */
      const response = await fetch(httpUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, query, params } satisfies Request),
      })

      let payload: Response
      /* coverage ignore catch */
      try {
        payload = await response.json()
      } catch (error) {
        throw new Error('Unable to parse JSON payload')
      }

      /* Correlate the response to the request */
      assert(payload && (typeof payload === 'object'), 'JSON payload is not an object')
      assert(payload.id === id, 'Invalid/uncorrelated ID in response"')

      /* Analyze the _payload_ status code, is successful, we have a winner! */
      if (payload.statusCode === 200) return payload
      throw new Error(`${payload.error || /* coverage ignore next */ 'Unknown error'} (${payload.statusCode})`)
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
  constructor(url?: URL | string) {
    url = url || (globalThis as any).process?.env?.PGURL
    assert(url, 'No URL to connect to (PGURL environment variable missing?)')
    super(new WHATWGProvider(typeof url === 'string' ? new URL(url) : url))
  }
}

registerProvider('http', WHATWGProvider)
registerProvider('https', WHATWGProvider)
