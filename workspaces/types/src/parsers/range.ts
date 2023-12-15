import postgresRange from 'postgres-range'

import { parseArray } from './array'
import { parseBigint, parseString, parseTimestamp, parseTimestampTz } from './basic'

import type { PGParser } from '../parsers'
import type { PGSerializable, PGSerialize } from '../serializers'
import type { PGArray } from './array'

/* ========================================================================== *
 * PGRANGE TYPE                                                               *
 * ========================================================================== */

/** A parsed PostgreSQL `range` */
export interface PGRange<T> {
  readonly lower: T | null
  readonly upper: T | null
  readonly mask: number

  hasMask(flags: number): boolean
  isBounded(): boolean
  isEmpty(): boolean
  isLowerBoundClosed(): boolean
  isUpperBoundClosed(): boolean
  hasLowerBound(): boolean
  hasUpperBound(): boolean

  containsPoint(point: T): boolean
  containsRange(range: PGRange<T>): boolean
}

/** Constructor (with static constants) for {@link PGRange} */
export interface PGRangeConstructor {
  new <T>(lower: T | null, upper: T | null, flags: number): PGRange<T>

  readonly RANGE_EMPTY: number
  readonly RANGE_LB_INC: number
  readonly RANGE_UB_INC: number
  readonly RANGE_LB_INF: number
  readonly RANGE_UB_INF: number
}

/** A parsed PostgreSQL `range` */
export const PGRange: PGRangeConstructor = class PGRangeImpl<T>
  extends postgresRange.Range<T>
  implements PGRange<T>, PGSerializable {
  readonly mask: number

  constructor(lower: T | null, upper: T | null, flags: number) {
    super(lower, upper, flags)
    this.mask = flags
  }

  toPostgres(serialize: PGSerialize): string {
    return postgresRange.serialize(this, serialize)
  }

  static readonly RANGE_EMPTY = postgresRange.RANGE_EMPTY
  static readonly RANGE_LB_INC = postgresRange.RANGE_LB_INC
  static readonly RANGE_UB_INC = postgresRange.RANGE_UB_INC
  static readonly RANGE_LB_INF = postgresRange.RANGE_LB_INF
  static readonly RANGE_UB_INF = postgresRange.RANGE_UB_INF
}

/* ========================================================================== *
 * PARSERS                                                                    *
 * ========================================================================== */

/** Parse a PostgreSQL `range` */
export function parseRange(value: string): PGRange<string>
/** Parse a PostgreSQL `range` */
export function parseRange<T>(value: string, parser: PGParser<T>): PGRange<T>
/* Overloaded implementation */
export function parseRange(
    value: string,
    parser: PGParser<any> = parseString,
): PGRange<any> {
  const range = postgresRange.parse(value, parser)
  return new PGRange(range.lower, range.upper, (range as any).mask)
}

/* ===== SPECIALIZED TYPES ================================================== */

/** Parse a PostgreSQL `range` of _integers_ */
export const parseIntRange: PGParser<PGRange<number>> =
  (value: string) => parseRange(value, parseInt)

/** Parse a PostgreSQL `range` of _floats_ */
export const parseFloatRange: PGParser<PGRange<number>> =
  (value: string) => parseRange(value, parseFloat)

/** Parse a PostgreSQL `range` of _big integers_ */
export const parseBigintRange: PGParser<PGRange<bigint>> =
  (value: string) => parseRange(value, parseBigint)

/** Parse a PostgreSQL `range` of _timestamps_ */
export const parseTimestampRange: PGParser<PGRange<Date>> =
  (value: string) => parseRange(value, parseTimestamp)

/** Parse a PostgreSQL `range` of _timestamps with time zone_ */
export const parseTimestampTzRange: PGParser<PGRange<Date>> =
  (value: string) => parseRange(value, parseTimestampTz)

/* ===== ARRAYS OF RANGES =================================================== */

/** Parse an array of PostgreSQL `range` of _strings_ */
export const parseRangeArray: PGParser<PGArray<PGRange<string>>> =
  (value: string) => parseArray<PGRange<string>>(value, parseRange)

/** Parse an array of PostgreSQL `range` of _integers_ */
export const parseIntRangeArray: PGParser<PGArray<PGRange<number>>> =
  (value: string) => parseArray(value, parseIntRange)

/** Parse an array of PostgreSQL `range` of _floats_ */
export const parseFloatRangeArray: PGParser<PGArray<PGRange<number>>> =
  (value: string) => parseArray(value, parseFloatRange)

/** Parse an array of PostgreSQL `range` of _big integers_ */
export const parseBigintRangeArray: PGParser<PGArray<PGRange<bigint>>> =
  (value: string) => parseArray(value, parseBigintRange)

/** Parse an array of PostgreSQL `range` of _timestamps_ */
export const parseTimestampRangeArray: PGParser<PGArray<PGRange<Date>>> =
  (value: string) => parseArray(value, parseTimestampRange)

/** Parse an array of PostgreSQL `range` of _timestamps with time zone_ */
export const parseTimestampTzRangeArray: PGParser<PGArray<PGRange<Date>>> =
  (value: string) => parseArray(value, parseTimestampTzRange)
