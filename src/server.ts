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
import type { Logger } from './logger'
import type { ConnectionPoolOptions } from './pool'

/* ========================================================================== *
 * EXPORTED TYPES                                                             *
 * ========================================================================== */

export interface ServerOptions extends HTTPOptions {
  host?: string,
  port?: number,
  backlog?: number,

  connections: {
    [ name: string ] : ConnectionPoolOptions & { secret: string }
  }
}

export interface Server {
  readonly address: AddressInfo,
  start(): Promise<Server>,
  stop(): Promise<void>,
}

/* ========================================================================== *
 * SERVER IMPLEMENTATION                                                      *
 * ========================================================================== */

// Keep this as a _weak map_, we don't want to expose secrets
const serverPools = new WeakMap<Server, Record<string, { secret: string, pool: ConnectionPool }>>()

class ServerImpl implements Server {
  private _options: HTTPOptions
  private _server?: HTTPServer
  private _logger: Logger

  private _backlog?: number
  private _host?: string
  private _port?: number

  constructor(logger: Logger, options: ServerOptions) {
    const { host, port, connections, ...serverOptions } = options

    const pools: Record<string, { secret: string, pool: ConnectionPool }> = {}

    for (const [ name, { secret, ...options } ] of Object.entries(connections)) {
      const pool = new ConnectionPool(name, logger, options)
      assert(secret, `No secret specified for pool "${name}"`)
      pools[name] = { secret, pool }
    }

    serverPools.set(this, pools)

    this._options = serverOptions
    this._logger = logger
    this._host = host
    this._port = port
  }

  get address(): AddressInfo {
    const address = this._server?.address() as AddressInfo
    assert(address, 'Server not started')
    return address
  }

  async start(): Promise<Server> {
    this._logger.debug('Starting server')

    // first of all, start and validate all connection pools
    for (const { pool } of Object.values(serverPools.get(this)!)) {
      await pool.start()
    }

    // then create our http server
    const server = createServer(this._options, (req, res) => this._postHandler(req, res))

    // deal with websockets creation
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (request, socket, head) => this._upgradeHandler(request, socket, head, wss))

    // listen, catching initial error and rejecting our promise
    await new Promise<void>((resolve, reject) => {
      server.on('error', reject)
      server.listen(this._port, this._host, this._backlog, () => {
        server.off('error', reject)
        resolve()
      })
    })

    // coverage ignore next // on normal errors try to stop the server
    server.on('error', (error) => {
      this._logger.error('Server Error', error)
      this.stop().catch((error) => this._logger.error('Error stopping server', error))
          .finally(() => process.exit(1)) // always exit!
    })

