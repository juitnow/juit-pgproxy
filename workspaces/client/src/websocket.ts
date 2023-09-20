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
  return message || defaultMessage
}

/** A request, simply an unwrapped {@link PGConnectionResult} promise */
class WebSocketRequest {
  readonly promise: Promise<PGConnectionResult>
  readonly resolve!: (result: PGConnectionResult) => void
  readonly reject!: (reason: any) => void

  constructor(public id: string) {
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
    _socket.addEventListener('error', (event) => {
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
      try {
        /* Make sure we have a _text_ message (yup, it's JSON) */
        const data = event.data
        assert(typeof data === 'string', 'Data not a "string"')

        /* Parse the response */
        let payload: Response
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
        } else {
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
    if (this._error) return Promise.reject(this._error)

    /* Wrap sending into a promise, both request.promise and send can fail... */
    return new Promise((resolve, reject) => {
      /* Get a unique request ID, and prepare our request */
      const id = this._getRequestId()
      const request = new WebSocketRequest(id)
      this._requests.set(id, request)

      /* Handle responses from the request first */
      request.promise.then(resolve, reject)

      /* Send our message to the server after the request promise is handled */
      try {
        this._socket.send(JSON.stringify({ id, query, params } satisfies Request))
      } catch (error) {
        reject(error)
      }
    })
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
  private readonly _connections = new Set<WebSocketConnection>()

  abstract query(text: string, params: (string | null)[]): Promise<PGConnectionResult>

  /** Return a unique request identifier to correlate responses */
  protected abstract _getUniqueRequestId(): string

  /**
   * Create a new WebSocket.
   *
   * This method can be asynchronous and can return a {@link Promise}. This is
   * due to the fact that in order to create our authentication token with the
   * Web Cryptography API, we need to _await_ the resolution of our token.
   *
   * This method should call _synchronously_ the {@link _connectWebSocket}
   * as soon as the WebSocket instance is created, in order to handle `open`,
   * `close`, or `error` events before the event loop has a chance to resolve
   * the {@link Promise} asynchronously.
   */
  protected abstract _getWebSocket(): Promise<PGWebSocket>

  /**
   * Handle the initial connection of a WebSocket.
   *
   * This method should be called _synchronously_ by {@link _getWebSocket} as
   * soon as the WebSocket instance is created.
   */
  protected _connectWebSocket<S extends PGWebSocket>(socket: S): Promise<S> {
    return new Promise<S>((resolve, reject) => {
    /* The socket might have already connected (or failed connecting) in the
         * time it takes for the event loop to resolve our promise... */
      if (socket.readyState === socket.OPEN) return resolve(socket)
      if (socket.readyState !== socket.CONNECTING) {
        return reject(new Error(`Invalid WebSocket ready state ${socket.readyState}`))
      }

      const onopen = (): void => {
        removeEventListeners()
        resolve(socket)
      }

      const onerror = (event: PGWebSocketErrorEvent): void => {
        removeEventListeners()
        if ('error' in event) return reject(event.error)
        reject(new Error('Uknown error opening WebSocket'))
      }

      const onclose = (event: PGWebSocketCloseEvent): void => {
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
  }

  async acquire(): Promise<WebSocketConnection> {
    const socket = await this._getWebSocket()

    /* Wrap the WebSocket into a _connection_, register and return it */
    const connection = new WebSocketConnectionImpl(socket, () => this._getUniqueRequestId())
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
