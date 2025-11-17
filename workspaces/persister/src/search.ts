import { escape } from '@juit/pgproxy-client'

import { assert } from './assert'

import type { ColumnDefinition, InferSelectType } from './model'
import type { Persister } from './persister'

/* ========================================================================== *
 * TYPES & INTERFACES                                                         *
 * ========================================================================== */

/* ===== JOINS ============================================================== */

/**
 * Definition for joins in a {@link Search}
 *
 * Each key is the name of the join as it will appear in the results, and the
 * value defines how to perform the join.
 *
 * - `table` is the name of the table to join
 * - `column` is the column in the search table referencing the join table
 * - `refColumn` is the column in the join table referenced by the search table
 */
export type SearchJoins<Schema> = Record<string, {
  /**
   * The name of the table to _left join_.
   *
   * ```sql
   * ... LEFT JOIN "table" ON "thisTable"."column" = "table"."refColumn"
   * ```
   */
  table: string & keyof Schema
  /**
   * The column in _the search table_ (passed to the constructor of
   * {@link Search}) referencing the specified `table` (defined here).
   *
   * ```sql
   * ... LEFT JOIN "table" ON "searchTable"."column" = "table"."refColumn"
   * ```
   */
  column: string
  /**
   * The column in the specified `table` (defined here) referenced by the
   * _the search table_ (passed to the constructor of {@link Search}).
   *
   * ```sql
   * ... LEFT JOIN "table" ON "searchTable"."column" = "table"."refColumn"
   * ```
   */
  refColumn: string
  /**
   * The column in the referenced table to use as default sort column, when
   * sorting by this join.
   */
  sortColumn?: string
}>

/* ===== SEARCH OPTIONS ===================================================== */

/** Internal interface defining operators available to *single values* */
interface ValueSearchFilter<
  Schema,
  Table extends string & keyof Schema,
> {
  name: string & keyof Schema[Table]
  field?: string
  op?: '=' | '!=' | '>' | '>=' | '<' | '<=' | '~' | 'like' | 'ilike'
  value: string | number | Date | boolean | null
}

/** Internal interface defining operators available to *array values* */
interface ArraySearchFilter<
  Schema,
  Table extends string & keyof Schema,
> {
  name: string & keyof Schema[Table]
  field?: string
  op: 'in' | 'not in'
  value: (string | number | Date | boolean | null)[]
}

/** Internal interface defining operators available to *json values* */
interface JsonSearchFilter<
  Schema,
  Table extends string & keyof Schema,
> {
  name: string & keyof Schema[Table]
  field?: never
  op: '@>' | '<@'
  value: any
}

/**
 * A filter for a search that matches a single value
 *
 * - `name` is the column name to filter on
 * - `field` is a field to filter on when the column is a complex type (JSONB)
 * - `op` is the operator to use for the filter (default: `=`)
 * - `value` is the value to filter for
 *
 * All operators are defined as per PostgreSQL documentation, with few notable
 * exceptions:
 *
 * - `~` is an alias to the `ilike` operator
 * - `in` and `not in` are used to match a value against an array of possible
 *   values using the `... = ANY(...)`  or `... != ALL(...)` constructs
 * - `@>` and `<@` will accept single values as well as arrays.
 * - `!=` and `=` will use the PostgreSQL `IS (NOT) DISTINCT FROM` semantics
 *   to properly handle `NULL` comparisons.
 */
export type SearchFilter<
  Schema,
  Table extends string & keyof Schema,
> = ValueSearchFilter<Schema, Table> | ArraySearchFilter<Schema, Table> | JsonSearchFilter<Schema, Table>

/**
 * Base interface for querying results via our {@link Search}.
 */
export interface SearchQuery<
  Schema,
  Table extends string & keyof Schema,
  Joins extends SearchJoins<Schema> = {},
