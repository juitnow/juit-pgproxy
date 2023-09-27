import { PGClient } from '@juit/pgproxy-client'

import { Model } from './model'

import type { PGQueryable, PGResult, PGTransactionable } from '@juit/pgproxy-client'
import type { Registry } from '@juit/pgproxy-types'
import type { Schema } from './index'

/* ========================================================================== *
 * TYPES                                                                      *
 * ========================================================================== */

/**
 * A query interface guaranteeing that all operations will be performed on the
 * _same_ database connection (transaction safe)
 */
export interface Connection<S extends Schema> extends PGTransactionable {
  /**
   * Return the {@link Model} view associated with the specified table.
   *
   * All operations performed by this {@link Model} will share the same
   * {@link Connection} (transaction safe).
   */
  in<Table extends keyof S & string>(table: Table): Model<S[Table]>
}

/** A consumer for a {@link Connection} */
export type Consumer<S extends Schema, T> = (connection: Connection<S>) => T | PromiseLike<T>

/** Our main `Persister` interface */
export interface Persister<S extends Schema> extends PGClient {
  /** The schema associated with this instance */
  readonly schema: S

  /** Ping... Just ping the database. */
  ping(): Promise<void>;

  /**
   * Connect to the database to execute a number of different queries.
   *
   * The `consumer` will be passed a {@link Connection} instance backed by the
   * _same_ connection to the database, therefore transactions can be safely
   * executed in the context of the consumer function itself.
   */
  connect<T>(consumer: Consumer<S, T>): Promise<T>

  /**
   * Return the {@link Model} view associated with the specified table.
   *
   * All operations performed by this {@link Model} will potentially use
   * different connections to the database (not transaction safe).
   */
  in<Table extends keyof S & string>(table: Table): Model<S[Table]>
}

/** Constructor for {@link Persister} instances */
export interface PersisterConstructor {
  new <S extends Schema>(schema?: S): Persister<S>
  new <S extends Schema>(client: PGClient, schema?: S): Persister<S>
  new <S extends Schema>(url: string | URL, schema?: S): Persister<S>

  /**
   * Return a {@link Persister} constructor always associated with the given
   * schema
   */
  with<S extends Schema>(schema: S): {
    new(): Persister<S>
    new(client: PGClient): Persister<S>
    new(url: string | URL): Persister<S>
  }
}

/* ========================================================================== *
 * IMPLEMENTATION                                                             *
 * ========================================================================== */

class ConnectionImpl<S extends Schema> implements Connection<S> {
  constructor(
      private _queryable: PGQueryable,
      private _schema: S,
  ) {}

  async begin(): Promise<this> {
    await this._queryable.query('BEGIN')
    return this
  }

  async commit(): Promise<this> {
    await this._queryable.query('COMMIT')
    return this
  }

  async rollback(): Promise<this> {
    await this._queryable.query('ROLLBACK')
    return this
  }

  query(text: string, params: any[] | undefined = []): Promise<PGResult> {
    return this._queryable.query(text, params)
  }

  in<T extends keyof S & string>(table: T): Model<S[T]> {
    return new Model(this, table, this._schema)
  }
}

class PersisterImpl<S extends Schema> implements PGClient, Persister<S> {
  private _client: PGClient
  private _schema: S

  constructor(schema?: S)
  constructor(client: PGClient, schema?: S)
  constructor(url: string | URL, schema?: S)
  constructor(urlOrSchema?: string | URL | PGClient | S, maybeSchema?: S) {
    if (! urlOrSchema) {
      this._client = new PGClient()
    } else if (typeof urlOrSchema === 'string') {
      this._client = new PGClient(urlOrSchema)
    } else if (('href' in urlOrSchema) && (typeof urlOrSchema.href === 'string')) {
      this._client = new PGClient(urlOrSchema as URL)
    } else if (('query' in urlOrSchema) && (typeof urlOrSchema.query === 'function')) {
      this._client = urlOrSchema as PGClient
    } else {
      this._client = new PGClient()
      maybeSchema = urlOrSchema as S
    }

    if (maybeSchema) this._schema = maybeSchema
    else this._schema = {} as S
  }

  get schema(): S {
    return this._schema
  }

  get registry(): Registry {
    return this._client.registry
  }

  async ping(): Promise<void> {
    await this.query('SELECT now()')
  }

  async query(text: string, params: any[] | undefined = []): Promise<PGResult> {
    const result = this._client.query(text, params)
    return result
  }

  async destroy(): Promise<void> {
    await this._client.destroy()
  }

  async connect<T>(consumer: Consumer<S, T>): Promise<T> {
    const result = await this._client.connect((c) => consumer(new ConnectionImpl(c, this._schema)))
    return result
  }

  in<T extends keyof S & string>(table: T): Model<S[T]> {
    return new Model(this, table, this._schema)
  }

  static with<S extends Schema>(schema: S): {
    new(): Persister<S>
    new(client: PGClient): Persister<S>
    new(url: string | URL): Persister<S>
  } {
    return class extends PersisterImpl<S> {
      constructor()
      constructor(client: PGClient)
      constructor(url: string | URL)
      constructor(arg?: PGClient | URL | string) {
        super(arg as string, schema)
      }
    }
  }
}

/* ========================================================================== *
 * EXPORTS                                                                    *
 * ========================================================================== */

export const Persister: PersisterConstructor = PersisterImpl
