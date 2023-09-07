export const oids = {
  /* Basic known types                                 |_oid__|_typname_____| */
  bool: 16, /*                                         |   16 | bool        | */
  bytea: 17, /*                                        |   17 | bytea       | */
  int8: 20, /*                                         |   20 | int8        | */
  int2: 21, /*                                         |   21 | int2        | */
  int4: 23, /*                                         |   23 | int4        | */
  oid: 26, /*                                          |   26 | oid         | */
  json: 114, /*                                        |  114 | json        | */
  point: 600, /*                                       |  600 | point       | */
  float4: 700, /*                                      |  700 | float4      | */
  float8: 701, /*                                      |  701 | float8      | */
  circle: 718, /*                                      |  718 | circle      | */
  timestamp: 1114, /*                                  | 1114 | timestamp   | */
  timestamptz: 1184, /*                                | 1184 | timestamptz | */
  interval: 1186, /*                                   | 1186 | interval    | */
  jsonb: 3802, /*                                      | 3802 | jsonb       | */

  /* Native array types of the above       |_oid__|_typarray_|_typname______| */
  _bool: 1000, /*                          |   16 |     1000 | _bool        | */
  _bytea: 1001, /*                         |   17 |     1001 | _bytea       | */
  _int8: 1016, /*                          |   20 |     1016 | _int8        | */
  _int2: 1005, /*                          |   21 |     1005 | _int2        | */
  _int4: 1007, /*                          |   23 |     1007 | _int4        | */
  _oid: 1028, /*                           |   26 |     1028 | _oid         | */
  _json: 199, /*                           |  114 |      199 | _json        | */
  _point: 1017, /*                         |  600 |     1017 | _point       | */
  _float4: 1021, /*                        |  700 |     1021 | _float4      | */
  _float8: 1022, /*                        |  701 |     1022 | _float8      | */
  _circle: 719, /*                         |  718 |      719 | _circle      | */
  _timestamp: 1115, /*                     | 1114 |     1115 | _timestamp   | */
  _timestamptz: 1185, /*                   | 1184 |     1185 | _timestamptz | */
  _interval: 1187, /*                      | 1186 |     1187 | _interval    | */
  _jsonb: 3807, /*                         | 3802 |     3807 | _jsonb       | */

  /* Other known array types                             |_oid__|_typname___| */
  _cidr: 651, /*                                         |  651 | _cidr     | */
  _money: 791, /*                                        |  791 | _money    | */
  _regproc: 1008, /*                                     | 1008 | _regproc  | */
  _text: 1009, /*                                        | 1009 | _text     | */
  _bpchar: 1014, /*                                      | 1014 | _bpchar   | */
  _varchar: 1015, /*                                     | 1015 | _varchar  | */
  _macaddr: 1040, /*                                     | 1040 | _macaddr  | */
  _inet: 1041, /*                                        | 1041 | _inet     | */
  _date: 1182, /*                                        | 1182 | _date     | */
  _time: 1183, /*                                        | 1183 | _time     | */
  _numeric: 1231, /*                                     | 1231 | _numeric  | */
  _timetz: 1270, /*                                      | 1270 | _timetz   | */
  _uuid: 2951, /*                                        | 2951 | _uuid     | */
  _numrange: 3907, /*                                    | 3907 | _numrange | */

  /* Range types                                       |_oid__|_typname_____| */
  int4range: 3904, /*                                  | 3904 | int4range   | */
  numrange: 3906, /*                                   | 3906 | numrange    | */
  tsrange: 3908, /*                                    | 3908 | tsrange     | */
  tstzrange: 3910, /*                                  | 3910 | tstzrange   | */
  daterange: 3912, /*                                  | 3912 | daterange   | */
  int8range: 3926, /*                                  | 3926 | int8range   | */
} as const

Object.freeze(oids)