> {
  /** An optional set of filters to apply */
  filters?: SearchFilter<Schema, Table>[]
  /** An optional column to sort by */
  sort?: string & (keyof Schema[Table] | keyof Joins)
  /** The order to sort by (if `sort` is specified, default: 'asc') */
  order?: 'asc' | 'desc'
  /** An optional full-text search query, available for full-text search */
  q?: string
}

/**
 * Full options for querying a limited set of results via our {@link Search}.
 */
export interface SearchOptions<
  Schema,
  Table extends string & keyof Schema,
  Joins extends SearchJoins<Schema> = {},
> extends SearchQuery<Schema, Table, Joins> {
  /** Offset to start returning rows from (default: 0) */
  offset?: number
  /** Maximum number of rows to return (default: 20, unlimited if 0) */
  limit?: number
}

/**
 * Extra (manual) SQL to further customize our {@link Search} queries.
 */
export interface SearchExtra {
  /** Extra `WHERE` clause to add to our search */
  where: string
  /** Parameters for the extra `WHERE` clause */
  params: any[]
}

/* ===== SEARCH RESULTS ===================================================== */

/** A single search result row (with joins) */
export type SearchResult<
  Schema,
  Table extends string & keyof Schema,
  Joins extends SearchJoins<Schema> = {},
> =
  Schema[Table] extends Record<string, ColumnDefinition> ?
  // This is the main table's column field
  InferSelectType<Schema[Table]> & {
    // For each join, add a field with the joined table's inferred type
    [ key in keyof Joins ] : Joins[key]['table'] extends keyof Schema ?
      // If the column referencing this join is nullable, the result can be null
      Schema[Joins[key]['table']] extends Record<string, ColumnDefinition> ?
        Schema[Table][Joins[key]['column']]['isNullable'] extends true ?
          InferSelectType<Schema[Joins[key]['table']]> | null :
          InferSelectType<Schema[Joins[key]['table']]> :
        // If the joined table isn't a column def, we can't infer anything
        unknown :
      // If the table doesn't exist in the schema, we can't infer anything
      unknown
  } : never

/** What's being returned by our `search` */
export interface SearchResults<
  Schema,
  Table extends string & keyof Schema,
  Joins extends SearchJoins<Schema> = {},
> {
  /** The total length of all available results (without offset or limit) */
  total: number
  /** The lines queried (truncated by offset and limit) */
  rows: SearchResult<Schema, Table, Joins>[]
}

/* ===== SEARCH ============================================================= */

/**
 * An object to perform searches on a given table in our {@link Persister}
 */
export interface Search<
  Schema,
  Table extends string & keyof Schema,
  Joins extends SearchJoins<Schema>,
> {
  /**
   * Return the first result (if any) matching the specified query.
   *
   * This will intrinsically limit the search to 1 result.
   *
   * @param query The query to filter results by
   * @param extra Optional extra SQL to customize the search
   * @returns The first matching result, or `undefined` if no results matched
   */
  find(query: SearchQuery<Schema, Table, Joins>, extra?: SearchExtra): Promise<SearchResult<Schema, Table, Joins> | undefined>

  /**
   * Return the raw SQL query and parameters for the specified options.
   *
   * @param options The search options to generate SQL for
   * @param extra Optional extra SQL to customize the search
   * @returns A tuple containing the SQL string and its parameters
   */
  query(options: SearchOptions<Schema, Table, Joins>, extra?: SearchExtra): [ sql: string, params: any[] ]

  /**
   * Perform a search with the specified options.
   *
   * @param options The search options to use
   * @param extra Optional extra SQL to customize the search
   * @returns The search results
   */
  search(options: SearchOptions<Schema, Table, Joins>, extra?: SearchExtra): Promise<SearchResults<Schema, Table, Joins>>
}

/**
 * A constructor for our {@link Search} object
 */
