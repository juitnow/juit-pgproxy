import type { Registry } from '@juit/pgproxy-types'
import type { PGConnectionResult } from './provider'

/* ========================================================================== *
 * EXPORTED TYPES                                                             *
 * ========================================================================== */

/** The result of a database query */
export interface PGResult {
  /** The SQL command that generated this result (`SELECT`, `INSERT`, ...) */
  command: string

  /**
   * The number of rows affected by the query.
   *
   * This can be the number of lines returned in `rows` (for `SELECT`
   * statements, for example) or the number of lines _affected_ by the query
   * (the number of records inserted by an `INSERT` query).
   */
  rowCount: number
  /** The rows returned by the database query, keyed by the column name. */
  rows: readonly (Readonly<Record<string, any>>)[]
  /** The tuples returned by the database query, keyed by the column index. */
  tuples: readonly (readonly any[])[]
}

/** Constructor for {@link PGResult} instances */
export interface PGResultConstructor {
  new (result: PGConnectionResult, registry: Registry): PGResult
}

/* ========================================================================== *
 * PGRESULT IMPLEMENTATION                                                    *
 * ========================================================================== */

/** The result of a database query */
export const PGResult: PGResultConstructor = class PGResultImpl {
  readonly command: string
  readonly rowCount: number
  readonly rows: Record<string, any>[]
  readonly tuples: any[][]

  constructor(result: PGConnectionResult, registry: Registry) {
    this.rowCount = result.rowCount
    this.command = result.command

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
