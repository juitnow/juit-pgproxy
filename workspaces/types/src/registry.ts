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
  parseString,
  parseTimestamp,
  parseTimestampArray,
  parseTimestampRange,
  parseTimestampTz,
  parseTimestampTzArray,
  parseTimestampTzRange,
  parseVoid,
} from './parsers'

import type { PGParser } from './parsers'

export interface Registry {
  deregisterParser(oid: number): this
  registerParser(oid: number, parser: PGParser<any>): this

  getParser(oid: number): PGParser<any>
}

const defaultParsers: Record<number, PGParser<any>> = {
  /* Basic known types                                 |_oid__|_typname_____| */
  [oids.bool]: parseBool, /*                           |   16 | bool        | */
  [oids.bytea]: parseByteA, /*                         |   17 | bytea       | */
  [oids.int8]: parseBigInt, /*                         |   20 | int8        | */
  [oids.int2]: parseInt, /*                            |   21 | int2        | */
  [oids.int4]: parseInt, /*                            |   23 | int4        | */
  [oids.oid]: parseInt, /*                             |   26 | oid         | */
  [oids.xid]: parseInt, /*                             |   28 | xid         | */
  [oids.json]: parseJson, /*                           |  114 | json        | */
  [oids.point]: parsePoint, /*                         |  600 | point       | */
  [oids.float4]: parseFloat, /*                        |  700 | float4      | */
  [oids.float8]: parseFloat, /*                        |  701 | float8      | */
  [oids.circle]: parseCircle, /*                       |  718 | circle      | */
  [oids.timestamp]: parseTimestamp, /*                 | 1114 | timestamp   | */
  [oids.timestamptz]: parseTimestampTz, /*             | 1184 | timestamptz | */
  [oids.interval]: parseInterval, /*                   | 1186 | interval    | */
  [oids.jsonb]: parseJson, /*                          | 3802 | jsonb       | */
  [oids.xid8]: parseBigInt, /*                         | 5069 | xid8        | */

  /* Special types                                     |_oid__|_typname_____| */
  [oids.void]: parseVoid, /*                           | 2278 | void        | */

  /* Native array types of the above              |_typarray_|_typname______|_oid__| */
  [oids._bool]: parseBoolArray, /*                |     1000 | _bool        |   16 | */
  [oids._bytea]: parseByteAArray, /*              |     1001 | _bytea       |   17 | */
  [oids._int8]: parseBigIntArray, /*              |     1016 | _int8        |   20 | */
  [oids._int2]: parseIntArray, /*                 |     1005 | _int2        |   21 | */
  [oids._int4]: parseIntArray, /*                 |     1007 | _int4        |   23 | */
  [oids._oid]: parseIntArray, /*                  |     1028 | _oid         |   26 | */
  [oids._xid]: parseIntArray, /*                  |     1011 | _xid         |   28 | */
  [oids._json]: parseJsonArray, /*                |      199 | _json        |  114 | */
  [oids._point]: parsePointArray, /*              |     1017 | _point       |  600 | */
  [oids._float4]: parseFloatArray, /*             |     1021 | _float4      |  700 | */
  [oids._float8]: parseFloatArray, /*             |     1022 | _float8      |  701 | */
  [oids._circle]: parseCircleArray, /*            |      719 | _circle      |  718 | */
  [oids._timestamp]: parseTimestampArray, /*      |     1115 | _timestamp   | 1114 | */
  [oids._timestamptz]: parseTimestampTzArray, /*  |     1185 | _timestamptz | 1184 | */
  [oids._interval]: parseIntervalArray, /*        |     1187 | _interval    | 1186 | */
  [oids._jsonb]: parseJsonArray, /*               |     3807 | _jsonb       | 3802 | */
  [oids._xid8]: parseBigIntArray, /*              |      271 | _xid8        | 5069 | */

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
