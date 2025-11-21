import { escape } from '@juit/pgproxy-client'

import { assert, assertArray, assertObject, encodeSchemaAndName } from './utils'

import type { PGQueryable } from '@juit/pgproxy-client'
import type {
  ColumnDefinition,
  InferInsertType,
  InferQueryType,
  InferSelectType,
  InferSort,
  InferUpdateType,
} from '@juit/pgproxy-model'

/* ========================================================================== *
 * MODEL INTERFACE                                                            *
 * ========================================================================== */

/** The model interface defines a CRUD interface to PosgreSQL tables */
export interface Model<Table extends Record<string, ColumnDefinition>> {
  /**
   * Create a row in the table.
   *
   * With this variant, uniqueness checks are not performed, that is, if a
   * conflict occurs due to a unique constraint or primary key, an error will
   * be raised.
   *
   * @param data - The data to insert in the table
   * @param unique - Ignore uniqueness checks (defaults to `false`)
   * @returns A record containing all colums from the table (including defaults)
   */
  create(
    data: InferInsertType<Table>,
    unique?: false,
  ): Promise<InferSelectType<Table>>

  /**
   * Create a row in the table returning a value *only if* a new one is created.
   *
   * With this variant, uniqueness checks **are performed**, that is, if a
   * conflict occurs due to a unique constraint or primary key, this will
   * return `undefined`.
   *
   * @param data - The data to insert in the table
   * @param unique - Enforce uniqueness checks (typed as `true`)
   * @returns A record containing all colums from the table (including defaults)
   */
  create(
    data: InferInsertType<Table>,
    unique: true,
  ): Promise<InferSelectType<Table> | undefined>

  /**
   * Insert a row in the database or update its contents on conflict.
   *
   * @param keys - The data uniquely identifying the row to upsert (primary key)
   * @param data - The data to associate with the given key (all extra columns)
   * @returns A record containing all colums from the table (including defaults)
   */
  upsert<K extends InferQueryType<Table>>(
    keys: K,
    data: Omit<InferInsertType<Table>, keyof K>,
  ): Promise<InferSelectType<Table>>

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
    query?: InferQueryType<Table>,
    sort?: InferSort<Table> | InferSort<Table>[],
    offset?: number,
    limit?: number,
  ): Promise<InferSelectType<Table>[]>

  /**
   * Find the _first_ rows in the table associated with the specified query
   *
   * @param query - The columns whose values need to be queried (for equality)
   * @param sort - Any sort criteria to order the data
   * @returns The first records matching the query or `undefined`
   */
  find(
    query?: InferQueryType<Table>,
    sort?: InferSort<Table> | InferSort<Table>[],
  ): Promise<InferSelectType<Table> | undefined>

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
    query: InferQueryType<Table>,
    patch: InferUpdateType<Table>,
  ): Promise<InferSelectType<Table>[]>

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
    query: InferQueryType<Table>,
  ): Promise<number>
}

/** Constructor for model instances */
export interface ModelConstructor {
  new <Schema extends Record<string, ColumnDefinition>>(
    queryable: PGQueryable,
    table: string,
  ): Model<Schema>
}

/* ========================================================================== *
 * IMPLEMENTATION                                                             *
 * ========================================================================== */

/** The tuple `[ SQL, parameters ]` for `query(...)` */
type Query = [ sql: string, params: any[] ]

/** Prepare a `WHERE` partial statement */
function where(
    query: Record<string, any>,
    params: any[],
) : [ ...Query, count: number ] {
  const conditions = []

  let count = 0
  for (const [ column, value ] of Object.entries(query)) {
    if (value === undefined) continue
    if (value === null) {
      conditions.push(`${escape(column)} IS NULL`)
    } else {
      const index = params.push(value)
      conditions.push(`${escape(column)}=$${index}`)
    }
    count ++
  }

  return [
    conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
    params,
    count,
  ]
}

/** Prepare an `INSERT` statement for a table */
function insert(
    etable: string,
    query: Record<string, any>,
    unique: boolean = false,
): Query {
  assertObject(query, 'Called INSERT with a non-object')

  const columns = []
  const placeholders = []
  const values = []

  for (const [ column, value ] of Object.entries(query)) {
    if (value === undefined) continue
    const index = columns.push(`${escape(column)}`)
    placeholders.push(`$${index}`)
    values.push(value)
  }

  const returning = unique ? 'ON CONFLICT DO NOTHING RETURNING *' : 'RETURNING *'

  return [
    columns.length == 0 ?
      `INSERT INTO ${etable} DEFAULT VALUES ${returning}` :
      `INSERT INTO ${etable} (${columns.join()}) VALUES (${placeholders.join()}) ${returning}`,
    values,
  ]
}

/** Prepare an _upsert_ (`INSERT ... ON CONFLICT`) statement for a table */
function upsert(
    etable: string,
    keys: Record<string, any>,
    data: Record<string, any>,
): Query {
  assertObject(keys, 'Called UPSERT with a non-object for keys')
  assertObject(data, 'Called UPSERT with a non-object for data')

  assert(Object.keys(keys).length > 0, 'Called UPSERT with no conflict keys')
  assert(Object.keys(data).length > 0, 'Called UPSERT with no updateable data')

  /* Keys twice, they go first and override! */
  const object: Record<string, any> = { ...keys, ...data, ...keys }

  /* For "insert" */
  const columns: string[] = []
  const placeholders: string[] = []
  const values: any[] = []
  for (const [ column, value ] of Object.entries(object)) {
    if (value === undefined) continue
    const index = columns.push(`${escape(column)}`)
    placeholders.push(`$${index}`)
    values.push(value)
  }

  /* For "on conflict" */
  const conflictKeys: string[] = []
  for (const [ column, value ] of Object.entries(keys)) {
    if (value !== undefined) conflictKeys.push(escape(column))
  }

  /* For "update" */
  const updates: string[] = []
  for (const [ column, value ] of Object.entries(data)) {
    if (value === undefined) continue
    updates.push(`${escape(column)}=$${updates.length + columns.length + 1}`)
    values.push(value)
  }

  /* Our "upsert" statement */
  return [
    `INSERT INTO ${etable} (${columns.join()}) VALUES (${placeholders.join()}) ` +
    `ON CONFLICT (${conflictKeys.join(',')}) ` +
    `DO UPDATE SET ${updates.join(',')} RETURNING *`,
    values,
  ]
}

