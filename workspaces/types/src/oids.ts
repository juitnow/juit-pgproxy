/**
 * Relevant OIDS.
 *
 * See the `pg_type` table, or the values listed in the sources at:
 * https://github.com/postgres/postgres/blob/master/src/include/catalog/pg_type.dat
 */
export const oids = {
  /* Basic known types                                |_oid__|_typname______| */
  bool: 16, /*                                        |   16 | bool         | */
  bytea: 17, /*                                       |   17 | bytea        | */
  int8: 20, /*                                        |   20 | int8         | */
  int2: 21, /*                                        |   21 | int2         | */
  int4: 23, /*                                        |   23 | int4         | */
  oid: 26, /*                                         |   26 | oid          | */
  json: 114, /*                                       |  114 | json         | */
  point: 600, /*                                      |  600 | point        | */
  float4: 700, /*                                     |  700 | float4       | */
  float8: 701, /*                                     |  701 | float8       | */
  circle: 718, /*                                     |  718 | circle       | */
  timestamp: 1114, /*                                 | 1114 | timestamp    | */
  timestamptz: 1184, /*                               | 1184 | timestamptz  | */
  interval: 1186, /*                                  | 1186 | interval     | */
  jsonb: 3802, /*                                     | 3802 | jsonb        | */

  /* Special types                                    |_oid__|_typname______| */
  void: 2278, /* function returns no value.           | 2278 | void         | */
  xid: 28, /*    transaction id (int4)                |   28 | xid          | */
  xid8: 5069, /* transaction id (int8)                | 5069 | xid8         | */
  _xid: 1011, /* array of transaction ids (_int4)     | 1011 | _xid         | */
  _xid8: 271, /* array of transaction ids (_int8)     |  271 | _xid8        | */

  /* Native array types of the above                  |_oid__|_typname______|_base_| */
  _bool: 1000, /*                                     | 1000 | _bool        |   16 | */
  _bytea: 1001, /*                                    | 1001 | _bytea       |   17 | */
  _int8: 1016, /*                                     | 1016 | _int8        |   20 | */
  _int2: 1005, /*                                     | 1005 | _int2        |   21 | */
  _int4: 1007, /*                                     | 1007 | _int4        |   23 | */
  _oid: 1028, /*                                      | 1028 | _oid         |   26 | */
  _json: 199, /*                                      |  199 | _json        |  114 | */
  _point: 1017, /*                                    | 1017 | _point       |  600 | */
  _float4: 1021, /*                                   | 1021 | _float4      |  700 | */
  _float8: 1022, /*                                   | 1022 | _float8      |  701 | */
  _circle: 719, /*                                    |  719 | _circle      |  718 | */
  _timestamp: 1115, /*                                | 1115 | _timestamp   | 1114 | */
  _timestamptz: 1185, /*                              | 1185 | _timestamptz | 1184 | */
  _interval: 1187, /*                                 | 1187 | _interval    | 1186 | */
  _jsonb: 3807, /*                                    | 3807 | _jsonb       | 3802 | */

  /* Other known array types                          |_oid__|_typname______| */
  _cidr: 651, /*                                      |  651 | _cidr        | */
  _money: 791, /*                                     |  791 | _money       | */
  _regproc: 1008, /*                                  | 1008 | _regproc     | */
  _text: 1009, /*                                     | 1009 | _text        | */
  _bpchar: 1014, /*                                   | 1014 | _bpchar      | */
  _varchar: 1015, /*                                  | 1015 | _varchar     | */
  _macaddr: 1040, /*                                  | 1040 | _macaddr     | */
  _inet: 1041, /*                                     | 1041 | _inet        | */
  _date: 1182, /*                                     | 1182 | _date        | */
  _time: 1183, /*                                     | 1183 | _time        | */
  _numeric: 1231, /*                                  | 1231 | _numeric     | */
  _timetz: 1270, /*                                   | 1270 | _timetz      | */
  _uuid: 2951, /*                                     | 2951 | _uuid        | */

  /* Range types                                      |_oid__|_typname______| */
  int4range: 3904, /*                                 | 3904 | int4range    | */
  numrange: 3906, /*                                  | 3906 | numrange     | */
  tsrange: 3908, /*                                   | 3908 | tsrange      | */
  tstzrange: 3910, /*                                 | 3910 | tstzrange    | */
  daterange: 3912, /*                                 | 3912 | daterange    | */
  int8range: 3926, /*                                 | 3926 | int8range    | */

  /* Array of range types                             |_oid__|_typname______|_base_| */
  _int4range: 3905, /*                                | 3905 | _int4range   | 3904 | */
  _numrange: 3907, /*                                 | 3907 | _numrange    | 3906 | */
  _tsrange: 3909, /*                                  | 3909 | _tsrange     | 3908 | */
  _tstzrange: 3911, /*                                | 3911 | _tstzrange   | 3910 | */
  _daterange: 3913, /*                                | 3913 | _daterange   | 3912 | */
  _int8range: 3927, /*                                | 3927 | _int8range   | 3926 | */
} as const

/** The PostgreSQL type name of know OIDs */
export type PGTypeName = typeof oids

Object.freeze(oids)