    // log, and remember this server
    this._server = server
    const { address, port } = this.address
    this._logger.info(`DB proxy server started at ${address}:${port}`)
    return this
  }

  async stop(): Promise<void> {
    // coverage ignore if
    if (! this._server) return

    const { address, port } = this.address
    const server = this._server
    this._server = undefined

    try {
      this._logger.info(`Stopping DB proxy server at "${address}:${port}"`)
      await new Promise<void>( /* coverage ignore next */ (res, rej) => {
        server.close((error) => error ? rej(error) : res())
      })
    } finally {
      Object.values(serverPools.get(this)!).forEach(({ pool }) => pool.stop())
    }
  }

  private _postHandler(request: HTTPRequest, response: HTTPResponse): void {
    Promise.resolve().then(async () => { // Run asynchronously from now on...
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
      let pool: ConnectionPool
      try {
        const [ _pool, statusCode ] = this._validateAuth(request)
        if (! _pool) {
          response.statusCode = statusCode
          return
        }
        pool = _pool
      } catch (error) {
        this._logger.error('Error validating authentication', error)
        response.statusCode = 405
        return
      }

      // Look after the payload
      const string = await this._readRequest(request)
      const { id, error, query, params } = this._validatePayload(string)
      response.statusCode = 400

      let data: string = ''
      if (error) {
        data = JSON.stringify({ id, error: error })
      } else if (query) {
        const connection = await pool.acquire()
        try {
          const result = await connection.query(query, params)
          response.statusCode = 200
          data = JSON.stringify({ ...result, id })
        } catch (error: any) {
          data = JSON.stringify({ id, error: 'SQL error', details: error?.message })
        } finally {
          pool.release(connection)
        }
      }

      // Respond with our response
      await new Promise<void>((resolve, reject) => {
        response.setHeader('content-type', 'application/json')
        response.write(data, /* coverage ignore next */ (err) => err ? reject(err) : resolve())
      })
    }).catch( /* coverage ignore next */ (error) => {
      this._logger.error(`Error handling request "${request.url}"`, error)
      response.statusCode = 500 // Internal server error...
    }).finally(() => response.end())
  }

  private _upgradeHandler(request: HTTPRequest, socket: Duplex, head: Buffer, wss: WebSocketServer): void {
    // Handle initial socket errors
    const onSocketError = (error: Error): void => {
      this._logger.error('Socket error', error)
      socket.destroy()
    }

    socket.on('error', onSocketError)

    // Authenticate and get our pool
    let pool: ConnectionPool
    try {
      const [ _pool, statusCode ] = this._validateAuth(request)
      if (! _pool) {
        socket.write(`HTTP/1.1 ${statusCode} ${STATUS_CODES[statusCode]}\r\n\r\n`)
        socket.destroy()
        return
      }
      pool = _pool
    } catch (error) {
      this._logger.error('Error validating authentication', error)
      socket.write(`HTTP/1.1 405 ${STATUS_CODES[405]}\r\n\r\n`)
      socket.destroy()
      return
    }

    // Let the WebSocketServer handle the upgrade
    socket.removeListener('error', onSocketError)
    wss.handleUpgrade(request, socket, head, (ws) => pool.acquire().then((connection) => {
      ws.on('error', (error) => {
        this._logger.error('WebSocket error', error)
        ws.close(500, 'WebSocket error')
        pool.release(connection)
      })

      ws.on('close', (code, reason) => {
        this._logger.info('WebSocket closed', code, reason.toString('utf-8'))
        pool.release(connection)
      })

      ws.on('message', (data) => {
        const { id, error, query, params } = this._validatePayload(data.toString('utf-8'))
        try {
          if (error) {
            ws.send(JSON.stringify({ id, error: error }))
          } else if (query) {
            connection.query(query, params).then((result) => {
              ws.send(JSON.stringify({ ...result, id }))
            }).catch((error) => {
              ws.send(JSON.stringify({ id, error: 'SQL error', details: error?.message }))
            })
          } else {
            ws.send(JSON.stringify({ id, error: 'Unknown error' }))
          }
        } catch (error: any) {
          ws.send(JSON.stringify({ id, error: 'SQL error', details: error?.message }))
        }
      })
    }))
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

  private _validatePayload(string: string): { id: string, query?: string, params?: any[], error?: string } {
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

  private _validateAuth(request: HTTPRequest):
  | [ pool: ConnectionPool, statusCode: 200 ]
  | [ pool: undefined, statusCode: 401 | 404 | 500 ] {
    // Create the URL we'll use to extract the pool name and auth string
    const path = request.url!.replaceAll(/\/+/g, '/')
    const url = new URL(path, 'http://localhost/')
    const name = url.pathname.substring(1)

    // Make sure that we have an "auth" query string parameter
    const auth = url.searchParams.get('auth')
    if (! auth) return [ undefined, 401 ] // No "auth", 401 (Unauthorized)

    // Make sure we have a pool associated with the request path
    const data = serverPools.get(this)?.[name]
    if (! data) return [ undefined, 404 ] // No pool, 404 (Not found)

    // Validate the auth against our stored service
    const { pool, secret } = data
    verifyToken(auth, secret, name)

    // TODO: token non-replication??
    return [ pool, 200 ]
  }
}

/* ========================================================================== *
 * EXPORT SERVER IMPLEMENTATION                                               *
 * ========================================================================== */

export const Server: {
  new (logger: Logger, options: ServerOptions): Server
} = ServerImpl
