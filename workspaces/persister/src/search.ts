import { escape } from '@juit/pgproxy-client'

import { assert, encodeSchemaAndName } from './utils'

import type { PGQuery } from '@juit/pgproxy-client'
import type {
  SearchJoin,
  SearchJoins,
  SearchOptions,
  SearchQuery,
  SearchResult,
  SearchResults,
} from '@juit/pgproxy-model'
import type { Connection, Persister } from './persister'

/* ========================================================================== *
 * TYPES & INTERFACES                                                         *
 * ========================================================================== */

/**
 * An object to perform searches on a given table.
 */
export interface Search<
  Schema,
  Table extends string & keyof Schema,
  Joins extends SearchJoins<Schema>,
  TextSearch extends boolean,
> {
  /**
   * Return the first result (if any) matching the specified query.
   *
   * This will intrinsically limit the search to 1 result.
   *
   * @param query The query to filter results by
   * @param where Optional extra SQL `WHERE` clauses to customize the search
   * @returns The first matching result, or `undefined` if no results matched
   */
  find(query: SearchQuery<Schema, Table, Joins, TextSearch>, where?: PGQuery): Promise<SearchResult<Schema, Table, Joins> | undefined>

  /**
   * Return the raw SQL query and parameters for the specified options.
   *
   * @param options The search options to generate SQL for
   * @param where Optional extra SQL `WHERE` clauses to customize the search
   * @returns A tuple containing the SQL string and its parameters
   */
  query(options: SearchOptions<Schema, Table, Joins, TextSearch>, where?: PGQuery): [ sql: string, params: any[] ]

  /**
   * Perform a search with the specified options.
   *
   * @param options The search options to use
   * @param where Optional extra SQL `WHERE` clauses to customize the search
   * @returns The search results
   */
  search(options: SearchOptions<Schema, Table, Joins, TextSearch>, where?: PGQuery): Promise<SearchResults<Schema, Table, Joins>>
}

/**
 * A query provider for models
 */
export type SearchProvider<Schema = any> = Persister<Schema> | Connection<Schema>

/**
 * A constructor for our {@link Search} object
 */
export interface SearchConstructor {
  /**
   * Construct a {@link Search} object using the specified
   * {@link SearchProvider} (a `Persister`, `Connection`, ...) operating on the
   * specified table.
   *
   * @param provider The {@link SearchProvider} instance to use
   * @param table The table to perform searches on
   */
  new<
    P extends SearchProvider,
    T extends string & (P extends SearchProvider<infer S> ? keyof S : never),
  >(
    provider: P,
    table: T,
  ): Search<P extends SearchProvider<infer S> ? S : never, T, {}, false>;

  /**
   * Construct a {@link Search} object using the specified
   * {@link SearchProvider} (a `Persister`, `Connection`, ...) operating on the
   * specified table, and using the specified full-text search
   * column (TSVECTOR) to perform `q` searches.
   *
   * @param provider The {@link SearchProvider} instance to use
   * @param table The table to perform searches on
   * @param fullTextSearchColumn The column to use for full-text searches
   */
  new<
    P extends SearchProvider,
    T extends string & (P extends SearchProvider<infer S> ? keyof S : never),
  >(
    provider: P,
    table: T,
    fullTextSearchColumn: string,
  ): Search<P extends SearchProvider<infer S> ? S : never, T, {}, true>;

  /**
   * Construct a {@link Search} object using the specified
   * {@link SearchProvider} (a `Persister`, `Connection`, ...) operating on the
   * specified table, joining external tables.
   *
   * @param provider The {@link SearchProvider} instance to use
   * @param table The table to perform searches on
   * @param joins The joins to perform
   */
  new<
    P extends SearchProvider,
    T extends string & (P extends SearchProvider<infer S> ? keyof S : never),
    J extends SearchJoins<P extends SearchProvider<infer S> ? S : never>,
  >(
    provider: P,
    table: T,
    joins: J,
  ): Search<P extends SearchProvider<infer S> ? S : never, T, J, false>;

