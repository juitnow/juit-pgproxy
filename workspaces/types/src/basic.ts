import {
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
  parseTimestampTzArray,
} from './parsers/array'
import {
  parseBigInt,
  parseBool,
  parseCircle,
  parseInterval,
  parseJson,
  parsePoint,
  parseTimestamp,
  parseTimestampTz,
} from './parsers/basic'
import {
  parseByteA,
} from './parsers/bytea'
import {
  parseBigIntRange,
  parseFloatRange,
  parseIntRange,
  parseRange,
  parseTimestampRange,
  parseTimestampTzRange,
} from './parsers/range'

import type { PGParser } from './types'

export function init(register: (oid: number, parser: PGParser<any>) => void): void {
  /* Basic known types                         |_oid__|_typname_____| */
  register(/* ..   */ 16, parseBool) /*        |   16 | bool        | */
  register(/* ..   */ 17, parseByteA) /*       |   17 | bytea       | */
  register(/* ..   */ 20, parseBigInt) /*      |   20 | int8        | */
  register(/* ..   */ 21, parseInt) /*         |   21 | int2        | */
  register(/* ..   */ 23, parseInt) /*         |   23 | int4        | */
  register(/* ..   */ 26, parseInt) /*         |   26 | oid         | */
  register(/* ..  */ 114, parseJson) /*        |  114 | json        | */
  register(/* ..  */ 600, parsePoint) /*       |  600 | point       | */
  register(/* ..  */ 700, parseFloat) /*       |  700 | float4      | */
  register(/* ..  */ 701, parseFloat) /*       |  701 | float8      | */
  register(/* ..  */ 718, parseCircle) /*      |  718 | circle      | */
  register(/* .. */ 1114, parseTimestamp) /*   | 1114 | timestamp   | */
  register(/* .. */ 1184, parseTimestampTz) /* | 1184 | timestamptz | */
  register(/* .. */ 1186, parseInterval) /*    | 1186 | interval    | */
  register(/* .. */ 3802, parseJson) /*        | 3802 | jsonb       | */

  /* Native array types of the above                |_oid__|_typarray_|_typname______| */
  register(/* .. */ 1000, parseBoolArray) /*        |   16 |     1000 | _bool        | */
  register(/* .. */ 1001, parseByteAArray) /*       |   17 |     1001 | _bytea       | */
  register(/* .. */ 1016, parseBigIntArray) /*      |   20 |     1016 | _int8        | */
  register(/* .. */ 1005, parseIntArray) /*         |   21 |     1005 | _int2        | */
  register(/* .. */ 1007, parseIntArray) /*         |   23 |     1007 | _int4        | */
  register(/* .. */ 1028, parseIntArray) /*         |   26 |     1028 | _oid         | */
  register(/* ..  */ 199, parseJsonArray) /*        |  114 |      199 | _json        | */
  register(/* .. */ 1017, parsePointArray) /*       |  600 |     1017 | _point       | */
  register(/* .. */ 1021, parseFloatArray) /*       |  700 |     1021 | _float4      | */
  register(/* .. */ 1022, parseFloatArray) /*       |  701 |     1022 | _float8      | */
  register(/* ..  */ 719, parseCircleArray) /*      |  718 |      719 | _circle      | */
  register(/* .. */ 1115, parseTimestampArray) /*   | 1114 |     1115 | _timestamp   | */
  register(/* .. */ 1185, parseTimestampTzArray) /* | 1184 |     1185 | _timestamptz | */
  register(/* .. */ 1187, parseIntervalArray) /*    | 1186 |     1187 | _interval    | */
  register(/* .. */ 3807, parseJsonArray) /*        | 3802 |     3807 | _jsonb       | */

  /* Other known array types             |_oid__|_typname___| */
  register(/* ..  */ 651, parseArray) /* |  651 | _cidr     | */
  register(/* ..  */ 791, parseArray) /* |  791 | _money    | */
  register(/* .. */ 1008, parseArray) /* | 1008 | _regproc  | */
  register(/* .. */ 1009, parseArray) /* | 1009 | _text     | */
  register(/* .. */ 1014, parseArray) /* | 1014 | _bpchar   | */
  register(/* .. */ 1015, parseArray) /* | 1015 | _varchar  | */
  register(/* .. */ 1040, parseArray) /* | 1040 | _macaddr  | */
  register(/* .. */ 1041, parseArray) /* | 1041 | _inet     | */
  register(/* .. */ 1182, parseArray) /* | 1182 | _date     | */
  register(/* .. */ 1183, parseArray) /* | 1183 | _time     | */
  register(/* .. */ 1231, parseArray) /* | 1231 | _numeric  | */
  register(/* .. */ 1270, parseArray) /* | 1270 | _timetz   | */
  register(/* .. */ 2951, parseArray) /* | 2951 | _uuid     | */
  register(/* .. */ 3907, parseArray) /* | 3907 | _numrange | */

  /* Range types                                    |_oid__|_typname_____| */
  register(/* .. */ 3904, parseIntRange) /*         | 3904 | int4range   | */
  register(/* .. */ 3906, parseFloatRange) /*       | 3906 | numrange    | */
  register(/* .. */ 3908, parseTimestampRange) /*   | 3908 | tsrange     | */
  register(/* .. */ 3910, parseTimestampTzRange) /* | 3910 | tstzrange   | */
  register(/* .. */ 3912, parseRange) /*            | 3912 | daterange   | */
  register(/* .. */ 3926, parseBigIntRange) /*      | 3926 | int8range   | */
}
