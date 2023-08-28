import assert from 'node:assert'

import { createPool } from 'generic-pool'

import { Connection } from './connection'

import type { Pool } from 'generic-pool'
import type { ConnectionOptions } from './connection'
import type { Logger } from './logger'

const connectionPool = Symbol.for('connectionPool')

export interface ConnectionPoolOptions extends ConnectionOptions {
  /** The minimum number of resources to keep in pool (default: `1`). */
  minConnections?: number,
  /** The maximum number of connections to create (default: `20`). */
  maxConnections?: number,
  /** The time a connection may sit idle in the pool (default: `120_000`) */
  idleTimeoutMillis?: number,
  /** The maximum number of queued requests allowed (default: `100`) */
  maxWaitingClients?: number,
  /** Time an acquire will wait for before timing out (default: `10_000`) */
  acquireTimeoutMillis?: number,
  /** Number of resources to check each eviction run (default: `5`) */
  numTestsPerEvictionRun?: number,
  /**  How often to run eviction checks (default: `30_000`) */
  evictionRunIntervalMillis?: number,
}

export interface ConnectionPoolStats {
  /** The number of minimum number of connections allowed by pool */
  min: number
  /** The number of maxixmum number of connections allowed by pool */
  max: number
  /** The number of connections in the pool regardless (free or in use) */
  size: number
  /** The number of unused connections in the pool */
  available: number
  /** The number of callers waiting to acquire a resource */
  pending: number
  /** The number of connections that are currently acquired by userland code */
  borrowed: number
}

export class ConnectionPool {
  public name: string

  private _options: ConnectionPoolOptions
  private _pool?: Pool<Connection>
  private _logger: Logger

  constructor(name: string, logger: Logger, options: ConnectionPoolOptions) {
    this.name = name
    this._options = options
    this._logger = logger

    logger.info(`Connection pool "${this.name}" created`)
  }

  get stats(): ConnectionPoolStats {
    assert(this._pool, `Connection pool "${this.name}" not running`)

    return {
      min: this._pool.min,
      max: this._pool.max,
      size: this._pool.size,
      available: this._pool.available,
      borrowed: this._pool.borrowed,
      pending: this._pool.pending,
    }
  }

  async start(): Promise<this> {
    // coverage ignore if
    if (this._pool) return this

    const { name, _logger: logger, _options: options } = this

    const {
      minConnections: min = 1,
      maxConnections: max = 20,
      maxWaitingClients = 100,
      acquireTimeoutMillis = 5_000,
      numTestsPerEvictionRun = 5,
      evictionRunIntervalMillis = 30_000,
      idleTimeoutMillis: softIdleTimeoutMillis = 120_000,
      ...connectionOptions
    } = options

    // Validate an initial connection
    const connection = await new Connection(name, logger, connectionOptions).connect()
    try {
      const valid = await connection.validate()
      // coverage ignore if
      if (! valid) throw new Error(`Unable to validate connection ${connection.id}`)
    } finally {
      connection.disconnect()
    }

    // Create our connection pool
    const pool = createPool<Connection>({
      destroy: async (connection) => connection.disconnect(),
      create: async (): Promise<Connection> => {
        // coverage ignore catch
        try {
          const connection = await new Connection(name, logger, connectionOptions).connect()
          return this._setPool(connection, pool)
        } catch (error) {
          // delay acquisition when connection can not be established...
          await new Promise((resolve) => setTimeout(resolve, 2_000))
          throw error
        }
      },
      validate: async (connection) => {
        this._logger.debug(`Validating connection "${connection.id}"`)
        const valid = await connection.validate()
        this._logger.debug(`Connection "${connection.id}" ${valid ? 'valid' : 'invalid'}`)
        return valid
      },
    }, {
      min,
      max,
      softIdleTimeoutMillis,
      maxWaitingClients,
      acquireTimeoutMillis,
      numTestsPerEvictionRun,
      evictionRunIntervalMillis,
      autostart: true,
      testOnBorrow: true,
      fifo: true,
    })

    await pool.ready()
    this._logger.info(`Connection pool "${this.name}" started`)
    this._pool = pool
    return this
  }

  private _setPool(connection: Connection, pool: Pool<Connection>): Connection {
    (connection as any)[connectionPool] = pool
    return connection
  }

  private _getPool(connection: Connection): Pool<Connection> | undefined {
    return (connection as any)[connectionPool]
  }

  async acquire(): Promise<Connection> {
    assert(this._pool, `Connection pool "${this.name}" not running`)

    const connection = await this._pool.acquire()
    this._logger.debug(`Acquired connection "${connection.id}"`)
    return connection
  }

  destroy(connection: Connection): Promise<void> {
    const pool = this._getPool(connection)
    assert(pool, `Unable to determine pool for connection "${this.name}"`)

    this._logger.debug(`Destroying connection "${connection.id}"`)
    return pool.destroy(connection)
  }

  release(connection: Connection, callback?: (error?: Error | void) => void): void {
    const pool = this._getPool(connection)
    assert(pool, `Unable to determine pool for connection "${this.name}"`)

    // coverage ignore next
    const cb = callback || ((e): void => {
      if (e) this._logger.error(`Error releasing connection "${connection.id}"`, e)
    })

    this._logger.debug(`Releasing connection "${connection.id}"`)
    connection.validate()
        .then((validated) => validated ?
          pool.release(connection) :
          pool.destroy(connection))
        .then(cb, cb)
  }

  releaseAsync(connection: Connection): Promise<void> {
    // coverage ignore next
    return new Promise((res, rej) => this.release(connection, (e) => e ? rej(e): res()))
  }

  async stop(): Promise<void> {
    // coverage ignore if
    if (! this._pool) return

    const pool = this._pool
    this._pool = undefined

    await pool.drain()
    await pool.clear()
    this._logger.info(`Connection pool "${this.name}" terminated`)
  }
}