  /**
   * Construct a {@link Search} object using the specified
   * {@link SearchProvider} (a `Persister`, `Connection`, ...) operating on the
   * specified table, joining external tables, and using the specified full-text
   * search column (TSVECTOR) to perform `q` searches.
   *
   * @param provider The {@link SearchProvider} instance to use
   * @param table The table to perform searches on
   * @param joins The joins to perform
   * @param fullTextSearchColumn The column to use for full-text searches
   */
  new<
    P extends SearchProvider,
    T extends string & (P extends SearchProvider<infer S> ? keyof S : never),
    J extends SearchJoins<P extends SearchProvider<infer S> ? S : never>,
  >(
    provider: P,
    table: T,
    joins: J,
    fullTextSearchColumn: string,
  ): Search<P extends SearchProvider<infer S> ? S : never, T, J, true>;
}

/* ========================================================================== *
 * INTERNAL IMPLEMENTATION                                                    *
 * ========================================================================== */

/** A regular expression to match ISO dates */
const ISO_RE = /^(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))$/

/** Revive a JSON, parsing ISO dates as {@link Date} objects */
export function reviver(_key: string, data: any): any {
  if ((typeof data === 'string') && ISO_RE.test(data)) return new Date(data)
  return data
}

class SearchImpl<
  Schema,
  Table extends string & keyof Schema,
  Joins extends SearchJoins<Schema> = {},
