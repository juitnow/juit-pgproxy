import { Registry, serialize } from '@juit/pgproxy-types'

import { createProvider } from './provider'
import { PGResult } from './result'

import type { PGProvider } from './provider'

/** An interface for an object that can execute queries on a database */
export interface PGQueryable {
  /**
   * Execute a query on the database
   *
   * @param text The SQL query to execute optionally containing placeholders.
   * @param params Any parameter replacement for `$x` placeholders.
   */
  query(text: string, params?: any[]): Promise<PGResult>
}

/** A consumer for a {@link PGQueryable} connection */
export type PGConsumer<T> = (connection: PGQueryable) => T | PromiseLike<T>

/** The PostgreSQL client */
export interface PGClient extends PGQueryable {
  /** The {@link Registry} used to parse results from PostgreSQL */
  readonly registry: Registry

  /**
   * Execute a _single_ query on the database.
   *
   * Invoking the `query` method on a {@link PGClient} does NOT guarantee that
   * the query will be executed on the same connection, therefore things like
   * _transactions_ will be immediately rolled back after the query.
   *
   * @param text The SQL query to execute optionally containing placeholders.
   * @param params Any parameter replacement for `$x` placeholders.
   */
  query(text: string, params?: any[]): Promise<PGResult>

  /**
   * Connect to the database to execute a number of different queries.
   *
   * The `consumer` will be passed a {@link PGQueryable} instance backed by the
   * _same_ connection to the database, therefore transactions can be safely
   * executed in the context of the consumer function itself.
   */
  connect<T>(consumer: PGConsumer<T>): Promise<T>
}

/** A constructor for {@link PGClient} instances */
export interface PGClientConstructor {
  new (url?: string | URL): PGClient
}

/** The PostgreSQL client */
export const PGClient: PGClientConstructor = class PGClientImpl implements PGClient {
  readonly registry: Registry = new Registry()
  private _provider: PGProvider

  constructor(url?: string | URL) {
    if (! url) url = (globalThis as any)?.process?.env?.PG_URL
    if (! url) throw new Error('No URL for connection (forgot the PG_URL variable?)')
    if (typeof url === 'string') url = new URL(url)
    this._provider = createProvider(url)
  }

  async query(text: string, params?: any[]): Promise<PGResult> {
    const converted = params ? params.map(serialize) : []

    const result = await this._provider.query(text, converted)
    return new PGResult(result, this.registry)
  }

  async connect<T>(consumer: PGConsumer<T>): Promise<T> {
    const connection = await this._provider.acquire()

    const queryable: PGQueryable = {
      query: async (text: string, params?: any[]): Promise<PGResult> => {
        const converted = params ? params.map(serialize) : []
        const result = await connection.query(text, converted)
        return new PGResult(result, this.registry)
      },
    }

    try {
      return await consumer(queryable)
    } finally {
      await this._provider.release(connection)
    }
  }
}
