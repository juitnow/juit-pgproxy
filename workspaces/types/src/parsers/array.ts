// Verbatim from https://github.com/bendrucker/postgres-array (MIT license)

import {
  parseBigInt,
  parseBool,
  parseJson,
  parseString,
  parseTimestamp,
  parseTimestampTz,
} from './basic'
import { parseByteA } from './bytea'
import { parseCircle, parsePoint } from './geometric'
import { parseInterval } from './interval'

import type { PGParser } from '../parsers'
import type { PGCircle, PGPoint } from './geometric'
import type { PGInterval } from './interval'

/** A parsed PostgreSQL `array` */
export type PGArray<T = string> = (T | null)[]

/** Parse a PostgreSQL array of string values */
export function parseArray(source: string): PGArray
/** Parse a PostgreSQL array using the specified parser for its elements */
export function parseArray<T>(source: string, parser: PGParser<T>): PGArray<T>
/* overloaded implementation */
export function parseArray(
    source: string,
    parser = parseString,
): PGArray {
  return parseInternal(source, parser, false)
}

/* ========================================================================== */

/** Parse a PostgreSQL array of _bigint_ values */
export const parseBigIntArray: PGParser<PGArray<bigint>> =
  (value: string) => parseArray(value, parseBigInt)

/** Parse a PostgreSQL array of _boolean_ values */
export const parseBoolArray: PGParser<PGArray<boolean>> =
  (value: string) => parseArray(value, parseBool)

/** Parse a PostgreSQL array of _binary_ values */
export const parseByteAArray: PGParser<PGArray<Uint8Array>> =
  (value: string) => parseArray(value, parseByteA)

/** Parse a PostgreSQL array of {@link PGCircle} values */
export const parseCircleArray: PGParser<PGArray<PGCircle>> =
  (value: string) => parseArray(value, parseCircle)

/** Parse a PostgreSQL array of _float_ values */
export const parseFloatArray: PGParser<PGArray<number>> =
  (value: string) => parseArray(value, parseFloat)

/** Parse a PostgreSQL array of _number_ values */
export const parseIntArray: PGParser<PGArray<number>> =
  (value: string) => parseArray(value, parseInt)

/** Parse a PostgreSQL array of {@link PGInterval} values */
export const parseIntervalArray: PGParser<PGArray<PGInterval>> =
  (value: string) => parseArray(value, parseInterval)

/** Parse a PostgreSQL array of _JSON_ values */
export const parseJsonArray: PGParser<PGArray<any[]>> =
  (value: string) => parseArray(value, parseJson)

/** Parse a PostgreSQL array of {@link PGPoint} values */
export const parsePointArray: PGParser<PGArray<PGPoint>> =
  (value: string) => parseArray(value, parsePoint)

/** Parse a PostgreSQL array of _timestamp without time zone_ values */
export const parseTimestampArray: PGParser<PGArray<Date>> =
  (value: string) => parseArray(value, parseTimestamp)

/** Parse a PostgreSQL array of _timestamp with time zone_ values */
export const parseTimestampTzArray: PGParser<PGArray<Date>> =
  (value: string) => parseArray(value, parseTimestampTz)

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

/** Result from parsing a nested sub-array */
interface SubArrayResult {
  entries: any,
  position: number,
}

function parseInternal(source: string, parser: PGParser<any>, nested: false): any[]
function parseInternal(source: string, parser: PGParser<any>, nested: true): SubArrayResult
function parseInternal(source: string, parser: PGParser<any>, nested: boolean): any[] | SubArrayResult {
  const entries = []
  let character = ''
  let quote = false
  let position = 0
  let dimension = 0
  let recorded = ''

  const newEntry = (includeEmpty?: boolean): void => {
    let entry: string | null = recorded

    if (entry.length > 0 || includeEmpty) {
      if (entry === 'NULL' && !includeEmpty) {
        entry = null
      }

      if (entry !== null) {
        entries.push(parser(entry))
      } else {
        entries.push(null)
      }

      recorded = ''
    }
  }

  if (source[0] === '[') {
    while (position < source.length) {
      const char = source[position++]

      if (char === '=') {
        break
      }
    }
  }

  while (position < source.length) {
    let escaped = false
    character = source[position++]!

    if (character === '\\') {
      character = source[position++]!
      escaped = true
    }

    if (character === '{' && !quote) {
      dimension++

      if (dimension > 1) {
        const result = parseInternal(source.substring(position - 1), parser, true)
        entries.push(result.entries)
        position += result.position - 2
      }
    } else if (character === '}' && !quote) {
      dimension--

      if (!dimension) {
        newEntry()

        if (nested) {
          return {
            entries,
            position,
          }
        }
      }
    } else if (character === '"' && !escaped) {
      if (quote) {
        newEntry(true)
      }

      quote = !quote
    } else if (character === ',' && !quote) {
      newEntry()
    } else {
      recorded += character
    }
  }

  if (dimension !== 0) {
    throw new Error('array dimension not balanced')
  }

  return entries
}
