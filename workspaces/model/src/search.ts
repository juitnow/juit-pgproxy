import type { ColumnDefinition, InferSelectType } from './model'

/* ========================================================================== *
 * JOINS                                                                      *
 * ========================================================================== */

/**
 * Definition for a simple (straight) join in a {@link Search}
 */
export interface SearchJoin<Schema> {
  /**
   * The column in _the search table_ (passed to the constructor of
   * {@link Search}) referencing the specified `refTable` (defined here).
   *
   * ```sql
   * ... LEFT JOIN "refTable" ON "table"."column" = "refTable"."refColumn"
   *                                      ^^^^^^
   * ```
   */
  column: string
  /**
   * The name of the table to _left join_.
   *
   * ```sql
   * ... LEFT JOIN "refTable" ON "table"."column" = "refTable"."refColumn"
   *                ^^^^^^^^                         ^^^^^^^^
   * ```
   */
  refTable: string & keyof Schema
  /**
   * The column in the `refTable` referenced by the _the search table_.
   *
   * ```sql
   * ... LEFT JOIN "refTable" ON "table"."column" = "refTable"."refColumn"
   *                                                            ^^^^^^^^^
   * ```
   */
  refColumn: string
  /**
   * The column in the referenced table to use as default sort column, when
   * sorting by this join.
   */
  sortColumn?: string
}

/**
 * Definition for joins in a {@link Search}
 *
 * Each key is the name of the join as it will appear in the results, and the
 * value defines how to perform the join.
 *
 * See {@link StraightJoin} and {@link LinkedJoin} for details on the fields.
 */
export interface SearchJoins<Schema> {
  [ key: string ]: SearchJoin<Schema>
}

/* ========================================================================== *
 * SEARCH OPTIONS                                                             *
 * ========================================================================== */

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
  Joins extends SearchJoins<Schema>,
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
  Joins extends SearchJoins<Schema>,
> extends SearchQuery<Schema, Table, Joins> {
  /** Offset to start returning rows from (default: 0) */
  offset?: number
  /** Maximum number of rows to return (default: 20, unlimited if 0) */
  limit?: number
}

/* ========================================================================== *
 * SEARCH RESULTS                                                             *
 * ========================================================================== */

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
    [ key in keyof Joins ] : Joins[key]['refTable'] extends keyof Schema ?
      // If the column referencing this join is nullable, the result can be null
      Schema[Joins[key]['refTable']] extends Record<string, ColumnDefinition> ?
        Schema[Table][Joins[key]['column']]['isNullable'] extends true ?
          InferSelectType<Schema[Joins[key]['refTable']]> | null :
          InferSelectType<Schema[Joins[key]['refTable']]> :
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
