import { createPool } from 'generic-pool'

import { Connection } from './connection'

import type { Pool } from 'generic-pool'
import type { ConnectionOptions } from './connection'

async function validateConnection(connection: Connection): Promise<boolean> {
  if (! connection.connected) return false
  try {
    const result = await connection.query('SELECT now()')
    return result.rowCount === 1
  } catch {
    return false
  }
}

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
  private _pool: Pool<Connection>

  constructor(options: ConnectionPoolOptions = {}) {
    const {
      minConnections: min = 1,
      maxConnections: max = 20,
      maxWaitingClients = 100,
      acquireTimeoutMillis = 10_000,
      numTestsPerEvictionRun = 5,
      evictionRunIntervalMillis = 30_000,
      idleTimeoutMillis: softIdleTimeoutMillis = 120_000,
      ...connectionOptions
    } = options

    this._pool = createPool<Connection>({
      create: () => new Connection(connectionOptions).connect(),
      destroy: async (connection) => connection.disconnect(),
      validate: validateConnection,
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
  }

  get stats(): ConnectionPoolStats {
    return {
      min: this._pool.min,
      max: this._pool.max,
      size: this._pool.size,
      available: this._pool.available,
      borrowed: this._pool.borrowed,
      pending: this._pool.pending,
    }
  }

  acquire(): Promise<Connection> {
    return this._pool.acquire()
  }

  destroy(connection: Connection): Promise<void> {
    return this._pool.destroy(connection)
  }

  async release(connection: Connection): Promise<void> {
    return await validateConnection(connection) ?
      await this._pool.release(connection) :
      await this._pool.destroy(connection)
  }

  async terminate(): Promise<void> {
    await this._pool.drain()
    await this._pool.clear()
  }
}