export interface SearchConstructor {
  /**
   * Construct a {@link Search} object using the specified {@link Persister},
   * operating on the specified table.
   *
   * @param persister The {@link Persister} instance to use
   * @param table The table to perform searches on
   */
  new<
    P extends Persister,
    T extends string & (P extends Persister<infer S> ? keyof S : never),
  >(
    persister: P,
    table: T,
  ): Search<P extends Persister<infer S> ? S : never, T, {}>;

  /**
   * Construct a {@link Search} object using the specified {@link Persister},
   * operating on the specified table, and using the specified full-text search
   * column (TSVECTOR) to perform `q` searches.
   *
   * @param persister The {@link Persister} instance to use
   * @param table The table to perform searches on
   * @param fullTextSearchColumn The column to use for full-text searches
   */
  new<
    P extends Persister,
    T extends string & (P extends Persister<infer S> ? keyof S : never),
  >(
    persister: P,
    table: T,
    fullTextSearchColumn: string,
  ): Search<P extends Persister<infer S> ? S : never, T, {}>;

  /**
   * Construct a {@link Search} object using the specified {@link Persister},
   * operating on the specified table, joining external tables.
   *
   * @param persister The {@link Persister} instance to use
   * @param table The table to perform searches on
   * @param joins The joins to perform
   */
  new<
    P extends Persister,
    T extends string & (P extends Persister<infer S> ? keyof S : never),
    J extends SearchJoins<P extends Persister<infer S> ? S : never>,
  >(
    persister: P,
    table: T,
    joins: J,
  ): Search<P extends Persister<infer S> ? S : never, T, J>;

  /**
   * Construct a {@link Search} object using the specified {@link Persister},
   * operating on the specified table, joining external tables, and using the
   * specified full-text search column (TSVECTOR) to perform `q` searches.
   *
   * @param persister The {@link Persister} instance to use
   * @param table The table to perform searches on
   * @param joins The joins to perform
   * @param fullTextSearchColumn The column to use for full-text searches
   */
  new<
    P extends Persister,
    T extends string & (P extends Persister<infer S> ? keyof S : never),
    J extends SearchJoins<P extends Persister<infer S> ? S : never>,
  >(
    persister: P,
    table: T,
    joins: J,
    fullTextSearchColumn: string,
  ): Search<P extends Persister<infer S> ? S : never, T, J>;
}

/* ========================================================================== *
 * INTERNAL IMPLEMENTATION                                                    *
 * ========================================================================== */

/** A regular expression to match ISO dates */
const ISO_RE = /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/

/** Revive a JSON, parsing ISO dates as {@link Date} objects */
export function reviver(_key: string, data: any): any {
  if ((typeof data === 'string') && ISO_RE.test(data)) return new Date(data)
  return data
}

class SearchImpl<
  Schema,
  Table extends string & keyof Schema,
  Joins extends SearchJoins<Schema> = {},
