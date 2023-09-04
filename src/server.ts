import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { createServer, STATUS_CODES } from 'node:http'

import { WebSocketServer } from 'ws'

import { ConnectionPool } from './pool'
import { verifyToken } from './token'

import type {
  ServerOptions as HTTPOptions,
  IncomingMessage as HTTPRequest,
  ServerResponse as HTTPResponse,
  Server as HTTPServer,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import type { Connection } from './connection'
import type { Response } from './index'
import type { Logger } from './logger'
import type { ConnectionPoolOptions, ConnectionPoolStats } from './pool'

/* ========================================================================== *
 * EXPORTED TYPES                                                             *
 * ========================================================================== */

export interface ServerOptions extends HTTPOptions {
  host?: string,
  port?: number,
  backlog?: number,

  pool: ConnectionPoolOptions & { secret: string }
}

export interface Server {
  readonly url: URL,
  readonly address: AddressInfo,
  readonly stats: ConnectionPoolStats,

  start(): Promise<Server>,
  stop(): Promise<void>,
}

/* ========================================================================== *
 * SERVER IMPLEMENTATION                                                      *
 * ========================================================================== */

interface PayloadError {
  id: string,
  error: string,
  query?: never,
  params?: never,
}

interface PayloadQuery {
  id: string,
  error?: never,
  query: string,
  params?: any[],
}

type Payload = Readonly<PayloadError | PayloadQuery>

class ServerImpl implements Server {
  readonly #tokens: Record<string, number> = {}
  readonly #pool: ConnectionPool
  readonly #secret: string

  private readonly _server: HTTPServer
  private readonly _logger: Logger

  private readonly _backlog?: number
  private readonly _host?: string
  private readonly _port?: number

  private _started: boolean = false
  private _stopped: boolean = false

  constructor(logger: Logger, options: ServerOptions) {
    const { host, port, backlog, pool: poolOptions, ...serverOptions } = options

    const { secret, ...pool } = poolOptions
    this.#pool = new ConnectionPool(logger, pool)
    this.#secret = secret

    this._backlog = backlog
    this._logger = logger
    this._host = host
    this._port = port

    this._server = createServer(serverOptions, (req, res) => this._postHandler(req, res))
  }

  /* ======================================================================== *
   * PROPERTIES                                                               *
   * ======================================================================== */

  get address(): AddressInfo {
    const address = this._server?.address() as AddressInfo
    assert(address, 'Server not started')
    return address
  }

  get url(): URL {
    const { address, family, port } = this.address
    if (family === 'IPv6') return new URL(`http://[${address}]:${port}/`)
    if (family === 'IPv4') return new URL(`http://${address}:${port}/`)
    /* coverage ignore next */
    throw new Error(`Unsupported address family "${family}"`)
  }

  get stats(): ConnectionPoolStats {
    return this.#pool.stats
  }

  /* ======================================================================== *
   * LIFECYCLE METHODS                                                        *
   * ======================================================================== */

  async start(): Promise<Server> {
    assert(! this._started, 'Server already started')
    this._started = true

    this._logger.debug('Starting server')

    // first of all, start the connection pool
    await this.#pool.start()

    // deal with websockets creation
    const wss = new WebSocketServer({ noServer: true })
    this._server.on('upgrade', (request, socket, head) => this._upgradeHandler(request, socket, head, wss))

    // listen, catching initial error and rejecting our promise
    await new Promise<void>((resolve, reject) => {
      this._server.on('error', reject)
      this._server.listen(this._port, this._host, this._backlog, () => {
        this._server.off('error', reject)
        resolve()
      })
    })

    // coverage ignore next // on normal errors try to stop the server
    this._server.on('error', (error) => {
      this._logger.error('Server Error', error)
      this.stop()
          .catch((error) => this._logger.error('Error stopping server', error))
          .finally(() => process.exit(1)) // always exit!
    })

    // log, and remember this server
    this._logger.info(`DB proxy server started at ${this.url}`)
    return this
  }

  async stop(): Promise<void> {
    assert(this._started, 'Server never started')
    assert(! this._stopped, 'Server already stopped')
    this._stopped = true

    const { address, port } = this.address

    try {
      this._logger.info(`Stopping DB proxy server at "${address}:${port}"`)
      await new Promise<void>( /* coverage ignore next */ (res, rej) => {
        this._server.close((error) => error ? rej(error) : res())
      })
    } finally {
      this.#pool.stop()
    }
  }

  /* ======================================================================== *
   * REQUEST HANDLING                                                         *
   * ======================================================================== */

  private _postHandler(request: HTTPRequest, response: HTTPResponse): void {
    Promise.resolve().then(async (): Promise<void> => {
      // As a normal "request" we only accept POST
      if (request.method !== 'POST') {
        response.statusCode = 405 // method not allowed
        return
      }

      // The only content type is JSON
      if (request.headers['content-type'] !== 'application/json') {
        response.statusCode = 415 // unsupported media type
        return
      }

      // Authorize requests to the pool
      const statusCode = this._validateAuth(request)
      if (statusCode !== 200) {
        response.statusMessage = STATUS_CODES[statusCode]!
        response.statusCode = statusCode
        return
      }

      // Extract the payload from the request
      const string = await this._readRequest(request)
      const payload = this._validatePayload(string)

      // Sending handler
      const send = (data: Response): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
          /* coverage ignore catch */
          try {
            const message = JSON.stringify(data)
            response.statusCode = data.statusCode
            response.setHeader('content-type', 'application/json')
            response.write(message, (error) => {
              /* coverage ignore if */
              if (error) reject(error)
              else resolve()
            })
          } catch (error) {
            reject(error)
          }
        })
      }

      // Check validated payload for errors
      if (payload.error) {
        return send({ id: payload.id, statusCode: 400, error: payload.error })
      } else if (! payload.query) /* coverage ignore next */ {
        return send({ id: payload.id, statusCode: 500, error: 'Unknown payload error' })
      }

      // Acquire the connection
      let connection: Connection
      try {
        connection = await this.#pool.acquire()
      } catch (error) {
        this._logger.error('Error acquiring connection:', error)
        return send({ id: payload.id, statusCode: 500, error: 'Error acquiring connection' })
      }

      // Run the query
      try {
        const result = await connection.query(payload.query, payload.params)
        return send({ ...result, statusCode: 200, id: payload.id })
      } catch (error: any) {
        return send({ id: payload.id, statusCode: 400, error: error.message })
      } finally {
        this.#pool.release(connection)
      }
    }).catch( /* coverage ignore next */ (error) => {
      this._logger.error(`Error handling request "${request.url}"`, error)
      response.statusCode = 500 // Internal server error...
    }).finally(() => response.end())
  }

  private _upgradeHandler(request: HTTPRequest, socket: Duplex, head: Buffer, wss: WebSocketServer): void {
    // Authenticate and get our pool
    const statusCode = this._validateAuth(request)
    if (statusCode !== 200) {
      const onSocketError = (error: Error): void => {
        this._logger.error('Socket error', error)
        socket.destroy()
      }

      socket.on('error', onSocketError)
      socket.write(`HTTP/1.1 ${statusCode} ${STATUS_CODES[statusCode]}\r\n\r\n`)
      socket.destroy()
      socket.off('error', onSocketError)
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      /* Eventually acquire a connection */
      const promise = this.#pool.acquire().catch((error) => {
        this._logger.error('Error acquiring connection for WebSocket:', error)
        ws.close()
      })

      const release = (): void => void promise
          .then((connection) => connection && this.#pool.release(connection))
          .catch((error) => this._logger.error('Error releasing connection for WebSocket:', error))

      const send = (data: Response): void => {
        const message = JSON.stringify(data)
        ws.send(message, (error) => {
          this._logger.error('Error sending WebSocket response:', error)
          ws.close()
        })
      }

      ws.on('error', (error) => {
        this._logger.error('WebSocket error', error)
        release()
      })

      ws.on('close', (code, reason) => {
        this._logger.info(`WebSocket closed (${code}):`, reason.toString('utf-8'))
        release()
      })

      ws.on('message', (data) => {
        const payload = this._validatePayload(data.toString('utf-8'))
        if (payload.error) {
          send({ id: payload.id, statusCode: 400, error: payload.error })
        } else if (! payload.query) {
          send({ id: payload.id, statusCode: 500, error: 'Unknown payload error' })
        } else {
          void promise.then(async (connection) => {
            if (! connection) return // the promise catcher already closed "ws"
            try {
              const result = await connection.query(payload.query, payload.params)
              return send({ ...result, statusCode: 200, id: payload.id })
            } catch (error: any) {
              return send({ id: payload.id, statusCode: 400, error: error.message })
            }
          })
        }
      })
    })
  }

  private _readRequest(stream: HTTPRequest): Promise<string> {
    return new Promise<Buffer>( /* coverage ignore next */ (res, rej) => {
      const buffers: Buffer[] = []

      stream.on('data', (buffer) => buffers.push(buffer))
      stream.on('error', (error) => rej(error))
      stream.on('end', () => res(Buffer.concat(buffers)))

      if (stream.isPaused()) stream.resume()
    }).then((buffer) => buffer.toString('utf-8'))
  }

  /* ======================================================================== *
   * VALIDATORS                                                               *
   * ======================================================================== */

  private _validatePayload(string: string): Payload {
    try {
      const payload = JSON.parse(string)
      const id = payload?.id ? `${payload.id}` : randomUUID()

      if (! payload?.query) return { id, error: 'Invalid payload (or query missing)' }
      if (typeof payload.query !== 'string') return { id, error: 'Query is not a string' }
      if (! Array.isArray(payload.params)) return { id, error: 'Parameters are not an array' }
      return { id, query: payload.query, params: payload.params }
    } catch (error) {
      return { id: randomUUID(), error: 'Error parsing JSON' }
    }
  }

  private _validateAuth(request: HTTPRequest): 200 | 401 | 404 | 403 {
    // Create the URL we'll use to extract the pool name and auth string
    const path = request.url!.replaceAll(/\/+/g, '/')
    const url = new URL(path, 'http://localhost/')

    // Make sure all requests are to the root path
    if (url.pathname !== '/') return 404

    // Make sure that we have an "auth" query string parameter
    const auth = url.searchParams.get('auth')
    if (! auth) return 401 // No "auth", 401 (Unauthorized)

    // Make sure we have a pool associated with the request path
    // const data = serverPools.get(this)?.[name]
    // if (! data) return [ undefined, 404 ] // No pool, 404 (Not found)

    // Validate the auth against our stored service
    // const { pool, secret } = data
    try {
      const token = verifyToken(auth, this.#secret)

      if (token in this.#tokens) {
        this._logger.error('Attempted to reuse an existing token')
        return 403
      }

      this.#tokens[token] = Date.now() + 60_000 // expiry is 10 sec, but use 60
      return 200
    } catch (error) {
      this._logger.error(error)
      return 403
    }
  }
}

/* ========================================================================== *
 * EXPORT SERVER IMPLEMENTATION                                               *
 * ========================================================================== */

export const Server: {
  new (logger: Logger, options: ServerOptions): Server
} = ServerImpl
