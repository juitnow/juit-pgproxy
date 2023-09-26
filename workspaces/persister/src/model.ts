import {
  assert,
  assertArray,
  assertObject,
  fail,
  isObject,
  isString,
} from '@juitnow/lib-ts-asserts'

import type { PGQueryable } from '@juit/pgproxy-client'
import type { RegistryTypes } from '@juit/pgproxy-types'
import type { Schema, Table } from './index'

/* ========================================================================== *
 * TYPE INFERENCE: FROM SCHEMA->TABLE->COLUMN->OID TO JS TYPES                *
 * ========================================================================== */

/** Infer the JavaScript type from an OID number */
export type InferJavaScriptType<OID extends number> =
  OID extends keyof RegistryTypes ? RegistryTypes[OID] : string

/** Infer the types of all columns in a table (as returned by `SELECT`) */
export type InferTableType<T extends Table> = {
  [ C in keyof T ] :
    T[C]['isNullable'] extends true ?
      InferJavaScriptType<T[C]['oid']> | null :
      InferJavaScriptType<T[C]['oid']>
}

/** Infer the _optional_ types (nullable or with default) in a table */
type InferOptionalType<T extends Table> = {
  [ C in keyof T as
      T[C]['isNullable'] extends true ? C :
      T[C]['hasDefault'] extends true ? C :
  never ] ? :
    T[C]['isNullable'] extends true ?
      InferJavaScriptType<T[C]['oid']> | null | undefined :
    T[C]['hasDefault'] extends true ?
      InferJavaScriptType<T[C]['oid']> | undefined :
    never
}

/** Infer the _required_ types (non-nullable and without default) in a table */
type InferRequiredType<T extends Table> = {
  [ C in keyof T as
      T[C]['isNullable'] extends true ? never :
      T[C]['hasDefault'] extends true ? never :
  C ] : InferJavaScriptType<T[C]['oid']>
}

/** Infer the types of all columns in a table (as required by `INSERT`) */
export type InferInsertType<T extends Table> =
  & InferOptionalType<T>
  & InferRequiredType<T>

/** Infer the available sort values for a table (as required by `ORDER BY`) */
export type InferSort<T extends Table> =
  `${keyof T extends string ? keyof T : never}${' ASC' | ' DESC' | ''}`

/**
 * Infer the types of all columns in a table from a given schema.
 *
 * This type declares the type of _all_ columns of a table defined in a schema,
 * as they are returned by a `SELECT * FROM table` SQL statement.
 *
 * This is a _utility_ type primarily designed to help developers when coding
 * methods, fields, ... types. For example:
 *
 * ```ts
 * class MyUserService {
 *   async getUser(...): Promise<InferTable<MySchema, 'users'>> {
 *     return await myModel.read(...)
 *   }
 * }
 * ```
 */
export type InferTable<S extends Schema, T extends keyof S> =
  S[T] extends Table ? InferTableType<S[T]> : unknown

/**
 * Infer the types of all columns in a table from a given schema, and whether
 * their value is _required_ to insert a new row..
 *
 * This type declares the type of _all_ columns of a table defined in a schema,
 * marking _nullable_ columns or columns _with default values_ as optional.
 *
 * This is a _utility_ type primarily designed to help developers when coding
 * methods, fields, ... types. For example:
 *
 * ```ts
 * class MyUserService {
 *   async createUser(user: InferInsert<MySchema, 'users'>): Promise<void> {
 *     await myModel.create(...)
 *   }
 * }
 * ```
 */
export type InferInsert<S extends Schema, T extends keyof S> =
  S[T] extends Table ? InferInsertType<S[T]> : unknown

/* ========================================================================== *
 * MODEL INTERFACE                                                            *
 * ========================================================================== */

/** The model interface defines a CRUD interface to PosgreSQL tables */
export interface Model<T extends Table> {
  /**
   * Create a row in the table.
   *
   * @param data - The data to insert in the table
   * @returns A record containing all colums from the table (including defaults)
   */
  create(
    data: InferInsertType<T>,
  ): Promise<InferTableType<T>>

  /**
   * Insert a row in the database or update its contents on conflict.
   *
   * @param keys - The data uniquely identifying the row to upsert (primary key)
   * @param data - The data to associate with the given key (all extra columns)
   * @returns A record containing all colums from the table (including defaults)
   */
  upsert<K extends Partial<InferTableType<T>>>(
    keys: K,
    data: Omit<InferInsertType<T>, keyof K>,
  ): Promise<InferTableType<T>>

