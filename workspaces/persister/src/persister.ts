import { PGClient } from '@juit/pgproxy-client'

import { Model } from './model'

import type { PGQueryable, PGResult, PGTransactionable } from '@juit/pgproxy-client'
import type { Registry } from '@juit/pgproxy-types'
import type { Schema } from './index'

/* ========================================================================== *
 * TYPES                                                                      *
 * ========================================================================== */

export interface Connection<S extends Schema> extends PGTransactionable {
  in<Table extends keyof S & string>(table: Table): Model<S[Table]>
}

export type Consumer<S extends Schema, T> = (connection: Connection<S>) => T | PromiseLike<T>

export interface Persister<S extends Schema> extends PGClient {
  readonly schema: S

  connect<T>(consumer: Consumer<S, T>): Promise<T>

  in<Table extends keyof S & string>(table: Table): Model<S[Table]>
}

export interface PersisterConstructor {
  new <S extends Schema>(schema?: S): Persister<S>
  new <S extends Schema>(client: PGClient, schema?: S): Persister<S>
  new <S extends Schema>(url: string | URL, schema?: S): Persister<S>

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

  query(text: string, params: any[] | undefined = []): Promise<PGResult> {
    return this._client.query(text, params)
  }

  destroy(): Promise<void> {
    return this._client.destroy()
  }

  connect<T>(consumer: Consumer<S, T>): Promise<T> {
    return this._client.connect((c) => consumer(new ConnectionImpl(c, this._schema)))
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
