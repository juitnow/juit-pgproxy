/* ========================================================================== *
 * PARSE BASIC TYPES                                                          *
 * ========================================================================== */

import postgresDate from 'postgres-date'

import type { PGParser } from '../types'

/* ===== INVALID CONSTANTS ================================================== */

const INVALID_DATE = new Date(NaN)

/* ===== PARSERS ============================================================ */

// parseInt and parseFloat are from JS

/** Parse a `bigint` */
export const parseBigInt: PGParser<bigint> = BigInt

/** Parse some JSON */
export const parseJson: PGParser<any> = JSON.parse

/** Parse a `boolean` */
export const parseBool: PGParser<boolean> = (value: string): boolean => {
  return value === 'TRUE' ||
         value === 't' ||
         value === 'true' ||
         value === 'y' ||
         value === 'yes' ||
         value === 'on' ||
         value === '1'
}

/** Parse a `string` (identity transformation) */
export const parseString: PGParser<string> = (value: string): string => value

/** Parse anything into `null` (normally used only for `void` types) */
export const parseVoid: PGParser<null> = (): null => null

/** Parse a PostgreSQL timestamp _without_ time zone */
export const parseTimestamp: PGParser<Date> = (value: string): Date => {
  const utc = value.endsWith(' BC') ?
    value.slice(0, -3) + 'Z BC' :
    value + 'Z'

  return parseTimestampTz(utc)
}

/** Parse a PostgreSQL timestamp _with_ time zone */
export const parseTimestampTz: PGParser<Date> = (value: string): Date => {
  const date = postgresDate(value)
  return date instanceof Date ? date : INVALID_DATE
}
