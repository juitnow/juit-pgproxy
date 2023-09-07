/* ========================================================================== *
 * PARSE BASIC TYPES                                                          *
 * ========================================================================== */

import postgresDate from 'postgres-date'
import postgresInterval from 'postgres-interval'

import type { PGCircle, PGInterval, PGParser, PGPoint } from '../types'

/* ===== INVALID CONSTANTS ================================================== */

const INVALID_DATE = new Date(NaN)
const INVALID_POINT = { x: NaN, y: NaN }
const INVALID_CIRCLE = { x: NaN, y: NaN, radius: NaN }

/* ===== PARSERS ============================================================ */

// parseInt and parseFloat are from JS, string is the identity transformation

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

/** Parse a PostgreSQL `point` */
export const parsePoint: PGParser<PGPoint> = (value: string): PGPoint => {
  if (value[0] !== '(') return INVALID_POINT

  const values = value.substring(1, value.length - 1).split(',')

  return {
    x: parseFloat(values[0]!),
    y: parseFloat(values[1]!),
  }
}

/** Parse a PostgreSQL `circle` */
export const parseCircle: PGParser<PGCircle> = (value: string): PGCircle => {
  if (value[0] !== '<' && value[1] !== '(') return INVALID_CIRCLE

  let point = '('
  let radius = ''
  let pointParsed = false
  for (let i = 2; i < value.length - 1; i++) {
    if (!pointParsed) {
      point += value[i]
    }

    if (value[i] === ')') {
      pointParsed = true
      continue
    } else if (!pointParsed) {
      continue
    }

    if (value[i] === ',') {
      continue
    }

    radius += value[i]
  }

  return { ...parsePoint(point), radius: parseFloat(radius) }
}

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

/** Parse a PostgreSQL `interval` */
export const parseInterval: PGParser<PGInterval> = postgresInterval
