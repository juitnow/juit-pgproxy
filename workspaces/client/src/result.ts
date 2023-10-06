import type { Registry } from '@juit/pgproxy-types'
import type { PGConnectionResult } from './provider'

/* ========================================================================== *
 * EXPORTED TYPES                                                             *
 * ========================================================================== */

/** The result of a database query */
export interface PGResult<
  Row extends Record<string, any> = Record<string, any>,
  Tuple extends readonly any[] = readonly any [],
> {
  /** The SQL command that generated this result (`SELECT`, `INSERT`, ...) */
  command: string
  /** Result description describing column names and relative OIDs */
  fields: { name: string, oid: number }[]
  /**
   * The number of rows affected by the query.
   *
   * This can be the number of lines returned in `rows` (for `SELECT`
   * statements, for example) or the number of lines _affected_ by the query
   * (the number of records inserted by an `INSERT` query).
   */
  rowCount: number
  /** The rows returned by the database query, keyed by the column name. */
  rows: Row[]
  /** The tuples returned by the database query, keyed by the column index. */
  tuples: Tuple[]
}

/** Constructor for {@link PGResult} instances */
export interface PGResultConstructor {
  new <
    Row extends Record<string, any> = Record<string, any>,
    Tuple extends readonly any[] = readonly any [],
  >(result: PGConnectionResult, registry: Registry): PGResult<Row, Tuple>
}

/* ========================================================================== *
 * PGRESULT IMPLEMENTATION                                                    *
 * ========================================================================== */

/** The result of a database query */
export const PGResult: PGResultConstructor = class PGResultImpl<
  Row extends Record<string, any> = Record<string, any>,
  Tuple extends readonly any[] = readonly any [],
> implements PGResult<Row, Tuple> {
  command: string
  fields: { name: string, oid: number }[]
  rowCount: number
  rows: Row[]
  tuples: Tuple[]

  constructor(result: PGConnectionResult, registry: Registry) {
    this.rowCount = result.rowCount
    this.command = result.command
    this.fields = result.fields.map(([ name, oid ]) => ({ name, oid }))

    const rowCount = result.rows.length
    const colCount = result.fields.length

    const mappers = result.fields.map(([ name, oid ]) => ([
      name, registry.getParser(oid),
    ] as const))

    const rows = this.rows = new Array(rowCount)
    const tuples = this.tuples = new Array(rowCount)

    for (let row = 0; row < rowCount; row ++) {
      const tupleData = tuples[row] = new Array(colCount)
      const rowData = rows[row] = {} as Record<string, any>

      for (let col = 0; col < colCount; col ++) {
        const [ name, parser ] = mappers[col]!
        const value = result.rows[row]![col]!
        tupleData[col] = rowData[name] =
          value === null ? null :
          value === undefined ? null :
          parser(value)
      }
    }
  }
}