  /**
   * Read all rows in the table associated with the specified query
   *
   * @param query - The columns whose values need to be queried (for equality)
   * @param sort - Any sort criteria to order the data
   * @param offset - The offset of the results to return
   * @param length - The maximum number of rows to return
   * @returns An array of records containing all columns from the table
   */
  read(
    query?: Partial<InferTableType<T>>,
    sort?: InferSort<T> | InferSort<T>[],
    offset?: number,
    limit?: number,
  ): Promise<InferTableType<T>[]>

  /**
   * Find the _first_ rows in the table associated with the specified query
   *
   * @param query - The columns whose values need to be queried (for equality)
   * @param sort - Any sort criteria to order the data
   * @returns The first records matching the query or `undefined`
   */
  find(
    query?: Partial<InferTableType<T>>,
    sort?: InferSort<T> | InferSort<T>[],
  ): Promise<InferTableType<T> | undefined>

  /**
   * Update all rows in the table matching the specified query.
   *
   * This method _will fail_ when query is the empty object `{}` as we cowardly
   * refuse to update all records in a table (by design).
   *
   * @param query - The columns whose values need to be queried (for equality)
   * @param patch - The updated data to persist in the table
   * @returns An array of updated records containing all columns from the table
   */
  update(
    query: Partial<InferTableType<T>>,
    patch: Partial<InferTableType<T>>,
  ): Promise<InferTableType<T>[]>

  /**
   * Delete all rows in the table matching the specified query.
   *
   * This method _will fail_ when query is the empty object `{}` as we cowardly
   * refuse to delete all records in a table (by design).
   *
   * @param query - The columns whose values need to be queried (for equality)
   * @returns The number of rows deleted
   */
  delete(
    query: Partial<InferTableType<T>>,
  ): Promise<number>
}

/** Constructor for model instances */
export interface ModelConstructor {
  new <S extends Schema, T extends keyof S & string>(
    queryable: PGQueryable,
    table: T,
    schema: S,
  ): Model<S[T]>
}

/* ========================================================================== *
 * IMPLEMENTATION                                                             *
 * ========================================================================== */

/** The tuple `[ SQL, parameters ]` for `query(...)` */
type Query = [ string, any[] ]

/**
 * Escape an identifier (table, column, ... names)
 *
 * Directly lifted from source
 * https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js#L444
 */