/** Prepare a `SELECT` statement for a table */
function select(
    etable: string,
    query: Record<string, any>,
    sort: string | string[],
    offset: number,
    limit: number,
): Query {
  if (typeof sort === 'string') sort = [ sort ]
  assertObject(query, 'Called SELECT with a non-object query')
  assertArray(sort, 'Called SELECT with a non-array sort')

  const [ conditions, values ] = where(query, [])

  const order = []
  for (const field of sort) {
    if (field.toLowerCase().endsWith(' desc')) {
      order.push(`${escape(field.slice(0, -5))} DESC`)
    } else if (field.toLowerCase().endsWith(' asc')) {
      order.push(`${escape(field.slice(0, -4))} ASC`)
    } else {
      order.push(escape(field))
    }
  }

  const orderby = order.length == 0 ? '' : ` ORDER BY ${order.join(',')}`

  let sql = `SELECT * FROM ${etable}${conditions}${orderby}`

  if (offset && (offset > 0)) {
    sql += ` OFFSET $${values.length + 1}`
    values.push(Math.floor(offset))
  }

  if (limit && (limit > 0)) {
    sql += ` LIMIT $${values.length + 1}`
    values.push(Math.floor(limit))
  }

  return [ sql, values ]
}

/** Prepare an `UPDATE` statement for a table */
function update(
    etable: string,
    query: Record<string, any>,
    patch: Record<string, any>,
): Query {
  assertObject(query, 'Called UPDATE with a non-object query')
  assertObject(patch, 'Called UPDATE with a non-object patch')

  const patches = []
  const values = []

  for (const [ column, value ] of Object.entries(patch)) {
    if (value === undefined) continue
    const index = values.push(value)
    patches.push(`${escape(column)}=$${index}`)
  }

  if (patches.length === 0) return select(etable, query, [], 0, 0)

  const [ conditions, , count ] = where(query, values)
  assert(count > 0, 'Cowardly refusing to run UPDATE with empty query')

  const statement = `UPDATE ${etable} SET ${patches.join()}${conditions} RETURNING *`
  return [ statement, values ]
}

/** Prepare a `DELETE` statement for a table */
function del(
    etable: string,
    query: Record<string, any>,
): Query {
  assertObject(query, 'Called DELETE with a non-object query')

  const [ conditions, values, count ] = where(query, [])

  assert(count > 0, 'Cowardly refusing to run DELETE with empty query')

  return [ `DELETE FROM ${etable}${conditions} RETURNING *`, values ]
}

/* ===== MODEL IMPLEMENTATION =============================================== */

class ModelImpl<Table extends Record<string, ColumnDefinition>> implements Model<Table> {
  private _connection: PGQueryable
  private _etable: string

  constructor(connection: PGQueryable, name: string) {
    this._connection = connection
    this._etable = encodeSchemaAndName(name)
  }

  // Make typescript happy about overloads
  create(data: InferInsertType<Table>): Promise<InferSelectType<Table>>

  // Actual implementation
  async create(
      data: InferInsertType<Table>,
      unique: false = false,
  ): Promise<InferSelectType<Table> | undefined> {
    const [ sql, params ] = insert(this._etable, data, unique)
    const result = await this._connection.query<InferSelectType<Table>>(sql, params)
    return result.rows[0]
  }

  async upsert<K extends InferQueryType<Table>>(
      keys: K,
      data: Omit<InferInsertType<Table>, keyof K>,
  ): Promise<InferSelectType<Table>> {
    const [ sql, params ] = upsert(this._etable, keys, data)
    const result = await this._connection.query<InferSelectType<Table>>(sql, params)
    return result.rows[0]!
  }

  async read(
      query?: InferQueryType<Table>,
      sort: InferSort<Table> | InferSort<Table>[] = [],
      offset: number = 0,
      limit: number = 0,
  ): Promise<InferSelectType<Table>[]> {
    const [ sql, params ] = select(this._etable, query || {}, sort, offset, limit)
    const result = await this._connection.query<InferSelectType<Table>>(sql, params)
    return result.rows
  }

  async find(
      query?: InferQueryType<Table>,
      sort?: InferSort<Table> | InferSort<Table>[],
  ): Promise<InferSelectType<Table> | undefined> {
    const result = await this.read(query, sort, 0, 1)
    return result[0]
  }

  async update(
      query: InferQueryType<Table>,
      patch: InferUpdateType<Table>,
  ): Promise<InferSelectType<Table>[]> {
    const [ sql, params ] = update(this._etable, query, patch)
    const result = await this._connection.query<InferSelectType<Table>>(sql, params)
    return result.rows
  }

  async delete(
      query: InferQueryType<Table>,
  ): Promise<number> {
    const [ sql, params ] = del(this._etable, query)
    const result = await this._connection.query(sql, params)
    return result.rowCount
  }
}

/* ========================================================================== *
 * EXPORTS                                                                    *
 * ========================================================================== */

export const Model: ModelConstructor = ModelImpl
