import { assert } from './assert'

import type { Request, Response } from '@juit/pgproxy-server'
import type { PGConnection, PGConnectionResult, PGProvider } from './provider'

/* ========================================================================== *
 * WEBSOCKET TYPES: in order to work with both WHATWG WebSockets and NodeJS's *
 * "ws" package, let's abstract our _minimal_ requirement for implementation  *
 * ensuring type compatibility between the two variants.                      *
 * ========================================================================== */

interface PGWebSocketCloseEvent {
  readonly code: number;
  readonly reason: string;
}

interface PGWebSocketMessageEvent {
  readonly data?: any
}

interface PGWebSocketErrorEvent {
  readonly error?: any
}

interface PGWebSocket {
  addEventListener(event: 'close', handler: (event: PGWebSocketCloseEvent) => void): void
  addEventListener(event: 'error', handler: (event: PGWebSocketErrorEvent) => void): void
  addEventListener(event: 'message', handler: (event: PGWebSocketMessageEvent) => void): void
  addEventListener(event: 'open', handler: () => void): void
  removeEventListener(event: 'close', handler: (event: PGWebSocketCloseEvent) => void): void
  removeEventListener(event: 'error', handler: (event: PGWebSocketErrorEvent) => void): void
  removeEventListener(event: 'message', handler: (event: PGWebSocketMessageEvent) => void): void
  removeEventListener(event: 'open', handler: () => void): void

  readonly readyState: number;
  readonly CONNECTING: 0;
  readonly OPEN: 1;
  readonly CLOSING: 2;
  readonly CLOSED: 3;

  send(message: string): void
  close(code?: number, reason?: string): void;
}

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

/* Return the specified message or the default one */
function msg(message: string | null | undefined, defaultMessage: string): string {
  return message || /* coverage ignore next */ defaultMessage
}

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

/** Connection implementation, wrapping a {@link PGWebSocket} */
class WebSocketConnectionImpl implements WebSocketConnection {
  /** Open requests to correlate, keyed by their unique request id */
  private _requests = new Map<string, WebSocketRequest>()
  /** Our error, set also when the websocket is closed */
  private _error?: any

  constructor(private _socket: PGWebSocket, private _getRequestId: () => string) {
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
      if (event.error) this._error = event.error
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

/** A connection to the database backed by a {@link PGWebSocket} */
export interface WebSocketConnection extends PGConnection {
  /** Close this connection and the underlying {@link PGWebSocket} */
  close(): void
}

/** An abstract provider implementing `connect(...)` via WHATWG WebSockets */
export abstract class WebSocketProvider implements PGProvider<WebSocketConnection> {
  private readonly _wsConnections = new Set<WebSocketConnection>()
  private readonly _wsUrl: URL
  private readonly _wsSecret: string

  constructor(url: Readonly<URL>) {
    /* Clone and mangle the URL ensuring it's always "ws:..." or "wss:..." */
    assert(/^(http|ws)s?:$/.test(url.protocol), `Unsupported protocol "${url.protocol}"`)
    this._wsUrl = new URL(url.href)
    if (this._wsUrl.protocol === 'http:') this._wsUrl.protocol = 'ws:'
    if (this._wsUrl.protocol === 'https:') this._wsUrl.protocol = 'wss:'
    this._wsUrl.username = ''
    this._wsUrl.password = ''

    this._wsSecret = url.password || url.username || ''
    assert(this._wsSecret, 'No connection secret specified in URL')
  }

  abstract query(text: string, params: (string | null)[]): Promise<PGConnectionResult>

  /** Create a new WebSocket */
  protected abstract _getWebSocket(url: URL): PGWebSocket
  /** Return a fresh authentication token to connect to our server */
  protected abstract _getAuthenticationToken(secret: string): Promise<string>
  /** Return a unique request identifier to correlate responses */
  protected abstract _getUniqueRequestId(): string

  async acquire(): Promise<WebSocketConnection> {
    /* Clone the URL and inject the authentication token */
    const url = new URL(this._wsUrl.href)
    const token = await this._getAuthenticationToken(this._wsSecret)
    url.searchParams.set('auth', token )

    /* Create a proper WebSocket */
    const socket = await new Promise<PGWebSocket>((resolve, reject) => {
      const socket = this._getWebSocket(url)

      const onopen = (): void => {
        removeEventListeners()
        resolve(socket)
      }

      const onerror = (event: PGWebSocketErrorEvent): void => {
        removeEventListeners()
        if ('error' in event) return reject(event.error)
        /* coverage ignore next */
        reject(new Error('Uknown error opening WebSocket'))
      }

      const onclose = /* coverage ignore next */ (event: PGWebSocketCloseEvent): void => {
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
    const connection = new WebSocketConnectionImpl(socket, () => this._getUniqueRequestId())
    this._wsConnections.add(connection)
    return connection
  }

  async release(connection: WebSocketConnection): Promise<void> {
    this._wsConnections.delete(connection)
    connection.close()
  }

  async destroy(): Promise<void> {
    this._wsConnections.forEach((connection) => connection.close())
    this._wsConnections.clear()
  }
}
