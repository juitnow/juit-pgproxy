import postgresRange from 'postgres-range'

import { identityParser } from '../types'
import { parseBigInt, parseTimestamp, parseTimestampTz } from './basic'

import type { PGParser, PGRange } from '../types'

export function parseRange(value: string): PGRange<string>
export function parseRange<T>(value: string, parser: PGParser<T>): PGRange<T>

export function parseRange(
    value: string,
    parser: PGParser<any> = identityParser,
): PGRange<any> {
  return postgresRange.parse(value, parser)
}

export const parseIntRange: PGParser<PGRange<number>> = (value: string): PGRange<number> => parseRange(value, parseInt)
export const parseFloatRange: PGParser<PGRange<number>> = (value: string): PGRange<number> => parseRange(value, parseFloat)
export const parseBigIntRange: PGParser<PGRange<bigint>> = (value: string): PGRange<bigint> => parseRange(value, parseBigInt)
export const parseTimestampRange: PGParser<PGRange<Date>> = (value: string): PGRange<Date> => parseRange(value, parseTimestamp)
export const parseTimestampTzRange: PGParser<PGRange<Date>> = (value: string): PGRange<Date> => parseRange(value, parseTimestampTz)