> implements Search<Schema, Table, Joins> {
  /** Our persister instance */
  #persister: Persister<Schema>
  /** The escaped table name */
  #eTable: string
  /** The escaped joins */
  #eJoins: SearchJoins<any>
  /** The full-text search column (if any) */
  #fullTextSearchColumn: string | undefined

  constructor(persister: Persister<Schema>, table: Table)
  constructor(persister: Persister<Schema>, table: Table, fullTextSearchColumn: string)
  constructor(persister: Persister<Schema>, table: Table, joins: Joins)
  constructor(persister: Persister<Schema>, table: Table, joins: Joins, fullTextSearchColumn: string)

  constructor(
      persister: Persister<Schema>,
      table: Table,
      joinsOrFullTextSearchColumn?: Joins | string,
      maybeFullTextSearchColumn?: string,
  ) {
    this.#persister = persister
    this.#eTable = escape(table)

    let joins: Joins = {} as Joins
    let fullTextSearchColumn: string | undefined = undefined

    if (typeof joinsOrFullTextSearchColumn === 'string') {
      fullTextSearchColumn = joinsOrFullTextSearchColumn
    } else if (joinsOrFullTextSearchColumn) {
      joins = joinsOrFullTextSearchColumn
      fullTextSearchColumn = maybeFullTextSearchColumn
    }

    this.#fullTextSearchColumn = fullTextSearchColumn || undefined
    this.#eJoins = Object.fromEntries(Object.entries(joins).map(([ key, def ]) => {
      return [ key, {
        table: escape(def.table),
        column: escape(def.column),
        refColumn: escape(def.refColumn),
        sortColumn: def.sortColumn ? escape(def.sortColumn) : undefined,
      } ]
    }))
  }

  #query(
      count: boolean | 'only',
      options: SearchOptions<Schema, Table, Joins>,
      extra?: SearchExtra,
  ): [ sql: string, params: any[] ] {
    const {
      offset = 0,
      limit = 20,
      filters = [],
      sort,
      order,
      q,
    } = options

    const etable = this.#eTable
    const ejoins = this.#eJoins

    const fields: string[] = []
    const where: string[] = []
    const orderby: string[] = []
    const params: any[] = []

    // Extra manual SQL *always* goes FIRST in our WHERE clause, its
    // parameters always start at $1
    if (extra) {
      where.push(extra.where)
      params.push(...extra.params)
    }

    let esearch = '' // falsy!
    if (count === 'only') {
      // no fields needed
    } else if (this.#fullTextSearchColumn) {
      fields.push(`(TO_JSONB(${etable}.*) - $${params.push(this.#fullTextSearchColumn)})`)
      esearch = escape(this.#fullTextSearchColumn)
    } else {
      fields.push( `TO_JSONB(${etable}.*)`)
    }

    // Process our joins, to be added to our table definition
    let joinIndex = 0
    const joinedTables: Record<string, string> = {}
    const joinSql = Object.entries(ejoins).map(([ as, { table, column, refColumn } ]) => {
      const ealias = escape(`__$${(++ joinIndex).toString(16).padStart(4, '0')}$__`)
      joinedTables[as] ??= ealias

      if (count !== 'only') {
        const index = params.push(as)
        fields.push(`JSONB_BUILD_OBJECT($${index}::TEXT, ${ealias}.*)`)
      }
      return `LEFT JOIN ${table} ${ealias} ON ${etable}.${column} = ${ealias}.${refColumn}`
    })

    // The first part of "SELECT ... FROM" is our table and its joins
    const from: string[] = [ [ etable, ...joinSql ].join(' ') ]

    // Convert sort order into `ORDER BY` components, those come _before_ the
    // default rank-based ordering applied below if the "q" field is present
    if (sort) {
      const joinedOrder = order?.toLocaleLowerCase() === 'desc' ? ' DESC' : ''

      // Remap sorting by joined column
      if (ejoins[sort]) {
        assert(ejoins[sort].sortColumn, `Sort column for joined field "${sort}" not defined`)
        const joinedTableAlias = joinedTables[sort]
        const joinedColumn = ejoins[sort].sortColumn
        orderby.push(`${joinedTableAlias}.${joinedColumn}${joinedOrder} NULLS LAST`)
      } else {
        orderby.push(`${etable}.${escape(sort)}${joinedOrder}`)
      }
    }

    // See if we have to do something with "q" (full text search)
    if (q) {
      assert(esearch, 'Full-text search column not defined')

      // simple strings (e.g. "foobar") become prefix matches ("foobar:*")
      // we use a _cast_ here in order to avoid stopwords (e.g. "and:*")
      if (q.match(/^[\w][-@\w]*$/)) {
        from.push(`CAST(LOWER($${params.push(q + ':*')}) AS tsquery) AS "__query"`)

      // everything else (e.g. "foo bar") are parsed as "web searches"
      } else {
        from.push(`websearch_to_tsquery($${params.push(q)}) AS "__query"`)
      }

      // Add our ranking order and where clause
      orderby.push(`ts_rank(${etable}.${esearch}, "__query") DESC`)
      where.push(`"__query" @@ ${etable}.${esearch}`)
    }

    // All remaining columns are simple "WHERE column = ..."
    for (const { name, field, op = '=', value } of filters) {
      const ecolumn = field ? `${escape(name)}->>$${params.push(field)}` : escape(name)

      // The "in" operator is a special case, as we use the ANY function
      if (op === 'in') {
        where.push(`${etable}.${ecolumn} = ANY($${params.push(value)})`)
        continue
      // The "not in" operator is a special case, as we use the ALL function
      } else if (op === 'not in') {
        where.push(`${etable}.${ecolumn} != ALL($${params.push(value)})`)
        continue

      // The JSONB operators are also special cases
      } else if ((op === '@>') || (op === '<@')) {
        assert(!field, `Field "${field}" cannot be specified when using JSONB operator "${op}" for column "${name}"`)
        where.push(`${etable}.${ecolumn} ${op} ($${params.push(JSON.stringify(value))})::JSONB`)
        continue
      }

      // Anything else is a straight operator
      let operator: string
      switch (op) {
        case '>': operator = '>'; break
        case '>=': operator = '>='; break
        case '<': operator = '<'; break
        case '<=': operator = '<='; break
        case 'like': operator = 'LIKE'; break
        case 'ilike': operator = 'ILIKE'; break
        case '~': operator = 'ILIKE'; break
        case '!=': operator = 'IS DISTINCT FROM'; break
        case '=': operator = 'IS NOT DISTINCT FROM'; break
        default: throw new Error(`Unsupported operator "${op}" for column "${name}"`)
      }

      where.push(`${etable}.${ecolumn} ${operator} $${params.push(value)}`)
    }

    // Start building the query
    const result = `(${fields.join(' || ')})::TEXT AS "result"`
    const clauses =
      count === 'only' ? 'COUNT(*) AS "total"' :
      count ? `COUNT(*) OVER() AS "total", ${result}` :
      result

    let sql = `SELECT ${clauses} FROM ${from.join(', ')}`
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    if (orderby.length) sql += ` ORDER BY ${orderby.join(', ')}`

    // If we have an offset, add it
    if (offset) sql += ` OFFSET $${params.push(offset)}`
    if (limit) sql += ` LIMIT $${params.push(limit)}`
    return [ sql, params ]
  }

  query(options: SearchOptions<Schema, Table, Joins>, extra?: SearchExtra): [ sql: string, params: any[] ] {
    return this.#query(false, options, extra)
  }

  async find(options: SearchQuery<Schema, Table, Joins>, extra?: SearchExtra): Promise<SearchResult<Schema, Table, Joins> | undefined> {
    const [ sql, params ] = this.#query(false, { ...options, offset: 0, limit: 1 }, extra)

    const result = await this.#persister.query<{ total?: number, result: string }>(sql, params)
    if (result.rows[0]) return JSON.parse(result.rows[0].result, reviver)
    return undefined
  }

  async search(options: SearchOptions<Schema, Table, Joins>, extra?: SearchExtra): Promise<SearchResults<Schema, Table, Joins>> {
    const [ sql, params ] = this.#query(true, options, extra)

    const result = await this.#persister.query<{ total: number, result: string }>(sql, params)

    if ((result.rows.length === 0) && ((options.offset || 0) > 0)) {
      const [ sql, params ] = this.#query('only', { ...options, offset: 0, limit: undefined }, extra)
      const result = await this.#persister.query<{ total: number }>(sql, params)
      assert(result.rows[0], 'Expected total row in count query')
      const total = Number(result.rows[0].total)
      return { total, rows: [] }
    }

    const rows = result.rows.map((row) => JSON.parse(row.result, reviver))
    const total = Number(result.rows[0]?.total) || 0

    return { total, rows }
  }
}


/* ========================================================================== *
 * EXPORTS                                                                    *
 * ========================================================================== */

export const Search: SearchConstructor = SearchImpl