> implements Search<Schema, Table, Joins, true> {
  /** Our search provider instance */
  #provider: SearchProvider<Schema>
  /** The escaped table name */
  #eTable: string
  /** The escaped joins */
  #eJoins: SearchJoins<any>
  /** The full-text search column (if any) */
  #fullTextSearchColumn: string | undefined

  constructor(provider: SearchProvider<Schema>, table: Table)
  constructor(provider: SearchProvider<Schema>, table: Table, fullTextSearchColumn: string)
  constructor(provider: SearchProvider<Schema>, table: Table, joins: Joins)
  constructor(provider: SearchProvider<Schema>, table: Table, joins: Joins, fullTextSearchColumn: string)

  constructor(
      provider: SearchProvider<Schema>,
      table: Table,
      joinsOrFullTextSearchColumn?: Joins | string,
      maybeFullTextSearchColumn?: string,
  ) {
    this.#provider = provider
    this.#eTable = encodeSchemaAndName(table)

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
        column: escape(def.column),
        refTable: encodeSchemaAndName(def.refTable),
        refColumn: escape(def.refColumn),
        sortColumn: def.sortColumn ? escape(def.sortColumn) : undefined,
      } as SearchJoin<Schema> ]
    }))
  }

  #query(
      count: boolean | 'only',
      options: SearchOptions<Schema, Table, Joins, true>,
      extra?: PGQuery,
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
      where.push(extra.query)
      if (extra.params) params.push(...extra.params)
    }

    let esearch = '' // falsy!
    if (count === 'only') {
      if (this.#fullTextSearchColumn) esearch = escape(this.#fullTextSearchColumn)
    } else if (this.#fullTextSearchColumn) {
      fields.push(`(TO_JSONB(${etable}.*) - $${params.push(this.#fullTextSearchColumn)})`)
      esearch = escape(this.#fullTextSearchColumn)
    } else {
      fields.push( `TO_JSONB(${etable}.*)`)
    }

    // The first part of "SELECT ... FROM ..." is our table and its joins
    const from: string[] = [ etable ]

    // Process our joins, to be added to our table definition
    let joinIndex = 0
    const joinedTables: Record<string, string> = {}
    Object.entries(ejoins).forEach(([ as, { column, refTable, refColumn } ]) => {
      const ealias = escape(`__$${(++ joinIndex).toString(16).padStart(4, '0')}$__`)

      joinedTables[as] ??= ealias

      if (count !== 'only') {
        const index = params.push(as)
        fields.push(`JSONB_BUILD_OBJECT($${index}::TEXT, TO_JSONB(${ealias}))`)
      }
      from.push(`LEFT JOIN ${refTable} ${ealias} ON ${etable}.${column} = ${ealias}.${refColumn}`)
    })

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
        from.push(`CROSS JOIN LATERAL CAST(LOWER($${params.push(q + ':*')}) AS tsquery) AS "__query"`)

      // everything else (e.g. "foo bar") are parsed as "web searches"
      } else {
        from.push(`CROSS JOIN LATERAL websearch_to_tsquery($${params.push(q)}) AS "__query"`)
      }

      // Add our ranking order and where clause
      orderby.push(`ts_rank(${etable}.${esearch}, "__query") DESC`)
      where.push(`"__query" @@ ${etable}.${esearch}`)
    }

    // All remaining columns are simple "WHERE column = ..."
    for (const { name, field, op = '=', value } of filters) {
      // Here we have to determine how to build our "column" reference...
      //
      // When we have a field (i.e. JSONB), and the operator is one of the
      // text-matching ones, we have to use the `->>` operator to extract the
      // field as text, and the value (supposedly a string) is used as-is.
      //
      // Otherwise, we use the `->` operator to extract the field as JSONB and
      // the value is stringified as a JSON string, for PostgreSQL to compare.
      //
      // If we don't have a field, we just use the column and value as-is.
      const [ ecolumn, evalue ] =
        (field && [ 'like', 'ilike', '~' ].includes(op))
          ? [ `${escape(name)}->>$${params.push(field)}`, value ]
          : field
            ? [ `${escape(name)}->$${params.push(field)}`, JSON.stringify(value) ]
            : [ escape(name), value ]


      // The "in" operator is a special case, as we use the ANY function
      if (op === 'in') {
        const evalue = (field && Array.isArray(value)) ? value.map((v) => JSON.stringify(v)) : value
        where.push(`${etable}.${ecolumn} = ANY($${params.push(evalue)})`)
        continue

      // The "not in" operator is a special case, as we use the ALL function
      } else if (op === 'not in') {
        const evalue = (field && Array.isArray(value)) ? value.map((v) => JSON.stringify(v)) : value
        where.push(`${etable}.${ecolumn} != ALL($${params.push(evalue)})`)
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

      // If we are querying a JSONB field, we need to stringify the value
      where.push(`${etable}.${ecolumn} ${operator} $${params.push(evalue)}`)
    }

    // Start building the query
    const result = `(${fields.join(' || ')})::TEXT AS "result"`
    const clauses =
      count === 'only' ? 'COUNT(*) AS "total"' :
      count ? `COUNT(*) OVER() AS "total", ${result}` :
      result

    let sql = `SELECT ${clauses} FROM ${from.join(' ')}`
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    if (orderby.length && (count !== 'only')) sql += ` ORDER BY ${orderby.join(', ')}`

    // If we have an offset, add it
    if (offset) sql += ` OFFSET $${params.push(offset)}`
    if (limit) sql += ` LIMIT $${params.push(limit)}`
    return [ sql, params ]
  }

  query(options: SearchOptions<Schema, Table, Joins, true>, where?: PGQuery): [ sql: string, params: any[] ] {
    return this.#query(false, options, where)
  }

  async find(options: SearchQuery<Schema, Table, Joins, true>, where?: PGQuery): Promise<SearchResult<Schema, Table, Joins> | undefined> {
    const [ sql, params ] = this.#query(false, { ...options, offset: 0, limit: 1 }, where)

    const result = await this.#provider.query<{ total?: number, result: string }>(sql, params)
    if (result.rows[0]) return JSON.parse(result.rows[0].result, reviver)
    return undefined
  }

  async search(options: SearchOptions<Schema, Table, Joins, true>, where?: PGQuery): Promise<SearchResults<Schema, Table, Joins>> {
    const [ sql, params ] = this.#query(true, options, where)

    const result = await this.#provider.query<{ total: number, result: string }>(sql, params).catch((error) => {
      throw new Error(`Error executing search query: ${error.message}`, { cause: { sql, params, error } })
    })

    if ((result.rows.length === 0) && ((options.offset || 0) > 0)) {
      const [ sql, params ] = this.#query('only', { ...options, offset: 0, limit: undefined }, where)
      const result = await this.#provider.query<{ total: number }>(sql, params)
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
