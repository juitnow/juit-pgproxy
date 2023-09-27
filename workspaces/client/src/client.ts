import { Registry, serialize } from '@juit/pgproxy-types'

import { assert } from './assert'
import { createProvider } from './provider'
import { PGResult } from './result'

import type { PGConnection, PGProvider } from './provider'

function serializeParams(params: any[]): (string | null)[] {
  if (params.length == 0) return []

  const result: (string | null)[] = new Array(params.length)
  for (let i = 0; i < params.length; i ++) {
    result[i] =
      params[i] === undefined ? null :
      params[i] === null ? null :
      serialize(params[i])
  }

  return result
}

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

/**
 * An interface for an object that can execute queries _and transactions_
 * on a database */
export interface PGTransactionable extends PGQueryable {
  /** Start a transaction by issuing a `BEGIN` statement */
  begin(): Promise<this>
  /** Commit a transaction by issuing a `COMMIT` statement */
  commit(): Promise<this>
  /** Cancel a transaction by issuing a `ROLLBACK` statement */
  rollback(): Promise<this>
}


/** A consumer for a {@link PGTransactionable} connection */
export type PGConsumer<T> = (connection: PGTransactionable) => T | PromiseLike<T>

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
   * The `consumer` will be passed a {@link PGTransactionable} instance backed
   * by the _same_ connection to the database, therefore transactions can be
   * safely executed in the context of the consumer function itself.
   */
  connect<T>(consumer: PGConsumer<T>): Promise<T>

  /**
   * Destroy any resource and underlying connection associated with this
   * instance's {@link PGProvider}.
   */
  destroy(): Promise<void>
}

/** A constructor for {@link PGClient} instances */
export interface PGClientConstructor {
  new (url?: string | URL): PGClient
  new (provider: PGProvider<PGConnection>): PGClient
}

/** The PostgreSQL client */
export const PGClient: PGClientConstructor = class PGClientImpl implements PGClient {
  readonly registry: Registry = new Registry()

  private _provider: PGProvider<PGConnection>

  constructor(url?: string | URL)
  constructor(provider: PGProvider<PGConnection>)
  constructor(urlOrProvider?: string | URL | PGProvider<PGConnection>) {
    urlOrProvider = urlOrProvider || globalThis?.process?.env?.PGURL
    assert(urlOrProvider, 'No URL to connect to (PGURL environment variable missing?)')
    if (typeof urlOrProvider === 'string') urlOrProvider = new URL(urlOrProvider)
    assert(urlOrProvider, 'Missing URL or provider for client')

    this._provider = urlOrProvider instanceof URL ?
        createProvider(urlOrProvider) :
        urlOrProvider
  }

  async query(text: string, params: any[] = []): Promise<PGResult> {
    const result = await this._provider.query(text, serializeParams(params))
    return new PGResult(result, this.registry)
  }

  async connect<T>(consumer: PGConsumer<T>): Promise<T> {
    const connection = await this._provider.acquire()

    try {
      const registry = this.registry

      const consumable: PGTransactionable = {
        async query(text: string, params: any[] = []): Promise<PGResult> {
          const result = await connection.query(text, serializeParams(params))
          return new PGResult(result, registry)
        },
        async begin(): Promise<PGTransactionable> {
          await this.query('BEGIN')
          return this
        },
        async commit(): Promise<PGTransactionable> {
          await this.query('COMMIT')
          return this
        },
        async rollback(): Promise<PGTransactionable> {
          await this.query('ROLLBACK')
          return this
        },
      }

      return await consumer(consumable)
    } finally {
      await this._provider.release(connection)
    }
  }

  async destroy(): Promise<void> {
    return await this._provider.destroy()
  }
}
