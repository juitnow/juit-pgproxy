import type { OnlyStrings, Prettify } from './utils'

/* ========================================================================== *
 * TYPE INFERENCE: FROM SCHEMA->TABLE->COLUMN->... TO JS TYPES                *
 * ========================================================================== */

/** The definition of a column */
export interface ColumnDefinition<T = any> {
  /** The TypeScript type of the column (from the type parser) */
  type: T,
  /** Whether the column is _generated_ or not */
  isGenerated?: boolean,
  /** Whether the column is _nullable_ or not */
  isNullable?: boolean,
  /** Whether the column _specifies a default value_ or not */
  hasDefault?: boolean,
}

/** Infer the TypeScript type suitable for an `INSERT` in a table */
export type InferInsertType<Table extends Record<string, ColumnDefinition>> = Prettify<{
  /* First part: all nullable or defaulted columns are optional */
  [ Column in keyof Table as Column extends string
    ? Table[Column]['isGenerated'] extends true ? never
    : Table[Column]['isNullable'] extends true ? Column
    : Table[Column]['hasDefault'] extends true ? Column
    : never
    : never
  ] ? :
  Table[Column]['isNullable'] extends true
    ? Table[Column]['type'] | null
    : Table[Column]['type']
} & {
  /* Second part: all non-nullable or non-defaulted columns are required */
  [ Column in keyof Table as Column extends string
    ? Table[Column]['isGenerated'] extends true ? never
    : Table[Column]['isNullable'] extends true ? never
    : Table[Column]['hasDefault'] extends true ? never
    : Column
    : never
  ] -? :
  Table[Column]['isNullable'] extends true
    ? Table[Column]['type'] | null
    : Table[Column]['type']
}>

/** Infer the TypeScript type suitable for a `SELECT` from a table */
export type InferSelectType<Table extends Record<string, ColumnDefinition>> = {
  [ Column in keyof Table as Column extends string ? Column : never ] -? :
    ( Table[Column]['isNullable'] extends true
      ? Table[Column]['type'] | null
      : Table[Column]['type']
    ) & ( Table[Column] extends { branding: infer Brand } ? Brand : unknown )
}

/** Infer the TypeScript type suitable for a `UPDATE` in a table */
export type InferUpdateType<Table extends Record<string, ColumnDefinition>> = {
  [ Column in keyof Table as Column extends string
    ? Table[Column]['isGenerated'] extends true ? never
    : Column
    : never
  ] ? :
  Table[Column]['isNullable'] extends true
    ? Table[Column]['type'] | null
    : Table[Column]['type']
}

/** Infer the TypeScript type used for querying records */
export type InferQueryType<Table extends Record<string, ColumnDefinition>> ={
  [ Column in keyof Table as Column extends string ? Column : never ] ? :
  Table[Column]['isNullable'] extends true
    ? Table[Column]['type'] | null
    : Table[Column]['type']
}

/** Infer the available sort values for a table (as required by `ORDER BY`) */
export type InferSort<Table extends Record<string, ColumnDefinition>> =
  `${OnlyStrings<keyof Table>}${' ASC' | ' asc' | ' DESC' | ' desc' | ''}`
