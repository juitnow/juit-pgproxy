import { Registry, serialize } from '@juit/pgproxy-types'

import { assert } from './assert'
import { createProvider } from './provider'
import { PGResult } from './result'

import type { PGProvider, PGProviderConnection } from './provider'

function serializeParams(params: readonly any[]): (string | null)[] {
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

/**
 * Options to create a `PGClient`
 *
 * As an alternative to using URLs, a `PGClient` can be instantiated with
 * options passed in this object.
 */
export interface PGClientOptions {
  /** The protocol used to connect to the database (defaults to "psql") */
  readonly protocol?: string
  /** The PostgreSQL database to connect to */
  readonly database?: string
  /** The user to authenticate as */
  readonly username?: string
  /** The password to use for authentication */
  readonly password?: string
  /** The host to connect to */
  readonly host?: string
  /** The port to connect to */
  readonly port?: number
  /** Any additional options to pass to the provider */
  readonly parameters?: Record<string, string | number | boolean>
}

/** An interface representing a SQL query to a database */
export interface PGQuery {
  /** The SQL query to execute optionally containing placeholders. */
  readonly query: string
  /** Any parameter replacement for `$x` placeholders. */
  readonly params?: readonly any[]
}

/** An interface for an object that can execute queries on a database */
export interface PGQueryable {
  /**
   * Execute a query on the database
   *
   * @param text - The SQL query to execute optionally containing placeholders.
   * @param params - Any parameter replacement for `$x` placeholders.
   */
  query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(text: string, params?: readonly any[]): Promise<PGResult<Row, Tuple>>

  /**
   * Execute a query on the database
   *
   * @param query - An object containing the query (both the SQL string and its
   *                related parameters) to execute
   */
  query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(query: PGQuery): Promise<PGResult<Row, Tuple>>
}

/**
 * An interface for an object that can execute queries _and transactions_
 * on a database
 */
export interface PGTransactionable extends PGQueryable {
  /**
   * Start a transaction by issuing a `BEGIN` statement
   *
   * @returns `true` if a transaction was created, or `false` if `begin()` was
   *          already called and a transaction was already started.
   */
  begin(): Promise<boolean>
  /** Commit a transaction by issuing a `COMMIT` statement */
  commit(): Promise<void>
  /** Cancel a transaction by issuing a `ROLLBACK` statement */
  rollback(): Promise<void>
}

/**
 * A connection to a database that can be asynchronously disposed of.
 */
export interface PGConnection extends PGTransactionable, AsyncDisposable {
  /** Forcedly close the underlying connection to the database */
  close(): Promise<void>
}

/** A consumer for a {@link PGTransactionable} connection */
export type PGConsumer<T> = (connection: PGTransactionable) => T | PromiseLike<T>

/** The PostgreSQL client */
export interface PGClient extends PGQueryable, AsyncDisposable {
  /** The {@link @juit/pgproxy-types#Registry} used to parse results from PostgreSQL */
  readonly registry: Registry
  /** The URL used to create this provider, devoid of any credentials */
  readonly url: Readonly<URL>

  /**
   * Execute a _single_ query on the database.
   *
   * Invoking the `query` method on a {@link (PGClient:interface)} does NOT
   * guarantee that the query will be executed on the same connection, therefore
   * things like _transactions_ will be immediately rolled back after the query.
   *
   * @param text - The SQL query to execute optionally containing placeholders.
   * @param params - Any parameter replacement for `$x` placeholders.
   */
  query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(text: string, params?: readonly any[]): Promise<PGResult<Row, Tuple>>

  /**
   * Execute a _single_ query on the database.
   *
   * Invoking the `query` method on a {@link (PGClient:interface)} does NOT
   * guarantee that the query will be executed on the same connection, therefore
   * things like _transactions_ will be immediately rolled back after the query.
   *
   * @param query - An object containing the query (both the SQL string and its
   *                related parameters) to execute
   */
  query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(query: PGQuery): Promise<PGResult<Row, Tuple>>

  /**
   * Connect to the database and return an _async disposable_
   * {@link PGConnection}.
   */
  connect(): Promise<PGConnection>

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

/** A constructor for {@link (PGClient:interface)} instances */
export interface PGClientConstructor {
  new (url?: string | URL): PGClient
  new (provider: PGProvider): PGClient
  new (options: PGClientOptions): PGClient
}

/**
 * The PostgreSQL client
 */
export const PGClient: PGClientConstructor = class PGClientImpl implements PGClient {
  #registry: Registry = new Registry()
  #provider: PGProvider

  constructor(url?: string | URL)
  constructor(provider: PGProvider)
  constructor(options: PGClientOptions)
  constructor(arg?: string | URL | PGClientOptions | PGProvider) {
    // If `arg` is falsy (empty strong or nullish), use the `PGURL` environment
    arg = arg || ((globalThis as any)?.process?.env?.PGURL as string | undefined)
    assert(arg, 'No URL to connect to (PGURL environment variable missing?)')

    // If `arg` is a string, convert it to a URL (relative to `psql:///`)
    if (typeof arg === 'string') arg = new URL(arg, 'psql:///')
    assert(arg, 'Missing URL or provider for client')

    // If `arg` is an URL, fill in username and password from environment
    // variables (unless specified) and create a provider from it
    if ('href' in arg) {
      if (!(arg.username || arg.password)) {
        const username = ((globalThis as any)?.process?.env?.PGUSER as string | undefined) || ''
        const password = ((globalThis as any)?.process?.env?.PGPASSWORD as string | undefined) || ''
        arg.username = encodeURIComponent(username)
        arg.password = encodeURIComponent(password)
      }
      this.#provider = createProvider(arg)

    // If `arg` is a PGProvider _already_, then use it directly
    } else if (('query' in arg) && ('acquire' in arg) && ('release' in arg)) {
      this.#provider = arg

    // If `arg` is an object, convert it to a URL and create a provider from it
    } else {
      const {
        protocol = 'psql',
        database = '',
        username = ((globalThis as any)?.process?.env?.PGUSER as string | undefined),
        password = ((globalThis as any)?.process?.env?.PGPASSWORD as string | undefined),
        host = 'localhost',
        port,
        parameters = {},
      } = arg

      const url = new URL(`${protocol}://`)
      if (host) url.hostname = host
      if (port) url.port = String(port)
      if (username) url.username = encodeURIComponent(username)
      if (password) url.password = encodeURIComponent(password)
      url.pathname = `/${database}`

      for (const [ key, value ] of Object.entries(parameters)) {
        url.searchParams.set(key, String(value))
      }

      this.#provider = createProvider(url)
    }
  }

  get registry(): Registry {
    return this.#registry
  }

  get url(): Readonly<URL> {
    return this.#provider.url
  }

  async query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(text: string, params?: readonly any[]): Promise<PGResult<Row, Tuple>>

  async query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(query: PGQuery): Promise<PGResult<Row, Tuple>>

  async query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(textOrQuery: string | PGQuery, maybeParams: readonly any[] = []): Promise<PGResult<Row, Tuple>> {
    const [ text, params = [] ] = typeof textOrQuery === 'string' ?
      [ textOrQuery, maybeParams ] : [ textOrQuery.query, textOrQuery.params ]

    const result = await this.#provider.query(text, serializeParams(params))
    return new PGResult<Row, Tuple>(result, this.#registry)
  }

  async connect<T>(consumer?: PGConsumer<T>): Promise<T | PGConnection> {
    const connection = await this.#provider.acquire()

    if (! consumer) {
      return new PGConnectionImpl(connection, this.#provider, this.#registry)
    } else {
      await using conn = new PGConnectionImpl(connection, this.#provider, this.#registry)
      return await consumer(conn)
    }
  }

  async destroy(): Promise<void> {
    return await this.#provider.destroy()
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy()
  }
}

/* ===== INTERNAL IMPLEMENTATIONS =========================================== */

class PGConnectionImpl implements PGConnection {
  #transaction: boolean = false
  #connection: PGProviderConnection
  #provider: PGProvider
  #registry: Registry

  constructor(
      connection: PGProviderConnection,
      provider: PGProvider,
      registry: Registry) {
    this.#connection = connection
    this.#provider = provider
    this.#registry = registry
  }

  async query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(textOrQuery: string | PGQuery, maybeParams: readonly any[] = []): Promise<PGResult<Row, Tuple>> {
    const [ text, params = [] ] = typeof textOrQuery === 'string' ?
      [ textOrQuery, maybeParams ] : [ textOrQuery.query, textOrQuery.params ]

    const result = await this.#connection.query(text, serializeParams(params))
    return new PGResult(result, this.#registry)
  }

  async begin(): Promise<boolean> {
    if (this.#transaction) return false
    await this.#connection.query('BEGIN')
    return this.#transaction = true
  }

  async commit(): Promise<void> {
    await this.#connection.query('COMMIT')
    this.#transaction = false
  }

  async rollback(): Promise<void> {
    await this.#connection.query('ROLLBACK')
    this.#transaction = false
  }

  async close(): Promise<void> {
    if (this.#transaction) await this.#connection.query('ROLLBACK')
    await this.#provider.release(this.#connection)
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close()
  }
}
