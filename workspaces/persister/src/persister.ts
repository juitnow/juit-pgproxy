import { PGClient } from '@juit/pgproxy-client'

import { Model } from './model'

import type { PGConnection, PGQuery, PGResult, PGTransactionable } from '@juit/pgproxy-client'
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

/**
 * A connection to a database that can be asynchronously disposed of.
 */
export interface DisposableConnection<Schema> extends Connection<Schema>, AsyncDisposable {
  /** Forcedly close the underlying connection to the database */
  close(): Promise<void>
}

/** A consumer for a {@link Connection} */
export type Consumer<Schema, T> = (connection: Connection<Schema>) => T | PromiseLike<T>

/** Our main `Persister` interface */
export interface Persister<Schema> extends ModelProvider<Schema>, PGClient {
  /** Ping... Just ping the database. */
  ping(): Promise<void>;

  /**
   * Connect to the database and return an _async disposable_
   * {@link PGConnection}.
   */
  connect(): Promise<DisposableConnection<Schema>>

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

class ConnectionImpl<Schema> implements DisposableConnection<Schema> {
  #connection: PGConnection

  constructor(connection: PGConnection) {
    this.#connection = connection
  }

  begin(): Promise<boolean> {
    return this.#connection.begin()
  }

  commit(): Promise<void> {
    return this.#connection.commit()
  }

  rollback(): Promise<void> {
    return this.#connection.rollback()
  }

  query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(textOrQuery: string | PGQuery, maybeParams: readonly any[] = []): Promise<PGResult<Row, Tuple>> {
    const [ text, params = [] ] =
      typeof textOrQuery === 'string'
        ? [ textOrQuery, maybeParams ]
        : [ textOrQuery.query, textOrQuery.params ]
    return this.#connection.query(text, params)
  }

  in<Table extends string>(table: Table & keyof Schema): InferModelType<Schema, Table & keyof Schema> {
    return new Model(this.#connection, table) as InferModelType<Schema, Table & keyof Schema>
  }

  async close(): Promise<void> {
    await this.#connection.close()
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close()
  }
}

class PersisterImpl<Schema> implements PGClient, Persister<Schema> {
  #client: PGClient

  constructor(url?: string | URL) {
    this.#client = new PGClient(url)
  }

  get registry(): Registry {
    return this.#client.registry
  }

  get url(): Readonly<URL> {
    return this.#client.url
  }

  async ping(): Promise<void> {
    await this.#client.query('SELECT now()')
  }

  async query<
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(textOrQuery: string | PGQuery, maybeParams: readonly any[] = []): Promise<PGResult<Row, Tuple>> {
    const [ text, params = [] ] = typeof textOrQuery === 'string' ?
      [ textOrQuery, maybeParams ] : [ textOrQuery.query, textOrQuery.params ]

    const result = this.#client.query<Row, Tuple>(text, params)
    return result
  }

  async destroy(): Promise<void> {
    await this.#client.destroy()
  }

  async connect<T>(consumer?: Consumer<Schema, T>): Promise<T | DisposableConnection<Schema>> {
    if (! consumer) {
      const connection = await this.#client.connect()
      return new ConnectionImpl<Schema>(connection)
    } else {
      await using connection = await this.#client.connect()
      return await consumer(new ConnectionImpl<Schema>(connection))
    }
  }

  in<Table extends string>(table: Table & keyof Schema): InferModelType<Schema, Table & keyof Schema> {
    return new Model(this.#client, table) as InferModelType<Schema, Table & keyof Schema>
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.destroy()
  }
}

/* ========================================================================== *
 * EXPORTS                                                                    *
 * ========================================================================== */

export const Persister: PersisterConstructor = PersisterImpl
