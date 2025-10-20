import { PGOIDs } from '@juit/pgproxy-types'
import ts from 'typescript'

import { serializeSchema } from '../src/index'

describe('Schema Generator', () => {
  it('should serialize an unknown oid', () => {
    const schema = { t: { c: { oid: 1234567890 } } }
    const source = serializeSchema(schema, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source).toStrictlyEqual('export interface s { "t": { "c": { type: string; }; }; }')
  })

  it('should serialize an enum', () => {
    const schema = { t: { c: { oid: 1234567890, enumValues: [ 'foo', 'bar', 'baz' ] } } } as const
    const source = serializeSchema(schema, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source).toStrictlyEqual('export interface s { "t": { "c": { type: "foo" | "bar" | "baz"; }; }; }')
  })

  it('should override types serializing', () => {
    const schema = { t: { c: { oid: 1234567890, enumValues: [ 'foo', 'bar', 'baz' ] } } } as const
    const source = serializeSchema(schema, 's', {
      1234567890: ts.factory.createTypeReferenceNode('FooBar'),
    }).replaceAll(/\s+/g, ' ').trim()
    expect(source).toStrictlyEqual('export interface s { "t": { "c": { type: FooBar; }; }; }')
  })

  it('should add column comments', () => {
    const schema = { t: { c: { oid: 1234567890, description: 'Hello, world' } } }
    const source = serializeSchema(schema, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source).toStrictlyEqual('export interface s { "t": { /** Hello, world */ "c": { type: string; }; }; }')
  })

  it('should consider "isGenerated"', () => {
    const schema1 = { t: { c: { oid: 1234567890, isGenerated: true } } }
    const source1 = serializeSchema(schema1, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source1).toStrictlyEqual('export interface s { "t": { "c": { type: string; isGenerated: true; }; }; }')

    const schema2 = { t: { c: { oid: 1234567890, isGenerated: false } } }
    const source2 = serializeSchema(schema2, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source2).toStrictlyEqual('export interface s { "t": { "c": { type: string; }; }; }')

    const schema3 = { t: { c: { oid: 1234567890 } } } // default false
    const source3 = serializeSchema(schema3, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source3).toStrictlyEqual('export interface s { "t": { "c": { type: string; }; }; }')
  })

  it('should consider "isNullable"', () => {
    const schema1 = { t: { c: { oid: 1234567890, isNullable: true } } }
    const source1 = serializeSchema(schema1, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source1).toStrictlyEqual('export interface s { "t": { "c": { type: string; isNullable: true; }; }; }')

    const schema2 = { t: { c: { oid: 1234567890, isNullable: false } } }
    const source2 = serializeSchema(schema2, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source2).toStrictlyEqual('export interface s { "t": { "c": { type: string; }; }; }')

    const schema3 = { t: { c: { oid: 1234567890 } } } // default false
    const source3 = serializeSchema(schema3, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source3).toStrictlyEqual('export interface s { "t": { "c": { type: string; }; }; }')
  })

  it('should consider "hasDefault"', () => {
    const schema1 = { t: { c: { oid: 1234567890, hasDefault: true } } }
    const source1 = serializeSchema(schema1, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source1).toStrictlyEqual('export interface s { "t": { "c": { type: string; hasDefault: true; }; }; }')

    const schema2 = { t: { c: { oid: 1234567890, hasDefault: false } } }
    const source2 = serializeSchema(schema2, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source2).toStrictlyEqual('export interface s { "t": { "c": { type: string; }; }; }')

    const schema3 = { t: { c: { oid: 1234567890 } } } // default false
    const source3 = serializeSchema(schema3, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source3).toStrictlyEqual('export interface s { "t": { "c": { type: string; }; }; }')
  })

  it('should escape table and column names', () => {
    const schema = {
      't': { c: { oid: 1234567890 } },
      't\'1': { 'c\'1': { oid: 1234567891 } },
      't"2': { 'c"2': { oid: 1234567892 } },
    }
    const source = serializeSchema(schema, 's').replaceAll(/\s+/g, ' ').trim()
    expect(source).toStrictlyEqual(`
      export interface s {
        "t": { "c": { type: string; }; };
        "t'1": { "c'1": { type: string; }; };
        "t\\"2": { "c\\"2": { type: string; }; };
      }
    `.replaceAll(/\s+/g, ' ').trim())
  })

  describe('Known Types', () => {
    const checks = {
      /* Basic known types                                                                |_oid__|_typname______| */
      [PGOIDs.bool]: 'boolean', /*                                                        |   16 | bool         | */
      [PGOIDs.bytea]: 'Uint8Array', /*                                                    |   17 | bytea        | */
      [PGOIDs.int8]: 'bigint', /*                                                         |   20 | int8         | */
      [PGOIDs.int2]: 'number', /*                                                         |   21 | int2         | */
      [PGOIDs.int4]: 'number', /*                                                         |   23 | int4         | */
      [PGOIDs.oid]: 'number', /*                                                          |   26 | oid          | */
      [PGOIDs.json]: 'any', /*                                                            |  114 | json         | */
      [PGOIDs.point]: 'import("@juit/pgproxy-types").PGPoint', /*                         |  600 | point        | */
      [PGOIDs.float4]: 'number', /*                                                       |  700 | float4       | */
      [PGOIDs.float8]: 'number', /*                                                       |  701 | float8       | */
      [PGOIDs.circle]: 'import("@juit/pgproxy-types").PGCircle', /*                       |  718 | circle       | */
      [PGOIDs.varchar]: 'string', /*                                                      | 1043 | varchar      | */
      [PGOIDs.timestamp]: 'Date', /*                                                      | 1114 | timestamp    | */
      [PGOIDs.timestamptz]: 'Date', /*                                                    | 1184 | timestamptz  | */
      [PGOIDs.interval]: 'import("@juit/pgproxy-types").PGInterval', /*                   | 1186 | interval     | */
      [PGOIDs.numeric]: 'string', /*                                                      | 1700 | numeric      | */
      [PGOIDs.uuid]: 'string; branding: { __uuid: never; }', /*                           | 2950 | uuid         | */
      [PGOIDs.jsonb]: 'any', /*                                                           | 3802 | jsonb        | */

      /* Special types                                                                    |_oid__|_typname______| */
      [PGOIDs.void]: 'void', /*                                                           | 2278 | void         | */
      [PGOIDs.xid]: 'number', /*                                                          |   28 | xid          | */
      [PGOIDs.xid8]: 'bigint', /*                                                         | 5069 | xid8         | */
      [PGOIDs._xid]: '(number | null)[]', /*                                              | 1011 | _xid         | */
      [PGOIDs._xid8]: '(bigint | null)[]', /*                                             |  271 | _xid8        | */

      /* Native array types of the above                                                  |_oid__|_typname______| */
      [PGOIDs._bool]: '(boolean | null)[]', /*                                            | 1000 | _bool        | */
      [PGOIDs._bytea]: '(Uint8Array | null)[]', /*                                        | 1001 | _bytea       | */
      [PGOIDs._int8]: '(bigint | null)[]', /*                                             | 1016 | _int8        | */
      [PGOIDs._int2]: '(number | null)[]', /*                                             | 1005 | _int2        | */
      [PGOIDs._int4]: '(number | null)[]', /*                                             | 1007 | _int4        | */
      [PGOIDs._oid]: '(number | null)[]', /*                                              | 1028 | _oid         | */
      [PGOIDs._json]: '(any | null)[]', /*                                                |  199 | _json        | */
      [PGOIDs._point]: '(import("@juit/pgproxy-types").PGPoint | null)[]', /*             | 1017 | _point       | */
      [PGOIDs._float4]: '(number | null)[]', /*                                           | 1021 | _float4      | */
      [PGOIDs._float8]: '(number | null)[]', /*                                           | 1022 | _float8      | */
      [PGOIDs._circle]: '(import("@juit/pgproxy-types").PGCircle | null)[]', /*           |  719 | _circle      | */
      [PGOIDs._timestamp]: '(Date | null)[]', /*                                          | 1115 | _timestamp   | */
      [PGOIDs._timestamptz]: '(Date | null)[]', /*                                        | 1185 | _timestamptz | */
      [PGOIDs._interval]: '(import("@juit/pgproxy-types").PGInterval | null)[]', /*       | 1187 | _interval    | */
      [PGOIDs._numeric]: '(string | null)[]', /*                                          | 1231 | _numeric     | */
      [PGOIDs._jsonb]: '(any | null)[]', /*                                               | 3807 | _jsonb       | */

      /* Other known array types                                                          |_oid__|_typname______| */
      [PGOIDs._cidr]: '(string | null)[]', /*                                             |  651 | _cidr        | */
      [PGOIDs._money]: '(string | null)[]', /*                                            |  791 | _money       | */
      [PGOIDs._regproc]: '(string | null)[]', /*                                          | 1008 | _regproc     | */
      [PGOIDs._text]: '(string | null)[]', /*                                             | 1009 | _text        | */
      [PGOIDs._bpchar]: '(string | null)[]', /*                                           | 1014 | _bpchar      | */
      [PGOIDs._varchar]: '(string | null)[]', /*                                          | 1015 | _varchar     | */
      [PGOIDs._macaddr]: '(string | null)[]', /*                                          | 1040 | _macaddr     | */
      [PGOIDs._inet]: '(string | null)[]', /*                                             | 1041 | _inet        | */
      [PGOIDs._date]: '(string | null)[]', /*                                             | 1182 | _date        | */
      [PGOIDs._time]: '(string | null)[]', /*                                             | 1183 | _time        | */
      [PGOIDs._timetz]: '(string | null)[]', /*                                           | 1270 | _timetz      | */
      [PGOIDs._uuid]: '(string | null)[]', /*                                             | 2951 | _uuid        | */

      /* Range types                                                                      |_oid__|_typname______| */
      [PGOIDs.int4range]: 'import("@juit/pgproxy-types").PGRange<number>', /*             | 3904 | int4range    | */
      [PGOIDs.numrange]: 'import("@juit/pgproxy-types").PGRange<number>', /*              | 3906 | numrange     | */
      [PGOIDs.tsrange]: 'import("@juit/pgproxy-types").PGRange<Date>', /*                 | 3908 | tsrange      | */
      [PGOIDs.tstzrange]: 'import("@juit/pgproxy-types").PGRange<Date>', /*               | 3910 | tstzrange    | */
      [PGOIDs.daterange]: 'import("@juit/pgproxy-types").PGRange<string>', /*             | 3912 | daterange    | */
      [PGOIDs.int8range]: 'import("@juit/pgproxy-types").PGRange<bigint>', /*             | 3926 | int8range    | */

      /* Array of range types                                                             |_oid__|_typname______| */
      [PGOIDs._int4range]: '(import("@juit/pgproxy-types").PGRange<number> | null)[]', /* | 3905 | _int4range   | */
      [PGOIDs._numrange]: '(import("@juit/pgproxy-types").PGRange<number> | null)[]', /*  | 3907 | _numrange    | */
      [PGOIDs._tsrange]: '(import("@juit/pgproxy-types").PGRange<Date> | null)[]', /*     | 3909 | _tsrange     | */
      [PGOIDs._tstzrange]: '(import("@juit/pgproxy-types").PGRange<Date> | null)[]', /*   | 3911 | _tstzrange   | */
      [PGOIDs._daterange]: '(import("@juit/pgproxy-types").PGRange<string> | null)[]', /* | 3913 | _daterange   | */
      [PGOIDs._int8range]: '(import("@juit/pgproxy-types").PGRange<bigint> | null)[]', /* | 3927 | _int8range   | */
    } satisfies Record<PGOIDs[keyof PGOIDs], string>

    for (const [ name, oid ] of Object.entries(PGOIDs)) {
      const string = checks[oid]

      it(`should produce the correct type for "${name}"`, () => {
        const schema = { t: { c: { oid } } }
        const source = serializeSchema(schema, 's').replaceAll(/\s+/g, ' ').trim()
        expect(source).toStrictlyEqual(`export interface s { "t": { "c": { type: ${string}; }; }; }`)
        // log.notice(`${$gry('|')} ${source} // ${$gry(name)}`)
      })
    }
  })
})
