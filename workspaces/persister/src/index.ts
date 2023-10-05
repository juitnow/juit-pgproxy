/** The minimal definition of a column in a PostgreSQL database table */
export interface Column {
  readonly oid: number,
  readonly isNullable: boolean,
  readonly hasDefault: boolean,
  readonly enumLabels?: string[],
}

/** A table in a PosgreSQL database, as a collection of its columns */
export interface Table {
  readonly [ column: string ]: Column
}

/** A schema, describing a number of tables in a PostgreSQL database */
export interface Schema {
  readonly [ table: string ]: Table
}

/* Export Persister and Model */
export * from './model'
export * from './persister'
