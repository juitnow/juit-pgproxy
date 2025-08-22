import { PGClient } from '@juit/pgproxy-client'

import { Model } from './model'

import type { PGQuery, PGResult, PGTransactionable } from '@juit/pgproxy-client'
import type { Registry } from '@juit/pgproxy-types'
import type { ColumnDefinition } from './model'

/* ========================================================================== *
 * TYPES                                                                      *
 * ========================================================================== */

/* Infer the `Model` type from a schema and column name */
export type InferModelType<Schema, Table extends string & keyof Schema> =
  Schema[Table] extends Record<string, ColumnDefinition> ?
    Model<Schema[Table]> :
    never

export interface ModelProvider<Schema> {
  // Syntax sugar: "Table" here is not bound to "keyof Schema" as we want to
  // return "never" in case the table does not exist in our schema, rather than
  // a "Model" bound to the union of all tables in the schema...
  in<Table extends string>(table: Table & keyof Schema): InferModelType<Schema, Table & keyof Schema>
}

/**
 * A query interface guaranteeing that all operations will be performed on the
 * _same_ database connection (transaction safe)
 */
export interface Connection<Schema> extends ModelProvider<Schema>, PGTransactionable {
  /**
   * Return the {@link Model} view associated with the specified table.
   *
   * All operations performed by this {@link Model} will share the same
   * {@link Connection} (transaction safe).
   */
  in<Table extends string>(table: Table & keyof Schema): InferModelType<Schema, Table & keyof Schema>
}

/** A consumer for a {@link Connection} */
export type Consumer<Schema, T> = (connection: Connection<Schema>) => T | PromiseLike<T>

/** Our main `Persister` interface */
export interface Persister<Schema> extends ModelProvider<Schema>, PGClient {
  /** Ping... Just ping the database. */
  ping(): Promise<void>;

  /**
   * Connect to the database to execute a number of different queries.
   *
   * The `consumer` will be passed a {@link Connection} instance backed by the
   * _same_ connection to the database, therefore transactions can be safely
   * executed in the context of the consumer function itself.
   */
  connect<T>(consumer: Consumer<Schema, T>): Promise<T>

  /**
   * Return the {@link Model} view associated with the specified table.
   *
   * All operations performed by this {@link Model} will potentially use
   * different connections to the database (not transaction safe).
   */
  in<Table extends string>(table: Table & keyof Schema): InferModelType<Schema, Table & keyof Schema>
}

/** Constructor for {@link Persister} instances */
export interface PersisterConstructor {
  new <Schema = Record<string, Record<string, ColumnDefinition>>>(url?: string | URL): Persister<Schema>
}

/* ========================================================================== *
 * IMPLEMENTATION                                                             *
 * ========================================================================== */

class ConnectionImpl<Schema> implements Connection<Schema> {
  constructor(
      private _connection: PGTransactionable,
  ) {}

  begin(): Promise<boolean> {
    return this._connection.begin()
  }

  commit(): Promise<void> {
    return this._connection.commit()
  }

  rollback(): Promise<void> {
    return this._connection.rollback()
  }

  query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(textOrQuery: string | PGQuery, maybeParams: readonly any[] = []): Promise<PGResult<Row, Tuple>> {
    const [ text, params = [] ] =
      typeof textOrQuery === 'string'
        ? [ textOrQuery, maybeParams ]
        : [ textOrQuery.query, textOrQuery.params ]
    return this._connection.query(text, params)
  }

  in<Table extends string>(table: Table & keyof Schema): InferModelType<Schema, Table & keyof Schema> {
    return new Model(this._connection, table) as InferModelType<Schema, Table & keyof Schema>
  }
}

class PersisterImpl<Schema> implements PGClient, Persister<Schema> {
  private _client: PGClient

  constructor(url?: string | URL) {
    this._client = new PGClient(url)
  }

  get registry(): Registry {
    return this._client.registry
  }

  async ping(): Promise<void> {
    await this._client.query('SELECT now()')
  }

  async query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(textOrQuery: string | PGQuery, maybeParams: readonly any[] = []): Promise<PGResult<Row, Tuple>> {
    const [ text, params = [] ] = typeof textOrQuery === 'string' ?
      [ textOrQuery, maybeParams ] : [ textOrQuery.query, textOrQuery.params ]

    const result = this._client.query<Row, Tuple>(text, params)
    return result
  }

  async destroy(): Promise<void> {
    await this._client.destroy()
  }

  async connect<T>(consumer: Consumer<Schema, T>): Promise<T> {
    return await this._client.connect((conn) => consumer(new ConnectionImpl(conn)))
  }

  in<Table extends string>(table: Table & keyof Schema): InferModelType<Schema, Table & keyof Schema> {
    return new Model(this._client, table) as InferModelType<Schema, Table & keyof Schema>
  }
}

/* ========================================================================== *
 * EXPORTS                                                                    *
 * ========================================================================== */

export const Persister: PersisterConstructor = PersisterImpl
