import { randomBytes } from 'node:crypto'

import { Connection } from '@juit/pgproxy-pool'

import { databaseName } from '../../../support/setup-db'
import { TestLogger } from '../../../support/utils'
import { PGCircle, PGInterval, PGOIDs, PGPoint, PGRange, Registry } from '../src'
import { serialize, serializeByteA, serializeDateUTC } from '../src/serializers'


import type { PGSerializable } from '../src/serializers'

describe('Serializers', () => {
  it('should serialize buffers and array views as bytea', () => {
    const buf = Buffer.from('deadbeef', 'hex')
    const ui8 = new Uint8Array([ 0xde, 0xad, 0xbe, 0xef ])
    const u32 = new Uint32Array([ 0xefbeadde ]) // little endian...

    // get Buffer instance as an optional parameter
    expect(serializeByteA(buf)).toEqual('\\xdeadbeef')
    expect(serializeByteA(ui8)).toEqual('\\xdeadbeef')
    expect(serializeByteA(u32)).toEqual('\\xdeadbeef')

    // force the use of NodeJS "Buffer"
    expect(serializeByteA(buf, Buffer)).toEqual('\\xdeadbeef')
    expect(serializeByteA(ui8, Buffer)).toEqual('\\xdeadbeef')
    expect(serializeByteA(u32, Buffer)).toEqual('\\xdeadbeef')

    // force the _lack_ of NodeJS "Buffer", and test our manual code
    expect(serializeByteA(buf, null)).toEqual('\\xdeadbeef')
    expect(serializeByteA(ui8, null)).toEqual('\\xdeadbeef')
    expect(serializeByteA(u32, null)).toEqual('\\xdeadbeef')

    // random length, 100 times, just to be safe...
    for (let i = 0; i < 100; i ++) {
      const random = randomBytes(32 + (Math.random() * 64))
      const expected = `\\x${random.toString('hex')}`

      expect(serializeByteA(random)).toEqual(expected)
      expect(serializeByteA(random, Buffer)).toEqual(expected)
      expect(serializeByteA(random, null)).toEqual(expected)
    }

    // check errors
    expect(() => serializeByteA('foo' as any))
        .toThrowError(TypeError, 'Unsupported type for serialization as BYTEA')
    expect(() => serializeByteA('foo' as any, Buffer))
        .toThrowError(TypeError, 'Unsupported type for serialization as BYTEA')
    expect(() => serializeByteA('foo' as any, null))
        .toThrowError(TypeError, 'Unsupported type for serialization as BYTEA')
  })

  it('should serialize dates as timestamps in the utc time zone', () => {
    // more or less "now" (I'm writing the code)
    expect(serializeDateUTC(new Date('Fri Sep 08 2023 00:25:34 GMT+0200')))
        .toEqual('2023-09-07T22:25:34.000+00:00')
    expect(serializeDateUTC(new Date('Fri Sep 08 2023 00:25:34 GMT-0200')))
        .toEqual('2023-09-08T02:25:34.000+00:00')
    // 100 bc.. it seems JS always use the "+01:00" timezone for BC
    expect(serializeDateUTC(new Date('-000100-01-01T12:00:00.000-03:00')))
        .toEqual('0101-01-01T15:00:00.000+00:00 BC') // ... hmm... timezones for BC
    expect(serializeDateUTC(new Date('-000100-01-01T12:00:00.000+03:00')))
        .toEqual('0101-01-01T09:00:00.000+00:00 BC') // ... hmm... timezones for BC
    // error
    expect(() => serializeDateUTC(new Date(NaN)))
        .toThrowError(TypeError, 'Attempted to serialize invalid date')
  })

  it('should serialize (or not) some primitives', () => {
    expect(serialize('foobar')).toEqual('foobar')
    expect(serialize(123.456)).toEqual('123.456')
    expect(serialize(123456n)).toEqual('123456')
    expect(serialize(false)).toEqual('false')
    expect(serialize(true)).toEqual('true')

    expect(() => serialize(null)).toThrowError(TypeError, 'Can not serialize "null"')
    expect(() => serialize(undefined)).toThrowError(TypeError, 'Can not serialize "undefined"')
    expect(() => serialize(Symbol())).toThrowError(TypeError, 'Can not serialize "symbol"')
    expect(() => serialize(() => {})).toThrowError(TypeError, 'Can not serialize "function"')
  })

  it('should serialize and cache results', () => {
    let count = 0
    const object: PGSerializable = {
      toPostgres: () => `hello, world! ${++ count}`,
    }

    expect(serialize(object)).toEqual('hello, world! 1')
    expect(serialize(object)).toEqual('hello, world! 1')

    const array = [ object ] // the array serialization will be cached
    expect(serialize([ array, array ]))
        .toEqual('{{"hello, world! 1"},{"hello, world! 1"}}')
  })

  it('should serialize some basic object types', () => {
    expect(serialize(new Date('Fri Sep 08 2023 00:25:34 GMT+0200')))
        .toEqual('2023-09-07T22:25:34.000+00:00')
    expect(serialize(Buffer.from('deadbeef', 'hex')))
        .toEqual('\\xdeadbeef')
    expect(serialize({ foo: 'bar', baz: [ true, 123.45 ] }))
        .toEqual('{"foo":"bar","baz":[true,123.45]}')
  })

  it('should serialize some basic array with elements', () => {
    expect(serialize([
      null,
      undefined,
      Buffer.from('deadbeef', 'hex'),
      'a string...',
      { foo: 'bar', baz: [ true, 123.45 ] },
    ])).toEqual(
        '{NULL,NULL,"\\\\xdeadbeef","a string...","{\\"foo\\":\\"bar\\",\\"baz\\":[true,123.45]}"}',
    )
  })

  it('should fail on value circularity issues', () => {
    const object: PGSerializable = {
      toPostgres: (ser) => ser(object),
    }

    expect(() => serialize(object))
        .toThrowError(TypeError, 'Circularity detected serializing')
  })

  it('should fail on array circularity issues', () => {
    const array: any[] = []
    array.push(array)

    expect(() => serialize(array))
        .toThrowError(TypeError, 'Circularity detected serializing')
  })

  it('should serialize a nested array', () => {
    expect(serialize([
      [ 1, 2, 3 ],
      [ 'a', 'b' ],
    ])).toEqual('{{"1","2","3"},{"a","b"}}')
  })

  it('should serialize geometric types', () => {
    const point = new PGPoint(1, 2)
    const circle = new PGCircle(3.4, 5.6, 7.8)
    expect(serialize([ point, circle ]))
        .toEqual('{"(1,2)","<(3.4,5.6),7.8>"}')
  })

  it('should serialize ranges', () => {
    const numRange = new PGRange(0.123, 100n as any, PGRange.RANGE_LB_INC)
    expect(serialize(numRange)).toEqual('[0.123,100)')

    const stringRange = new PGRange('bar,bar', 'foo', PGRange.RANGE_UB_INC)
    expect(serialize(stringRange)).toEqual('("bar,bar",foo]')
  })

  describe('loop test', () => {
    const registry = new Registry()
    let connection: Connection

    const samples: Record<keyof PGOIDs, { input: any, text: string | null, expected?: any }[] | undefined> = {
      /* ===== BASIC TYPES ================================================== */

      bool: [
        { input: true, text: 't' },
        { input: false, text: 'f' },
      ],
      bytea: [ { input: Buffer.from('deadbeef', 'hex'), text: '\\xdeadbeef' } ],
      int8: [
        { input: 1234567890, text: '1234567890', expected: 1234567890n },
        { input: -2901n, text: '-2901', expected: -2901n },
      ],
      int2: [ { input: 12345, text: '12345' } ],
      int4: [ { input: 1234567890, text: '1234567890' } ],
      oid: [ { input: PGOIDs.oid, text: `${PGOIDs.oid}` } ],
      json: [
        { input: { foo: 'bar' }, text: '{"foo":"bar"}' },
        { input: JSON.stringify({ foo: 'bar' }), text: '{"foo":"bar"}', expected: { foo: 'bar' } },
      ],
      point: [
        { input: new PGPoint(1.2, 3.4), text: '(1.2,3.4)' },
        { input: '(4.3,2.1)', text: '(4.3,2.1)', expected: new PGPoint(4.3, 2.1) },
      ],
      float4: [
        { input: 123.456, text: '123.456' },
        { input: 123456n, text: '123456', expected: 123456 },
        { input: '123.456', text: '123.456', expected: 123.456 },
      ],
      float8: [
        { input: 123.456, text: '123.456' },
        { input: 123456n, text: '123456', expected: 123456 },
        { input: '123.456', text: '123.456', expected: 123.456 },
      ],
      circle: [
        { input: new PGCircle(1.2, 3.4, 5.6), text: '<(1.2,3.4),5.6>' },
        { input: '<(5.4,3.2),1>', text: '<(5.4,3.2),1>', expected: new PGCircle(5.4, 3.2, 1) },
      ],
      timestamp: [
        { input: new Date('2023-09-07T22:25:34.000Z'), text: '2023-09-07 22:25:34' },
        { input: '2023-09-07 22:25:34+02', text: '2023-09-07 22:25:34', expected: new Date('2023-09-07T22:25:34.000Z') },
      ],
      timestamptz: [
        { input: new Date('2023-09-07T22:25:34.000Z'), text: '2023-09-08 00:25:34+02' },
        { input: '2023-09-07 22:25:34-02', text: '2023-09-08 02:25:34+02', expected: new Date('2023-09-08T00:25:34.000Z') },
      ],
      interval: [
        { input: '1 hour', text: '01:00:00', expected: new PGInterval('01:00:00') },
        { input: '2 day 3 minutes', text: '2 days 00:03:00', expected: new PGInterval('2 days 00:03:00') },
        { input: new PGInterval('1 mon'), text: '1 mon' },
      ],
      jsonb: [ // jsonb is serialized with a *space* ???
        { input: { foo: 'bar' }, text: '{"foo": "bar"}' },
        { input: JSON.stringify({ foo: 'bar' }), text: '{"foo": "bar"}', expected: { foo: 'bar' } },
      ],

      /* ===== ARRAYS OF BASIC TYPES ======================================== */

      _bool: [ { input: [ true, false ], text: '{t,f}' } ],
      _bytea: [ { input: [ Buffer.from('cafebabe', 'hex'), Buffer.from('deadbeef', 'hex') ], text: '{"\\\\xcafebabe","\\\\xdeadbeef"}' } ],
      _int8: [ { input: [ 1, 2, 3, 4 ], text: '{1,2,3,4}', expected: [ 1n, 2n, 3n, 4n ] } ],
      _int2: [ { input: [ 1, 2, 3, 4 ], text: '{1,2,3,4}' } ],
      _int4: [ { input: [ 1, 2, 3, 4 ], text: '{1,2,3,4}' } ],
      _oid: [ { input: [ 1, 2, 3, 4 ], text: '{1,2,3,4}' } ],
      _json: [ { input: [ { foo: 'bar' }, { baz: true } ], text: '{"{\\"foo\\":\\"bar\\"}","{\\"baz\\":true}"}' } ],
      _point: [ { input: [ new PGPoint(1.2, 3.4), new PGPoint(5.6, 7.8) ], text: '{"(1.2,3.4)","(5.6,7.8)"}' } ],
      _float4: [ { input: [ 1.2, 3.4 ], text: '{1.2,3.4}' } ],
      _float8: [ { input: [ 1.2, 3.4 ], text: '{1.2,3.4}' } ],
      _circle: [ { input: [ new PGCircle(1.2, 3.4, 5), new PGCircle(6, 7.8, 9) ], text: '{"<(1.2,3.4),5>","<(6,7.8),9>"}' } ],
      _timestamp: [ { input: [ new Date('2023-09-07T22:25:34.000Z') ], text: '{"2023-09-07 22:25:34"}' } ],
      _timestamptz: [ { input: [ new Date('2023-09-07T22:25:34.000Z') ], text: '{"2023-09-08 00:25:34+02"}' } ],
      _interval: [
        { input: [ '1 hour', '1 second' ], text: '{01:00:00,00:00:01}', expected: [ new PGInterval('01:00:00'), new PGInterval('00:00:01') ] },
        { input: [ new PGInterval('1 day'), new PGInterval('00:01:02') ], text: '{"1 day",00:01:02}', expected: [ new PGInterval('1 day'), new PGInterval('00:01:02') ] },
      ],
      _jsonb: [ { input: [ { foo: 'bar' }, { baz: true } ], text: '{"{\\"foo\\": \\"bar\\"}","{\\"baz\\": true}"}' } ],

      /* ===== OTHER ARRAYS ================================================= */

      _cidr: [ {
        input: [ '1.2.3.4', '10.1' ],
        text: '{1.2.3.4/32,10.1.0.0/16}',
        expected: [ '1.2.3.4/32', '10.1.0.0/16' ],
      } ],
      _money: [ {
        input: [ '12.34', 55 ],
        text: '{$12.34,$55.00}',
        expected: [ '$12.34', '$55.00' ],
      } ],
      _regproc: [ {
        input: [ 'pg_sleep', 'cidr' ],
        text: '{pg_sleep,cidr}',
        expected: [ 'pg_sleep', 'cidr' ],
      } ],
      _text: [ {
        input: [ 'foo', 'b,ar' ],
        text: '{foo,"b,ar"}',
        expected: [ 'foo', 'b,ar' ],
      } ],
      _bpchar: [ {
        input: [ 'foo', 'b,ar' ],
        text: '{foo,"b,ar"}',
        expected: [ 'foo', 'b,ar' ],
      } ],
      _varchar: [ {
        input: [ 'foo', 'b,ar' ],
        text: '{foo,"b,ar"}',
        expected: [ 'foo', 'b,ar' ],
      } ],
      _macaddr: [ {
        input: [ '08002b010203', '0800-2b01-0203' ],
        text: '{08:00:2b:01:02:03,08:00:2b:01:02:03}',
        expected: [ '08:00:2b:01:02:03', '08:00:2b:01:02:03' ],
      } ],
      _inet: [ {
        input: [ '1.2.3.4', '10.1.2.3/16' ],
        text: '{1.2.3.4,10.1.2.3/16}',
        expected: [ '1.2.3.4', '10.1.2.3/16' ],
      } ],
      _date: [ {
        input: [ new Date(0), new Date('2023-09-07T22:25:34.000Z') ],
        text: '{1970-01-01,2023-09-07}',
        expected: [ '1970-01-01', '2023-09-07' ],
      } ],
      _time: [ {
        input: [ '00:01:02', '03:04:05.123' ],
        text: '{00:01:02,03:04:05.123}',
        expected: [ '00:01:02', '03:04:05.123' ],
      } ],
      _numeric: [ {
        input: [ 123.45, 67890 ],
        text: '{123.45,67890}',
        expected: [ '123.45', '67890' ],
      } ],
      _timetz: [ {
        input: [ '00:01:02', '03:04:05.123' ],
        text: '{00:01:02+02,03:04:05.123+02}',
        expected: [ '00:01:02+02', '03:04:05.123+02' ],
      } ],
      _uuid: [ {
        input: [ 'BD336914-CDD4-4EA8-A603-6D4FDA4E0424', 'FC5EA4AF-E835-4048-A6C5-16E96343FC56' ],
        text: '{bd336914-cdd4-4ea8-a603-6d4fda4e0424,fc5ea4af-e835-4048-a6c5-16e96343fc56}',
        expected: [ 'bd336914-cdd4-4ea8-a603-6d4fda4e0424', 'fc5ea4af-e835-4048-a6c5-16e96343fc56' ],
      } ],

      /* ===== RANGE TYPES ================================================== */

      int4range: [ { // postgres "optimizes" int ranges..
        input: new PGRange(0, 100, 0),
        text: '[1,100)',
        expected: new PGRange(1, 100, PGRange.RANGE_LB_INC),
      }, {
        input: '(0,100)',
        text: '[1,100)',
        expected: new PGRange(1, 100, PGRange.RANGE_LB_INC),
      } ],
      numrange: [ { // numeric ranges are fixed precisions, so string back plz!
        input: new PGRange(0.123, 99.9, 0),
        text: '(0.123,99.9)',
        expected: new PGRange('0.123', '99.9', 0),
      }, {
        input: '(0.123,99.9)',
        text: '(0.123,99.9)',
        expected: new PGRange('0.123', '99.9', 0),
      } ],
      tsrange: [ {
        input: new PGRange(new Date(0), new Date('2023-09-07T22:25:34.000Z'), 0),
        text: '("1970-01-01 00:00:00","2023-09-07 22:25:34")',
      } ],
      tstzrange: [ {
        input: new PGRange(new Date(0), new Date('2023-09-07T22:25:34.000Z'), 0),
        text: '("1970-01-01 01:00:00+01","2023-09-08 00:25:34+02")',
      } ],
      daterange: [ { // postgres "optimizes" date ranges, too..
        input: new PGRange('1970-01-01', '2023-09-07', 0),
        text: '[1970-01-02,2023-09-07)',
        expected: new PGRange('1970-01-02', '2023-09-07', PGRange.RANGE_LB_INC),
      }, {
        input: '(1970-01-01,2023-09-07)',
        text: '[1970-01-02,2023-09-07)',
        expected: new PGRange('1970-01-02', '2023-09-07', PGRange.RANGE_LB_INC),
      } ],
      int8range: [ { // postgres "optimizes" int ranges..
        input: new PGRange(0, 100, 0),
        text: '[1,100)',
        expected: new PGRange(1n, 100n, PGRange.RANGE_LB_INC),
      }, {
        input: '(0,100)',
        text: '[1,100)',
        expected: new PGRange(1n, 100n, PGRange.RANGE_LB_INC),
      } ],

      /* ===== ARRAYS OF RANGES ============================================= */

      _int4range: [ { // postgres "optimizes" int ranges..
        input: [ new PGRange(0, 100, 0) ],
        text: '{"[1,100)"}',
        expected: [ new PGRange(1, 100, PGRange.RANGE_LB_INC) ],
      }, {
        input: [ '(0,100)' ],
        text: '{"[1,100)"}',
        expected: [ new PGRange(1, 100, PGRange.RANGE_LB_INC) ],
      } ],
      _numrange: [ { // numeric is fixed precision, so, strings back please!
        input: [ new PGRange(0.123, 99.9, 0) ],
        text: '{"(0.123,99.9)"}',
      }, {
        input: [ '(0.123,99.9)' ],
        text: '{"(0.123,99.9)"}',
        expected: [ new PGRange(0.123, 99.9, 0) ],
      } ],
      _tsrange: [ {
        input: [ new PGRange(new Date(0), new Date('2023-09-07T22:25:34.000Z'), 0) ],
        text: '{"(\\"1970-01-01 00:00:00\\",\\"2023-09-07 22:25:34\\")"}',
      } ],
      _tstzrange: [ {
        input: [ new PGRange(new Date(0), new Date('2023-09-07T22:25:34.000Z'), 0) ],
        text: '{"(\\"1970-01-01 01:00:00+01\\",\\"2023-09-08 00:25:34+02\\")"}',
      } ],
      _daterange: [ { // postgres "optimizes" date ranges, too..
        input: [ new PGRange('1970-01-01', '2023-09-07', 0) ],
        text: '{"[1970-01-02,2023-09-07)"}',
        expected: [ new PGRange('1970-01-02', '2023-09-07', PGRange.RANGE_LB_INC) ],
      }, {
        input: '{(1970-01-01,2023-09-07)}',
        text: '{"[1970-01-02,2023-09-07)"}',
        expected: [ new PGRange('1970-01-02', '2023-09-07', PGRange.RANGE_LB_INC) ],
      } ],
      _int8range: [ { // postgres "optimizes" int ranges..
        input: [ new PGRange(0, 100, 0) ],
        text: '{"[1,100)"}',
        expected: [ new PGRange(1n, 100n, PGRange.RANGE_LB_INC) ],
      }, {
        input: [ '(0,100)' ],
        text: '{"[1,100)"}',
        expected: [ new PGRange(1n, 100n, PGRange.RANGE_LB_INC) ],
      } ],

      /* ===== SPECIAL TYPES ================================================ */

      void: [ { input: 'anything', text: '', expected: null } ],
      xid: [ { input: 0, text: '0' } ],
      xid8: [ { input: 0n, text: '0' } ],
      _xid: [ { input: [ 0 ], text: '{0}' } ],
      _xid8: [ { input: [ 0n ], text: '{0}' } ],
    }

    beforeAll(async () => {
      connection = await new Connection(new TestLogger(), {
        database: databaseName,
      }).connect()
    })

    afterAll(() => connection && connection.destroy())

    for (const [ type, tests ] of Object.entries(samples)) {
      if (! tests) continue // TODO: remove me!
      const oid = PGOIDs[type as keyof PGOIDs]

      it(`should test with the "${type}" type`, async () => {
        if (! tests) return skip() // skip if no test was defined

        for (const test of tests) {
          const { input, text, expected = input } = test

          const query = `SELECT $1::${type} AS result`
          const serialized = input === null ? null : serialize(input)
          const result = await connection.query(`SELECT $1::${type} AS result`, [ serialized ])
          const value = result.rows[0]![0]
          const parsed = value == null ? null : registry.getParser(oid)(value)

          try {
            expect(result.fields, 'Invalid OID from database').toEqual([ [ 'result', oid ] ])
            expect(result.rows.length, 'Invalid number of rows from database').toEqual(1)
            // TODO outgoing serialization // expect(serialized).toStrictlyEqual(text)
            expect(value, 'Serialized value').toStrictlyEqual(text)
            expect(parsed, 'Parsed value').toEqual(expected)
          } catch (error) {
            log({ input, query, serialized, result: { fields: result.fields[0], rows: result.rows[0] }, value, parsed })
            throw error
          }
        }
      })
    }

    void samples
  })
})
