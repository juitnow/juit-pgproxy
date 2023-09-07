import { oids } from './oids'
import {
  parseArray,
  parseBigInt,
  parseBigIntArray,
  parseBigIntRange,
  parseBool,
  parseBoolArray,
  parseByteA,
  parseByteAArray,
  parseCircle,
  parseCircleArray,
  parseFloatArray,
  parseFloatRange,
  parseIntArray,
  parseIntRange,
  parseInterval,
  parseIntervalArray,
  parseJson,
  parseJsonArray,
  parsePoint,
  parsePointArray,
  parseRange,
  parseTimestamp,
  parseTimestampArray,
  parseTimestampRange,
  parseTimestampTz,
  parseTimestampTzArray,
  parseTimestampTzRange,
} from './parsers'
import { identityParser } from './types'

import type { PGParser } from './types'

export interface Registry {
  deregisterParser(oid: number): this
  registerParser(oid: number, parser: PGParser<any>): this

  getParser(oid: number): PGParser<any>
}

const defaultParsers: Record<number, PGParser<any>> = {
  /* Basic known types                                 |_oid__|_typname_____| */
  [oids.bool]: parseBool, /*                             |   16 | bool        | */
  [oids.bytea]: parseByteA, /*                           |   17 | bytea       | */
  [oids.int8]: parseBigInt, /*                           |   20 | int8        | */
  [oids.int2]: parseInt, /*                              |   21 | int2        | */
  [oids.int4]: parseInt, /*                              |   23 | int4        | */
  [oids.oid]: parseInt, /*                               |   26 | oid         | */
  [oids.json]: parseJson, /*                             |  114 | json        | */
  [oids.point]: parsePoint, /*                           |  600 | point       | */
  [oids.float4]: parseFloat, /*                          |  700 | float4      | */
  [oids.float8]: parseFloat, /*                          |  701 | float8      | */
  [oids.circle]: parseCircle, /*                         |  718 | circle      | */
  [oids.timestamp]: parseTimestamp, /*                   | 1114 | timestamp   | */
  [oids.timestamptz]: parseTimestampTz, /*               | 1184 | timestamptz | */
  [oids.interval]: parseInterval, /*                     | 1186 | interval    | */
  [oids.jsonb]: parseJson, /*                            | 3802 | jsonb       | */

  /* Native array types of the above             |_oid__|_typarray_|_typname______| */
  [oids._bool]: parseBoolArray, /*               |   16 |     1000 | _bool        | */
  [oids._bytea]: parseByteAArray, /*             |   17 |     1001 | _bytea       | */
  [oids._int8]: parseBigIntArray, /*             |   20 |     1016 | _int8        | */
  [oids._int2]: parseIntArray, /*                |   21 |     1005 | _int2        | */
  [oids._int4]: parseIntArray, /*                |   23 |     1007 | _int4        | */
  [oids._oid]: parseIntArray, /*                 |   26 |     1028 | _oid         | */
  [oids._json]: parseJsonArray, /*               |  114 |      199 | _json        | */
  [oids._point]: parsePointArray, /*             |  600 |     1017 | _point       | */
  [oids._float4]: parseFloatArray, /*            |  700 |     1021 | _float4      | */
  [oids._float8]: parseFloatArray, /*            |  701 |     1022 | _float8      | */
  [oids._circle]: parseCircleArray, /*           |  718 |      719 | _circle      | */
  [oids._timestamp]: parseTimestampArray, /*     | 1114 |     1115 | _timestamp   | */
  [oids._timestamptz]: parseTimestampTzArray, /* | 1184 |     1185 | _timestamptz | */
  [oids._interval]: parseIntervalArray, /*       | 1186 |     1187 | _interval    | */
  [oids._jsonb]: parseJsonArray, /*              | 3802 |     3807 | _jsonb       | */

  /* Other known array types                             |_oid__|_typname___| */
  [oids._cidr]: parseArray, /*                           |  651 | _cidr     | */
  [oids._money]: parseArray, /*                          |  791 | _money    | */
  [oids._regproc]: parseArray, /*                        | 1008 | _regproc  | */
  [oids._text]: parseArray, /*                           | 1009 | _text     | */
  [oids._bpchar]: parseArray, /*                         | 1014 | _bpchar   | */
  [oids._varchar]: parseArray, /*                        | 1015 | _varchar  | */
  [oids._macaddr]: parseArray, /*                        | 1040 | _macaddr  | */
  [oids._inet]: parseArray, /*                           | 1041 | _inet     | */
  [oids._date]: parseArray, /*                           | 1182 | _date     | */
  [oids._time]: parseArray, /*                           | 1183 | _time     | */
  [oids._numeric]: parseArray, /*                        | 1231 | _numeric  | */
  [oids._timetz]: parseArray, /*                         | 1270 | _timetz   | */
  [oids._uuid]: parseArray, /*                           | 2951 | _uuid     | */
  [oids._numrange]: parseArray, /*                       | 3907 | _numrange | */

  /* Range types                                       |_oid__|_typname_____| */
  [oids.int4range]: parseIntRange, /*                  | 3904 | int4range   | */
  [oids.numrange]: parseFloatRange, /*                 | 3906 | numrange    | */
  [oids.tsrange]: parseTimestampRange, /*              | 3908 | tsrange     | */
  [oids.tstzrange]: parseTimestampTzRange, /*          | 3910 | tstzrange   | */
  [oids.daterange]: parseRange, /*                     | 3912 | daterange   | */
  [oids.int8range]: parseBigIntRange, /*               | 3926 | int8range   | */
}

class RegistryImpl implements Registry {
  private _parsers: Record<number, PGParser<any>>

  constructor() {
    this._parsers = { ...defaultParsers }
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
    return this._parsers[oid] || identityParser
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
