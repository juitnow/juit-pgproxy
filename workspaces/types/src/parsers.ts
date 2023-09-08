/* eslint-disable comma-dangle */

/** A function parsing a `string` returned from PostgreSQL */
export type PGParser<T = string> = (value: string) => T

export {
  parseArray,
  parseBigIntArray,
  parseBoolArray,
  parseByteAArray,
  parseCircleArray,
  parseFloatArray,
  parseIntArray,
  parseIntervalArray,
  parseJsonArray,
  parsePointArray,
  parseTimestampArray,
  parseTimestampTzArray
} from './parsers/array'

export {
  parseBigInt,
  parseBool,
  parseJson,
  parseString,
  parseTimestamp,
  parseTimestampTz,
  parseVoid
} from './parsers/basic'

export {
  parseByteA
} from './parsers/bytea'

export {
  parseCircle,
  parsePoint
} from './parsers/geometric'

export {
  parseInterval
} from './parsers/interval'

export {
  parseBigIntRange,
  parseBigIntRangeArray,
  parseFloatRange,
  parseFloatRangeArray,
  parseIntRange,
  parseIntRangeArray,
  parseRange,
  parseRangeArray,
  parseTimestampRange,
  parseTimestampRangeArray,
  parseTimestampTzRange,
  parseTimestampTzRangeArray
} from './parsers/range'
