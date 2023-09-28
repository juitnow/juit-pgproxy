import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { createServer, STATUS_CODES } from 'node:http'
import { resolve } from 'node:path'

import { ConnectionPool } from '@juit/pgproxy-pool'
import { WebSocketServer } from 'ws'

import { verifyToken } from './token'

import type {
  Connection,
  ConnectionPoolOptions,
  ConnectionPoolStats,
  Logger,
} from '@juit/pgproxy-pool'
import type {
  ServerOptions as HTTPOptions,
  IncomingMessage as HTTPRequest,
  ServerResponse as HTTPResponse,
  Server as HTTPServer,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import type { Response } from './index'

/* ========================================================================== *
 * EXPORTED TYPES                                                             *
 * ========================================================================== */

export interface ServerOptions extends HTTPOptions {
  /** The secret used to authenticate clients */
  secret: string,
  /** The path used to provide stats and a healthcheck via GET */
  healthCheck?: string,
  /** The address where this server will be bound to */
  address?: string,
  /** The port number where this server will be bound to */
  port?: number,
  /** The maximum length of the queue of pending connections */
  backlog?: number,
  /** Options for the connection pool backing this server */
  pool?: ConnectionPoolOptions
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

/** Internal type for an invalid payload */
interface PayloadError {
  valid: false,
  id: string,
  error: string,
  query?: never,
  params?: never,
}

/** Internal type for a payload validated successfully  */
interface PayloadQuery {
  valid: true,
  id: string,
  error?: never,
  query: string,
  params?: (string | null)[],
}

/** A validated payload */
type Payload = Readonly<PayloadError | PayloadQuery>

class ServerImpl implements Server {
  /* Keep those as private class members, they contain auth data... */
  readonly #tokens: Record<string, number> = {}
  readonly #pool: ConnectionPool
  readonly #secret: string

  private readonly _server: HTTPServer
  private readonly _logger: Logger

  private readonly _healthCheck: string | null
  private readonly _backlog?: number
  private readonly _address?: string
  private readonly _port?: number

  private _started: boolean = false
  private _stopped: boolean = false

  constructor(logger: Logger, options: ServerOptions) {
    const { address, port, backlog, secret, healthCheck, pool, ...serverOptions } = options

    this.#pool = new ConnectionPool(logger, pool)
    this.#secret = secret

    this._healthCheck = healthCheck ? resolve('/', healthCheck) : null
    this._backlog = backlog
    this._address = address
    this._logger = logger
    this._port = port

    /* Create our HTTP and WebSocket servers */
    this._server = createServer(serverOptions)
    const wss = new WebSocketServer({ noServer: true })

    /* Setup handlers */
    this._server.on('request', (req, res) => this._requestHandler(req, res))
    this._server.on('upgrade', (req, sock, head) => this._upgradeHandler(req, sock, head, wss))
    this._server.on('close', () => {
      wss.close((wssError) => {
        /* coverage ignore if */
        if (wssError) logger.error('Error closing WebSocket server:', wssError)
        /* coverage ignore catch */
        try {
          this.#pool.stop()
        } catch (poolError) {
          logger.error('Error closing connection pool:', poolError)
        } finally {
          this._logger.info('DB proxy server stopped')
        }
      })
    })
  }

  private _catchError(message: string): (error: any) => void {
    /* coverage ignore next */
    return (error) => this._logger.error(message, error)
  }

  /* ======================================================================== *
   * PROPERTIES                                                               *
   * ======================================================================== */

  get address(): AddressInfo {
    const address = this._server?.address() as AddressInfo
    assert(address, 'Server not started')
    return address
  }

  /* coverage ignore next */
  get url(): URL {
    const { address, family, port } = this.address
    if (family === 'IPv6') return new URL(`http://[${address}]:${port}/`)
    if (family === 'IPv4') return new URL(`http://${address}:${port}/`)
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

    /* We're doing this! */
    this._logger.debug('Starting server')

    /* First of all, start the connection pool */
    await this.#pool.start()

    /* Start listening, and catch initial error */
    await new Promise<void>((resolve, reject) => {
      this._server.on('error', reject)
      this._server.listen(this._port, this._address, this._backlog, () => {
        this._server.off('error', reject)
        resolve()
      })
    })

    /* On normal errors try to stop the server and exit */
    this._server.on('error', /* coverage ignore next */ (error) => {
      this._logger.error('Server Error:', error)
      this.stop()
          .catch(this._catchError('Error stopping server'))
          .finally(() => process.exit(1)) // always exit!
    })

    /* Start an timer that will periodically wipe tokens */
    setInterval(() => {
      const now = Date.now()
      for (const [ token, expiry ] of Object.entries(this.#tokens)) {
        /* coverage ignore if // all is hidden, hard to test */
        if (expiry < now) delete this.#tokens[token]
      }
    }).unref() // let the process die...

    /* We're done! */
    this._logger.info(`DB proxy server started at ${this.url}`)
    if (this._healthCheck) {
      this._logger.info(`Unauthenticated health check available at "${this._healthCheck}"`)
    }
    return this
  }

  async stop(): Promise<void> {
    assert(this._started, 'Server never started')
    assert(! this._stopped, 'Server already stopped')
    this._stopped = true

    const { address, port } = this.address

    this._logger.info(`Stopping DB proxy server at "${address}:${port}"`)
    await new Promise<void>( /* coverage ignore next */ (resolve, reject) => {
      this._server.close((error) => error ? reject(error) : resolve())
    })
  }

  /* ======================================================================== *
   * REQUEST HANDLING                                                         *
   * ======================================================================== */

  private _sendResponse(
      object: object,
      statusCode: number,
      request: HTTPRequest,
      response: HTTPResponse,
  ): void {
    new Promise<void>((resolve, reject) => {
      /* coverage ignore catch */
      try {
        const json = JSON.stringify(object)
        const buffer = Buffer.from(json, 'utf-8')

        response.statusCode = statusCode
        response.setHeader('content-type', 'application/json')
        response.setHeader('content-length', buffer.length)
        response.write(buffer, (error) => {
          if (error) /* coverage ignore next */ reject(error)
          else resolve()
        })
      } catch (error) {
        reject(error)
      }
    }).catch( /* coverage ignore next */ (error) => {
      this._logger.error(`Error handling request "${request.url}"`, error)
      response.statusCode = 500 // internal server error...
    }).finally(() => response.end())
  }

  private _healthCheckHandler(request: HTTPRequest, response: HTTPResponse): void {
    /* Check that the URL is the one specified in the options */
    if (request.url !== this._healthCheck) {
      response.statusCode = 404
      return void response.end()
    }

    void Promise.resolve().then(async () => {
      /* Calculate our latency to the database */
      let hrtime = process.hrtime.bigint()
      const connection = await this.#pool.acquire()
      try {
        await connection.query('SELECT now()')
      } finally {
        hrtime = process.hrtime.bigint() - hrtime
        this.#pool.release(connection)
      }

      /* Convert latency and stringify response */
      const latency = Number(hrtime) / 1000000
      return { ...this.stats, latency }
    }).then((data) => this._sendResponse(data, 200, request, response))
  }

  private _requestHandler(request: HTTPRequest, response: HTTPResponse): void {
    /* Health check on GET (if configured) */
    if (request.method === 'GET') return this._healthCheckHandler(request, response)

    /* Authorize requests to the pool */
    const statusCode = this._validateAuth(request)
    if (statusCode !== 200) {
      response.statusCode = statusCode
      return void response.end()
    }

    /* As a normal "request" we only accept POST */
    if (request.method !== 'POST') {
      response.statusCode = 405 // method not allowed
      return void response.end()
    }

    /* The only content type is JSON */
    if (request.headers['content-type'] !== 'application/json') {
      response.statusCode = 415 // unsupported media type
      return void response.end()
    }

    /* Run asynchronously for the rest of the processing */
    void Promise.resolve().then(async (): Promise<Response> => {
      /* Extract the payload from the request */
      const string = await this._readRequest(request)
      const payload = this._validatePayload(string)

      /* Check for validation errors */
      if (! payload.valid) {
        return { id: payload.id, statusCode: 400, error: payload.error }
      }

      /* Acquire the connection */
      let connection: Connection
      /* coverage ignore catch */
      try {
        connection = await this.#pool.acquire()
      } catch (error) {
        this._logger.error('Error acquiring connection:', error)
        return { id: payload.id, statusCode: 500, error: 'Error acquiring connection' }
      }

      /* Run the query */
      try {
        const result = await connection.query(payload.query, payload.params)
        return { ...result, statusCode: 200, id: payload.id }
      } catch (error: any) {
        return { id: payload.id, statusCode: 400, error: error.message }
      } finally {
        this.#pool.release(connection)
      }
    }).then((data) => this._sendResponse(data, data.statusCode, request, response))
  }

  private _upgradeHandler(request: HTTPRequest, socket: Duplex, head: Buffer, wss: WebSocketServer): void {
    /* Authenticate */
    const statusCode = this._validateAuth(request)
    if (statusCode !== 200) {
      /* coverage ignore next */
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

    /* Do the actual _upgrade_ of the socket */
    wss.handleUpgrade(request, socket, head, (ws) => {
      /* Eventually acquire a connection */
      const promise = this.#pool.acquire()
          .catch( /* coverage ignore next */ (error) => {
            this._logger.error('Error acquiring connection for WebSocket:', error)
            ws.close()
          })

      /* Eventually release */
      const release = (): void => void promise
          .then((connection) => connection && this.#pool.release(connection))
          .catch(this._catchError('Error releasing connection for WebSocket:'))

      /* Send data back over the websocket */
      const send = (data: Response): void => {
        const message = JSON.stringify(data)
        ws.send(message, (error) => {
          /* coverage ignore if */
          if (error) {
            this._logger.error('Error sending WebSocket response:', error)
            ws.close()
          }
        })
      }

      /* On websocket error, release the connection */
      ws.on('error', /* coverage ignore next */ (error) => {
        this._logger.error('WebSocket error', error)
        release()
      })

      /* On websocket close, release the connection */
      ws.on('close', (code, reason) => {
        const extra = reason.toString('utf-8')
        extra ?
          this._logger.info(`WebSocket closed (${code}):`, extra) :
          this._logger.info(`WebSocket closed (${code}):`)
        release()
      })

      /* On message, run a query and send results back */
      ws.on('message', (data) => {
        const payload = this._validatePayload(data.toString('utf-8'))
        if (! payload.valid) {
          send({ id: payload.id, statusCode: 400, error: payload.error })
        } else {
          promise.then(async (connection) => {
            /* coverage ignore if // If we have no connection, the promise
             * catcher has also already closed the websocket, just ignore */
            if (! connection) return
            try {
              const result = await connection.query(payload.query, payload.params)
              return send({ ...result, statusCode: 200, id: payload.id })
            } catch (error: any) {
              return send({ id: payload.id, statusCode: 400, error: error.message })
            }
          }).catch(this._catchError('Error querying in websocket'))
        }
      })
    })
  }

  /* ======================================================================== *
   * INTERNALS                                                                *
   * ======================================================================== */

  /**  Read the body of an HTTP request fully */
  private _readRequest(stream: HTTPRequest): Promise<string> {
    return new Promise<Buffer>((resolve, reject) => {
      const buffers: Buffer[] = []

      stream.on('error', /* coverage ignore next */ (error) => reject(error))
      stream.on('data', (buffer) => buffers.push(buffer))
      stream.on('end', () => resolve(Buffer.concat(buffers)))

      /* coverage ignore if */
      if (stream.isPaused()) stream.resume()
    }).then((buffer) => buffer.toString('utf-8'))
  }

  /** Parse a payload string as JSON and validate it */
  private _validatePayload(string: string): Payload {
    try {
      const payload = JSON.parse(string || '{}')
      const id = payload?.id ? `${payload.id}` : randomUUID()

      if (! payload?.query) {
        return { id, valid: false, error: 'Invalid payload (or query missing)' }
      }
      if (typeof payload.query !== 'string') {
        return { id, valid: false, error: 'Query is not a string' }
      }
      if (payload.params && (! Array.isArray(payload.params))) {
        return { id, valid: false, error: 'Parameters are not an array' }
      }

      return { id, valid: true, query: payload.query, params: payload.params }
    } catch (error) {
      return { id: randomUUID(), valid: false, error: 'Error parsing JSON' }
    }
  }

  /** Validate a request (it must have an "auth" query parameter) */
  private _validateAuth(request: HTTPRequest): 200 | 401 | 404 | 403 {
    /* Create the URL we'll use to extract the auth string */
    const path = request.url!.replaceAll(/\/+/g, '/')
    const url = new URL(path, 'http://localhost/')

    /* Make sure all requests are to the root path */
    if (url.pathname !== '/') return 404

    /* Make sure that we have an "auth" query string parameter */
    const auth = url.searchParams.get('auth')
    if (! auth) return 401 // No "auth", 401 (Unauthorized)

    try {
      /* Validate the auth against our stored secret */
      const token = verifyToken(auth, this.#secret)

      /* Token was already seen */
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
