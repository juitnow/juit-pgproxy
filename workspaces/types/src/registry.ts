import { PGOIDs } from './oids'
import {
  parseArray,
  parseBigint,
  parseBigintArray,
  parseBigintRange,
  parseBigintRangeArray,
  parseBool,
  parseBoolArray,
  parseByteA,
  parseByteAArray,
  parseCircle,
  parseCircleArray,
  parseFloatArray,
  parseFloatRange,
  parseFloatRangeArray,
  parseIntArray,
  parseIntRange,
  parseIntRangeArray,
  parseInterval,
  parseIntervalArray,
  parseJson,
  parseJsonArray,
  parsePoint,
  parsePointArray,
  parseRange,
  parseRangeArray,
  parseString,
  parseTimestamp,
  parseTimestampArray,
  parseTimestampRange,
  parseTimestampRangeArray,
  parseTimestampTz,
  parseTimestampTzArray,
  parseTimestampTzRange,
  parseTimestampTzRangeArray,
  parseVoid,
} from './parsers'

import type { PGParser } from './parsers'
import type { PGArray } from './parsers/array'

export interface Registry {
  deregisterParser(oid: number): this
  registerParser(oid: number, parser: PGParser<any>): this

  getParser(oid: number): PGParser<any>
}

const oidParsers = {
  /* Basic known types                                |_oid__|_typname______| */
  [PGOIDs.bool]: parseBool, /*                        |   16 | bool         | */
  [PGOIDs.bytea]: parseByteA, /*                      |   17 | bytea        | */
  [PGOIDs.int8]: parseBigint, /*                      |   20 | int8         | */
  [PGOIDs.int2]: parseInt, /*                         |   21 | int2         | */
  [PGOIDs.int4]: parseInt, /*                         |   23 | int4         | */
  [PGOIDs.oid]: parseInt, /*                          |   26 | oid          | */
  [PGOIDs.json]: parseJson, /*                        |  114 | json         | */
  [PGOIDs.point]: parsePoint, /*                      |  600 | point        | */
  [PGOIDs.float4]: parseFloat, /*                     |  700 | float4       | */
  [PGOIDs.float8]: parseFloat, /*                     |  701 | float8       | */
  [PGOIDs.circle]: parseCircle, /*                    |  718 | circle       | */
  [PGOIDs.varchar]: parseString, /*                   | 1043 | varchar      | */
  [PGOIDs.timestamp]: parseTimestamp, /*              | 1114 | timestamp    | */
  [PGOIDs.timestamptz]: parseTimestampTz, /*          | 1184 | timestamptz  | */
  [PGOIDs.interval]: parseInterval, /*                | 1186 | interval     | */
  [PGOIDs.numeric]: parseString, /*                   | 1700 | numeric      | */
  [PGOIDs.jsonb]: parseJson, /*                       | 3802 | jsonb        | */

  /* Special types                                    |_oid__|_typname______| */
  [PGOIDs.void]: parseVoid, /*                        | 2278 | void         | */
  [PGOIDs.xid]: parseInt, /*                          |   28 | xid          | */
  [PGOIDs.xid8]: parseBigint, /*                      | 5069 | xid8         | */
  [PGOIDs._xid]: parseIntArray, /*                    | 1011 | _xid         | */
  [PGOIDs._xid8]: parseBigintArray, /*                |  271 | _xid8        | */

  /* Native array types of the above                  |_oid__|_typname______| */
  [PGOIDs._bool]: parseBoolArray, /*                  | 1000 | _bool        | */
  [PGOIDs._bytea]: parseByteAArray /*                 | 1001 | _bytea       | */ as PGParser<PGArray<Uint8Array>>, // TODO: see https://github.com/microsoft/TypeScript/issues/60638
  [PGOIDs._int8]: parseBigintArray, /*                | 1016 | _int8        | */
  [PGOIDs._int2]: parseIntArray, /*                   | 1005 | _int2        | */
  [PGOIDs._int4]: parseIntArray, /*                   | 1007 | _int4        | */
  [PGOIDs._oid]: parseIntArray, /*                    | 1028 | _oid         | */
  [PGOIDs._json]: parseJsonArray, /*                  |  199 | _json        | */
  [PGOIDs._point]: parsePointArray, /*                | 1017 | _point       | */
  [PGOIDs._float4]: parseFloatArray, /*               | 1021 | _float4      | */
  [PGOIDs._float8]: parseFloatArray, /*               | 1022 | _float8      | */
  [PGOIDs._circle]: parseCircleArray, /*              |  719 | _circle      | */
  [PGOIDs._timestamp]: parseTimestampArray, /*        | 1115 | _timestamp   | */
  [PGOIDs._timestamptz]: parseTimestampTzArray, /*    | 1185 | _timestamptz | */
  [PGOIDs._interval]: parseIntervalArray, /*          | 1187 | _interval    | */
  [PGOIDs._numeric]: parseArray, /*                   | 1231 | _numeric     | */
  [PGOIDs._jsonb]: parseJsonArray, /*                 | 3807 | _jsonb       | */

  /* Other known array types                          |_oid__|_typname______| */
  [PGOIDs._cidr]: parseArray, /*                      |  651 | _cidr        | */
  [PGOIDs._money]: parseArray, /*                     |  791 | _money       | */
  [PGOIDs._regproc]: parseArray, /*                   | 1008 | _regproc     | */
  [PGOIDs._text]: parseArray, /*                      | 1009 | _text        | */
  [PGOIDs._bpchar]: parseArray, /*                    | 1014 | _bpchar      | */
  [PGOIDs._varchar]: parseArray, /*                   | 1015 | _varchar     | */
  [PGOIDs._macaddr]: parseArray, /*                   | 1040 | _macaddr     | */
  [PGOIDs._inet]: parseArray, /*                      | 1041 | _inet        | */
  [PGOIDs._date]: parseArray, /*                      | 1182 | _date        | */
  [PGOIDs._time]: parseArray, /*                      | 1183 | _time        | */
  [PGOIDs._timetz]: parseArray, /*                    | 1270 | _timetz      | */
  [PGOIDs._uuid]: parseArray, /*                      | 2951 | _uuid        | */

  /* Range types                                      |_oid__|_typname______| */
  [PGOIDs.int4range]: parseIntRange, /*               | 3904 | int4range    | */
  [PGOIDs.numrange]: parseFloatRange, /*              | 3906 | numrange     | */
  [PGOIDs.tsrange]: parseTimestampRange, /*           | 3908 | tsrange      | */
  [PGOIDs.tstzrange]: parseTimestampTzRange, /*       | 3910 | tstzrange    | */
  [PGOIDs.daterange]: parseRange, /*                  | 3912 | daterange    | */
  [PGOIDs.int8range]: parseBigintRange, /*            | 3926 | int8range    | */

  /* Array of range types                             |_oid__|_typname______| */
  [PGOIDs._int4range]: parseIntRangeArray, /*         | 3905 | _int4range   | */
  [PGOIDs._numrange]: parseFloatRangeArray, /*        | 3907 | _numrange    | */
  [PGOIDs._tsrange]: parseTimestampRangeArray, /*     | 3909 | _tsrange     | */
  [PGOIDs._tstzrange]: parseTimestampTzRangeArray, /* | 3911 | _tstzrange   | */
  [PGOIDs._daterange]: parseRangeArray, /*            | 3913 | _daterange   | */
  [PGOIDs._int8range]: parseBigintRangeArray, /*      | 3927 | _int8range   | */
} satisfies Record<PGOIDs[keyof PGOIDs], PGParser<any>>

export type RegistryTypes = {
  [ key in keyof typeof oidParsers ] :
    typeof oidParsers[key] extends PGParser<infer T> ? T : never
}

const defaultParsers: Record<number, PGParser<any>> = { ...oidParsers }

class RegistryImpl implements Registry {
  private _parsers: Record<number, PGParser<any>>

  constructor() {
    this._parsers = { ...oidParsers }
  }

  deregisterParser(oid: number): this {
    delete this._parsers[oid]
    return this
  }

  registerParser(oid: number, parser: PGParser<any>): this {
    this._parsers[oid] = parser
    return this
  }

  getParser(oid: number): PGParser<any> {
    return this._parsers[oid] || defaultParsers[oid] || parseString
  }

  static deregisterDefaultParser(oid: number): void {
    delete defaultParsers[oid]
  }

  static registerDefaultParser(oid: number, parser: PGParser<any>): void {
    defaultParsers[oid] = parser
  }
}

export interface RegistryConstructor {
  new (): Registry,
  deregisterDefaultParser(oid: number): void
  registerDefaultParser(oid: number, parser: PGParser<any>): void
}

export const Registry: RegistryConstructor = RegistryImpl
