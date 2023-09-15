import { assert } from '@juit/pgproxy-client'

import { msg } from './utils'

import type { PGConnection, PGConnectionResult, PGProvider } from '@juit/pgproxy-client'
import type { Request, Response } from '@juit/pgproxy-server'

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

/** A request, simply an unwrapped {@link PGConnectionResult} promise */
class WebSocketRequest {
  readonly promise: Promise<PGConnectionResult>
  readonly resolve!: (result: PGConnectionResult) => void
  readonly reject!: (reason: any) => void

  constructor() {
    this.promise = new Promise((resolve, reject) => Object.defineProperties(this, {
      resolve: { value: resolve },
      reject: { value: reject },
    }))
  }
}

/** Connection implementation, wrapping a {@link WebSocket} */
class WebSocketConnectionImpl implements WebSocketConnection {
  /** Open requests to correlate, keyed by their unique request id */
  private _requests = new Map<string, WebSocketRequest>()
  /** Our error, set also when the websocket is closed */
  private _error?: any

  constructor(private _socket: WebSocket, private _getRequestId: () => string) {
    /* On close, set the error to "WebSocket Closed" if none was set before */
    _socket.addEventListener('close', (event) => {
      /* Keep the first error we received... */
      if (! this._error) {
        const reason = msg(event.reason, 'Unknown Reason')
        const message = `WebSocket Closed (${event.code}): ${reason}`
        this._error = new Error(message)
      }

      /* Reject all open/pending requests */
      for (const req of this._requests.values()) req.reject(this._error)
      this._requests.clear()
    })

    /* On errors, make sure that the websocket is closed */
    _socket.addEventListener('error', /* coverage ignore next */ (event) => {
      if ('error' in event) this._error = event.error
      else this._error = new Error('Unknown WebSocket Error')

      /* Reject all open/pending requests */
      for (const req of this._requests.values()) req.reject(this._error)
      this._requests.clear()

      /* Make sure that the websocket is closed */
      this.close()
    })

    /* On messages, correlate the message with a request and resolve it */
    _socket.addEventListener('message', (event) => {
      /* coverage ignore catch */
      try {
        /* Make sure we have a _text_ message (yup, it's JSON) */
        const data = event.data
        assert(typeof data === 'string', 'Data not a "string"')

        /* Parse the response */
        let payload: Response
        /* coverage ignore catch */
        try {
          payload = JSON.parse(data)
        } catch (error) {
          throw new Error('Unable to parse JSON payload')
        }

        /* Correlate the response ID with a previous request */
        const request = this._requests.get(payload.id)
        assert(request, `Invalid response ID "${payload.id}"`)

        /* Determine what kind of response we're dealing with */
        if (payload.statusCode === 200) {
          this._requests.delete(payload.id)
          return request.resolve(payload)
        } else if (payload.statusCode === 400) {
          this._requests.delete(payload.id)
          return request.reject(new Error(`${msg(payload.error, 'Unknown error')} (${payload.statusCode})`))
        } else /* coverage ignore next */ {
          throw new Error(`${msg(payload.error, 'Unknown error')} (${payload.statusCode})`)
        }
      } catch (error: any) {
        _socket.close(1003, msg(error.message, 'Uknown error'))
      }
    })
  }

  close(): void {
    if (this._socket.readyState === this._socket.CLOSED) return
    /* coverage ignore if */
    if (this._socket.readyState === this._socket.CLOSING) return
    this._socket.close(1000, 'Normal termination')
  }

  query(query: string, params: (string | null)[]): Promise<PGConnectionResult> {
    /* The error is set also when the websocket is closed, soooooo... */
    /* coverage ignore if */
    if (this._error) return Promise.reject(this._error)

    /* Get a unique request ID, and prepare our request */
    const id = this._getRequestId()
    const request = new WebSocketRequest()
    this._requests.set(id, request)

    /* Send out our request via the websocket */
    this._socket.send(JSON.stringify({ id, query, params } satisfies Request))

    /* The promise will _eventually_ be resolved or rejected */
    return request.promise
  }
}

/* ========================================================================== *
 * EXPORTED                                                                   *
 * ========================================================================== */

/** A connection to the database backed by a {@link WebSocket} */
export interface WebSocketConnection extends PGConnection {
  /** Close this connection and the underlying {@link WebSocket} */
  close(): void
}

/** Options _required_ to construct a {@link WebSocketProvider} */
export interface WebSocketProviderOptions {
  /** The constructor for {@link WebSocket} instances */
  WebSocket: typeof globalThis.WebSocket,
}

/** An abstract provider implementing `connect(...)` via WHATWG WebSockets */
export abstract class WebSocketProvider implements PGProvider<WebSocketConnection> {
  private readonly _connections = new Set<WebSocketConnection>()
  private readonly _webSocketURL: URL

  constructor(url: URL, private _WebSocket: typeof globalThis.WebSocket) {
    /* Clone and mangle the URL ensuring it's always "ws:..." or "wss:..." */
    assert(/^(http|ws)s?:$/.test(url.protocol), `Unsupported protocol "${url.protocol}"`)
    this._webSocketURL = new URL(url)
    if (this._webSocketURL.protocol === 'http:') this._webSocketURL.protocol = 'ws:'
    if (this._webSocketURL.protocol === 'https:') this._webSocketURL.protocol = 'wss:'
  }

  abstract query(text: string, params: (string | null)[]): Promise<PGConnectionResult>

  /** Return a fresh authentication token to connect to our server */
  protected abstract getAuthenticationToken(): Promise<string>
  /** Return a unique request identifier to correlate responses */
  protected abstract getUniqueRequestId(): string

  async acquire(): Promise<WebSocketConnection> {
    /* Clone the URL and inject the authentication token */
    const url = new URL(this._webSocketURL)
    url.searchParams.set('auth', await this.getAuthenticationToken())

    /* Create a proper WebSocket */
    const socket = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new this._WebSocket(url)

      const onopen = (): void => {
        removeEventListeners()
        resolve(socket)
      }

      const onerror = (event: Event): void => {
        removeEventListeners()
        if ('error' in event) return reject(event.error)
        /* coverage ignore next */
        reject(new Error('Uknown error opening WebSocket'))
      }

      const onclose = /* coverage ignore next */ (event: CloseEvent): void => {
        removeEventListeners()
        reject(new Error(`Connection closed with code ${event.code}: ${event.reason}`))
      }

      const removeEventListeners = (): void => {
        socket.removeEventListener('open', onopen)
        socket.removeEventListener('error', onerror)
        socket.removeEventListener('close', onclose)
      }

      socket.addEventListener('open', onopen)
      socket.addEventListener('error', onerror)
      socket.addEventListener('close', onclose)
    })

    /* Wrap the WebSocket into a _connection_, register and return it */
    const connection = new WebSocketConnectionImpl(socket, () => this.getUniqueRequestId())
    this._connections.add(connection)
    return connection
  }

  async release(connection: WebSocketConnection): Promise<void> {
    this._connections.delete(connection)
    connection.close()
  }

  async destroy(): Promise<void> {
    this._connections.forEach((connection) => connection.close())
    this._connections.clear()
  }
}