function escape(str: string): string {
  return '"' + str.replace(/"/g, '""') + '"'
}

/** Prepare a `WHERE` partial statement */
function where(query: any, params: any[] = []): Query {
  const conditions = []

  for (const [ column, value ] of Object.entries(query)) {
    const index = params.push(value)
    conditions.push(`${escape(column)}=$${index}`)
  }

  return [
    conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
    params,
  ]
}

/** Prepare an `INSERT` statement for a table */
function insert(table: string, object: any): Query {
  assertObject(object, 'Called INSERT with a non-object')

  const columns = []
  const placeholders = []
  const values = []

  for (const [ column, value ] of Object.entries(object)) {
    const index = columns.push(`${escape(column)}`)
    placeholders.push(`$${index}`)
    values.push(value)
  }

  return [
    columns.length == 0 ?
      `INSERT INTO ${escape(table)} DEFAULT VALUES RETURNING *` :
      `INSERT INTO ${escape(table)} (${columns.join()}) VALUES (${placeholders.join()}) RETURNING *`,
    values,
  ]
}

/** Prepare an _upsert_ (`INSERT ... ON CONFLICT`) statement for a table */
function upsert(table: string, keys: any, data: any): Query {
  assertObject(keys, 'Called UPSERT with a non-object for keys')
  assertObject(data, 'Called UPSERT with a non-object for data')

  assert(Object.keys(keys).length > 0, 'Called UPSERT with no conflict keys')
  assert(Object.keys(data).length > 0, 'Called UPSERT with no updateable data')

  /* Keys twice, they go first and override! */
  const object: any = { ...keys, ...data, ...keys }

  /* For "insert" */
  const columns = []
  const placeholders = []
  const values = []
  for (const [ column, value ] of Object.entries(object)) {
    const index = columns.push(`${escape(column)}`)
    placeholders.push(`$${index}`)
    values.push(value)
  }

  /* For "update" */
  const updates = []
  for (const [ column, value ] of Object.entries(data)) {
    updates.push(`${escape(column)}=$${updates.length + columns.length + 1}`)
    values.push(value)
  }

  /* Our "upsert" statement */
  return [
    `INSERT INTO ${escape(table)} (${columns.join()}) VALUES (${placeholders.join()}) ` +
    `ON CONFLICT (${Object.keys(keys).map(escape).join(',')}) ` +
    `DO UPDATE SET ${updates.join(',')} RETURNING *`,
    values,
  ]
}

/** Prepare a `SELECT` statement for a table */
function select(table: string, query: any, sort: Sort<any>, offset?: number, limit?: number): Query {
  assertObject(query, 'Called SELECT with a non-object query')
  assertArray(sort, 'Called SELECT with a non-array sort')

  const [ conditions, values ] = where(query)

  const order = []
  for (const field of sort) {
    if (isObject(field)) {
      for (const [ column, value ] of Object.entries(field)) {
        order.push(`${escape(column)} ${value ? 'ASC' : 'DESC'}`)
      }
    } else if (isString(field)) order.push(`${escape(field)}`)
    else fail('Sort field must be a string or object')
  }
  const orderby = order.length == 0 ? '' : ` ORDER BY ${order.join()}`

  let sql = `SELECT * FROM ${escape(table)}${conditions}${orderby}`

  if (offset && (offset > 0)) {
    sql += ` OFFSET $${values.length + 1}`
    values.push(offset)
  }

  if (limit && (limit > 0)) {
    sql += ` LIMIT $${values.length + 1}`
    values.push(limit)
  }

  return [ sql, values ]
}

/** Prepare an `UPDATE` statement for a table */
function update(table: string, query: any, patch: any): Query {
  assertObject(query, 'Called UPDATE with a non-object query')
  assertObject(patch, 'Called UPDATE with a non-object patch')

  const patches = []
  const values = []

  for (const [ column, value ] of Object.entries(patch)) {
    const index = values.push(value)
    patches.push(`${escape(column)}=$${index}`)
  }

  if (patches.length === 0) return select(table, query, [])

  const length = values.length
  const [ conditions ] = where(query, values)
  assert(values.length > length, 'Cowardly refusing to run unchecked UPDATE with empty query')

  const statement = `UPDATE ${escape(table)} SET ${patches.join()}${conditions} RETURNING *`
  return [ statement, values ]
}

/** Prepare a `DELETE` statement for a table */
function del(table: string, query: any): Query {
  assertObject(query, 'Called DELETE with a non-object query')

  const [ conditions, values ] = where(query)

  assert(values.length > 0, 'Cowardly refusing to run unchecked DELETE with empty query')

  return [ `DELETE FROM ${escape(table)}${conditions} RETURNING *`, values ]
}

/* ===== MODEL IMPLEMENTATION =============================================== */

class ModelImpl<
  S extends Schema,
  T extends keyof S & string,
> implements Model<S[T]> {
  constructor(
      private _queryable: PGQueryable,
      private _table: T,
  ) {}

  async create(
      data: InferInsertType<S[T]>,
  ): Promise<InferTableType<S[T]>> {
    const [ sql, params ] = insert(this._table, data)
    const result = await this._queryable.query(sql, params)
    return result.rows[0] as InferTableType<S[T]>
  }

  async upsert<K extends Partial<InferTableType<S[T]>>>(
      keys: K,
      data: Omit<InferInsertType<S[T]>, keyof K>,
  ): Promise<InferTableType<S[T]>> {
    const [ sql, params ] = upsert(this._table, keys, data)
    const result = await this._queryable.query(sql, params)
    return result.rows[0] as InferTableType<S[T]>
  }

  async read(
      query?: Partial<InferTableType<S[T]>>,
      sort?: InferSort<S[T]> | InferSort<S[T]>[],
      offset?: number,
      limit?: number,
  ): Promise<InferTableType<S[T]>[]> {
    const [ sql, params ] = select(this._table, query, sort, offset, limit)
    const result = await this._queryable.query(sql, params)
    return result.rows as InferTableType<S[T]>[]
  }

  async find(
      query?: Partial<InferTableType<S[T]>>,
      sort?: InferSort<S[T]> | InferSort<S[T]>[],
  ): Promise<InferTableType<S[T]> | undefined> {
    const result = await this.read(query, sort, 0, 1)
    return result[0]
  }

  async update(
      query: Partial<InferTableType<S[T]>>,
      patch: Partial<InferTableType<S[T]>>,
  ): Promise<InferTableType<S[T]>[]> {
    const [ sql, params ] = update(this._table, query, patch)
    const result = await this._queryable.query(sql, params)
    return result.rows as InferTableType<S[T]>[]
  }

  async delete(
      query: Partial<InferTableType<S[T]>>,
  ): Promise<number> {
    const [ sql, params ] = del(this._table, query)
    const result = await this._queryable.query(sql, params)
    return result.rowCount
  }
}

/* ========================================================================== *
 * EXPORTS                                                                    *
 * ========================================================================== */

export const Model: ModelConstructor = ModelImpl
