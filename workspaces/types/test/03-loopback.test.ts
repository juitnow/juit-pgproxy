import { Connection } from '@juit/pgproxy-pool'


import { databaseName } from '../../../support/setup-db'
import { TestLogger } from '../../../support/utils'
import { PGCircle, PGInterval, PGOIDs, PGPoint, PGRange, Registry } from '../src'
import { serialize } from '../src/serializers'

import type { ConnectionQueryResult } from '@juit/pgproxy-pool'

describe('Loopback Test', () => {
  const registry = new Registry()
  let connection: Connection

  const samples: Record<keyof PGOIDs, {
    input: any,
    incoming: string,
    outgoing?: string,
    expected?: any,
  }[]> = {

    /* ===== BASIC TYPES ================================================== */

    bool: [ {
      input: true,
      outgoing: 'true',
      incoming: 't',
    }, {
      input: false,
      outgoing: 'false',
      incoming: 'f',
    } ],

    bytea: [ {
      input: Buffer.from('deadbeef', 'hex'),
      incoming: '\\xdeadbeef',
    } ],

    int8: [ {
      input: 1234567890,
      incoming: '1234567890',
      expected: 1234567890n,
    }, {
      input: -2901n,
      incoming: '-2901',
      expected: -2901n,
    } ],

    int2: [ {
      input: 12345,
      incoming: '12345',
    } ],

    int4: [ {
      input: 1234567890,
      incoming: '1234567890',
    } ],

    oid: [ {
      input: PGOIDs.oid,
      incoming: `${PGOIDs.oid}`,
    } ],

    json: [ {
      input: { foo: 'bar' },
      incoming: '{"foo":"bar"}',
    }, {
      input: JSON.stringify({ foo: 'bar' }),
      incoming: '{"foo":"bar"}',
      expected: { foo: 'bar' },
    } ],

    point: [ {
      input: new PGPoint(1.2, 3.4),
      incoming: '(1.2,3.4)',
    }, {
      input: '(4.3,2.1)',
      incoming: '(4.3,2.1)',
      expected: new PGPoint(4.3, 2.1),
    } ],

    float4: [ {
      input: 123.456,
      incoming: '123.456',
    }, {
      input: 123456n,
      incoming: '123456',
      expected: 123456,
    }, {
      input: '123.456',
      incoming: '123.456',
      expected: 123.456,
    } ],

    float8: [ {
      input: 123.456,
      incoming: '123.456',
    }, {
      input: 123456n,
      incoming: '123456',
      expected: 123456,
    }, {
      input: '123.456',
      incoming: '123.456',
      expected: 123.456,
    } ],

    circle: [ {
      input: new PGCircle(1.2, 3.4, 5.6),
      incoming: '<(1.2,3.4),5.6>',
    }, {
      input: '<(5.4,3.2),1>',
      incoming: '<(5.4,3.2),1>',
      expected: new PGCircle(5.4, 3.2, 1),
    } ],

    timestamp: [ {
      input: new Date('2023-09-07T22:25:34.000Z'),
      outgoing: '2023-09-07T22:25:34.000+00:00',
      incoming: '2023-09-07 22:25:34',
    }, {
      input: '2023-09-07 22:25:34+02',
      incoming: '2023-09-07 22:25:34',
      expected: new Date('2023-09-07T22:25:34.000Z'),
    } ],

    timestamptz: [ {
      input: new Date('2023-09-07T22:25:34.000Z'),
      outgoing: '2023-09-07T22:25:34.000+00:00',
      incoming: '2023-09-08 00:25:34+02',
    }, {
      input: '2023-09-07 22:25:34-02',
      incoming: '2023-09-08 02:25:34+02',
      expected: new Date('2023-09-08T00:25:34.000Z'),
    } ],

    interval: [ {
      input: '1 hour',
      incoming: '01:00:00',
      expected: new PGInterval('01:00:00'),
    }, {
      input: '2 day 3 minutes',
      incoming: '2 days 00:03:00',
      expected: new PGInterval('2 days 00:03:00'),
    }, {
      input: new PGInterval('1 mon'),
      outgoing: '1 month',
      incoming: '1 mon',
    } ],

    numeric: [ { // numeric are fixed precisions, so string back plz!
      input: 123.456,
      incoming: '123.456',
      expected: '123.456',
    } ],

    jsonb: [ { // jsonb is serialized with a *space* ???
      input: { foo: 'bar' },
      outgoing: '{"foo":"bar"}',
      incoming: '{"foo": "bar"}',
    }, {
      input: JSON.stringify({ foo: 'bar' }),
      incoming: '{"foo": "bar"}',
      expected: { foo: 'bar' },
    },
    ],

    /* ===== ARRAYS OF BASIC TYPES ======================================== */

    _bool: [ {
      input: [ true, false ],
      outgoing: '{"true","false"}',
      incoming: '{t,f}',
    } ],

    _bytea: [ {
      input: [ Buffer.from('cafebabe', 'hex'), Buffer.from('deadbeef', 'hex') ],
      incoming: '{"\\\\xcafebabe","\\\\xdeadbeef"}',
    } ],

    _int8: [ {
      input: [ 1, 2, 3, 4 ],
      outgoing: '{"1","2","3","4"}',
      incoming: '{1,2,3,4}',
      expected: [ 1n, 2n, 3n, 4n ],
    } ],

    _int2: [ {
      input: [ 1, 2, 3, 4 ],
      outgoing: '{"1","2","3","4"}',
      incoming: '{1,2,3,4}',
    } ],

    _int4: [ {
      input: [ 1, 2, 3, 4 ],
      outgoing: '{"1","2","3","4"}',
      incoming: '{1,2,3,4}',
    } ],

    _oid: [ {
      input: [ 1, 2, 3, 4 ],
      outgoing: '{"1","2","3","4"}',
      incoming: '{1,2,3,4}',
    } ],

    _json: [ {
      input: [ { foo: 'bar' }, { baz: true } ],
      incoming: '{"{\\"foo\\":\\"bar\\"}","{\\"baz\\":true}"}',
    } ],

    _point: [ {
      input: [ new PGPoint(1.2, 3.4), new PGPoint(5.6, 7.8) ],
      incoming: '{"(1.2,3.4)","(5.6,7.8)"}',
    } ],

    _float4: [ {
      input: [ 1.2, 3.4 ],
      outgoing: '{"1.2","3.4"}',
      incoming: '{1.2,3.4}',
    } ],

    _float8: [ {
      input: [ 1.2, 3.4 ],
      outgoing: '{"1.2","3.4"}',
      incoming: '{1.2,3.4}',
    } ],

    _circle: [ {
      input: [ new PGCircle(1.2, 3.4, 5), new PGCircle(6, 7.8, 9) ],
      incoming: '{"<(1.2,3.4),5>","<(6,7.8),9>"}',
    } ],

    _timestamp: [ {
      input: [ new Date('2023-09-07T22:25:34.000Z') ],
      outgoing: '{"2023-09-07T22:25:34.000+00:00"}',
      incoming: '{"2023-09-07 22:25:34"}',
    } ],

    _timestamptz: [ {
      input: [ new Date('2023-09-07T22:25:34.000Z') ],
      outgoing: '{"2023-09-07T22:25:34.000+00:00"}',
      incoming: '{"2023-09-08 00:25:34+02"}',
    } ],

    _interval: [ {
      input: [ '1 hour', '1 second' ],
      outgoing: '{"1 hour","1 second"}',
      incoming: '{01:00:00,00:00:01}',
      expected: [ new PGInterval('01:00:00'), new PGInterval('00:00:01') ],
    }, {
      input: [ new PGInterval('1 day'), new PGInterval('00:01:02') ],
      outgoing: '{"1 day","1 minute 2 seconds"}',
      incoming: '{"1 day",00:01:02}',
      expected: [ new PGInterval('1 day'), new PGInterval('00:01:02') ],
    } ],

    _numeric: [ { // numeric are fixed precisions, so string back plz!
      input: [ 123.45, 67890 ],
      outgoing: '{"123.45","67890"}',
      incoming: '{123.45,67890}',
      expected: [ '123.45', '67890' ],
    } ],

    _jsonb: [ {
      input: [ { foo: 'bar' }, { baz: true } ],
      outgoing: '{"{\\"foo\\":\\"bar\\"}","{\\"baz\\":true}"}',
      incoming: '{"{\\"foo\\": \\"bar\\"}","{\\"baz\\": true}"}',
    } ],

    /* ===== OTHER ARRAYS ================================================= */

    _cidr: [ {
      input: [ '1.2.3.4', '10.1' ],
      outgoing: '{"1.2.3.4","10.1"}',
      incoming: '{1.2.3.4/32,10.1.0.0/16}',
      expected: [ '1.2.3.4/32', '10.1.0.0/16' ],
    } ],

    _money: [ {
      input: [ '12.34', 55 ],
      outgoing: '{"12.34","55"}',
      incoming: '{$12.34,$55.00}',
      expected: [ '$12.34', '$55.00' ],
    } ],

    _regproc: [ {
      input: [ 'pg_sleep', 'cidr' ],
      outgoing: '{"pg_sleep","cidr"}',
      incoming: '{pg_sleep,cidr}',
      expected: [ 'pg_sleep', 'cidr' ],
    } ],

    _text: [ {
      input: [ 'foo', 'b,ar' ],
      outgoing: '{"foo","b,ar"}',
      incoming: '{foo,"b,ar"}',
      expected: [ 'foo', 'b,ar' ],
    } ],

    _bpchar: [ {
      input: [ 'foo', 'b,ar' ],
      outgoing: '{"foo","b,ar"}',
      incoming: '{foo,"b,ar"}',
      expected: [ 'foo', 'b,ar' ],
    } ],

    _varchar: [ {
      input: [ 'foo', 'b,ar' ],
      outgoing: '{"foo","b,ar"}',
      incoming: '{foo,"b,ar"}',
      expected: [ 'foo', 'b,ar' ],
    } ],

    _macaddr: [ {
      input: [ '08002b010203', '0800-2b01-0203' ],
      outgoing: '{"08002b010203","0800-2b01-0203"}',
      incoming: '{08:00:2b:01:02:03,08:00:2b:01:02:03}',
      expected: [ '08:00:2b:01:02:03', '08:00:2b:01:02:03' ],
    } ],

    _inet: [ {
      input: [ '1.2.3.4', '10.1.2.3/16' ],
      outgoing: '{"1.2.3.4","10.1.2.3/16"}',
      incoming: '{1.2.3.4,10.1.2.3/16}',
      expected: [ '1.2.3.4', '10.1.2.3/16' ],
    } ],

    _date: [ {
      input: [ new Date(0), new Date('2023-09-07T22:25:34.000Z') ],
      outgoing: '{"1970-01-01T00:00:00.000+00:00","2023-09-07T22:25:34.000+00:00"}',
      incoming: '{1970-01-01,2023-09-07}',
      expected: [ '1970-01-01', '2023-09-07' ],
    } ],

    _time: [ {
      input: [ '00:01:02', '03:04:05.123' ],
      outgoing: '{"00:01:02","03:04:05.123"}',
      incoming: '{00:01:02,03:04:05.123}',
      expected: [ '00:01:02', '03:04:05.123' ],
    } ],

    _timetz: [ {
      input: [ '00:01:02', '03:04:05.123' ],
      outgoing: '{"00:01:02","03:04:05.123"}',
      incoming: '{00:01:02+02,03:04:05.123+02}',
      expected: [ '00:01:02+02', '03:04:05.123+02' ],
    } ],

    _uuid: [ {
      input: [ 'BD336914-CDD4-4EA8-A603-6D4FDA4E0424', 'FC5EA4AF-E835-4048-A6C5-16E96343FC56' ],
      outgoing: '{"BD336914-CDD4-4EA8-A603-6D4FDA4E0424","FC5EA4AF-E835-4048-A6C5-16E96343FC56"}',
      incoming: '{bd336914-cdd4-4ea8-a603-6d4fda4e0424,fc5ea4af-e835-4048-a6c5-16e96343fc56}',
      expected: [ 'bd336914-cdd4-4ea8-a603-6d4fda4e0424', 'fc5ea4af-e835-4048-a6c5-16e96343fc56' ],
    } ],

    /* ===== RANGE TYPES ================================================== */

    int4range: [ { // postgres "optimizes" int ranges..
      input: new PGRange(0, 100, 0),
      outgoing: '(0,100)',
      incoming: '[1,100)',
      expected: new PGRange(1, 100, PGRange.RANGE_LB_INC),
    }, {
      input: '(0,100)',
      incoming: '[1,100)',
      expected: new PGRange(1, 100, PGRange.RANGE_LB_INC),
    } ],

    numrange: [ { // numeric ranges are fixed precisions, so string back plz!
      input: new PGRange(0.123, 99.9, 0),
      incoming: '(0.123,99.9)',
      expected: new PGRange('0.123', '99.9', 0),
    }, {
      input: '(0.123,99.9)',
      incoming: '(0.123,99.9)',
      expected: new PGRange('0.123', '99.9', 0),
    } ],

    tsrange: [ {
      input: new PGRange(new Date(0), new Date('2023-09-07T22:25:34.000Z'), 0),
      outgoing: '(1970-01-01T00:00:00.000+00:00,2023-09-07T22:25:34.000+00:00)',
      incoming: '("1970-01-01 00:00:00","2023-09-07 22:25:34")',
    } ],

    tstzrange: [ {
      input: new PGRange(new Date(0), new Date('2023-09-07T22:25:34.000Z'), 0),
      outgoing: '(1970-01-01T00:00:00.000+00:00,2023-09-07T22:25:34.000+00:00)',
      incoming: '("1970-01-01 02:00:00+02","2023-09-08 00:25:34+02")',
    } ],

    daterange: [ { // postgres "optimizes" date ranges, too..
      input: new PGRange('1970-01-01', '2023-09-07', 0),
      outgoing: '(1970-01-01,2023-09-07)',
      incoming: '[1970-01-02,2023-09-07)',
      expected: new PGRange('1970-01-02', '2023-09-07', PGRange.RANGE_LB_INC),
    }, {
      input: '(1970-01-01,2023-09-07)',
      incoming: '[1970-01-02,2023-09-07)',
      expected: new PGRange('1970-01-02', '2023-09-07', PGRange.RANGE_LB_INC),
    } ],

    int8range: [ { // postgres "optimizes" int ranges..
      input: new PGRange(0, 100, 0),
      outgoing: '(0,100)',
      incoming: '[1,100)',
      expected: new PGRange(1n, 100n, PGRange.RANGE_LB_INC),
    }, {
      input: '(0,100)',
      incoming: '[1,100)',
      expected: new PGRange(1n, 100n, PGRange.RANGE_LB_INC),
    } ],

    /* ===== ARRAYS OF RANGES ============================================= */

    _int4range: [ { // postgres "optimizes" int ranges..
      input: [ new PGRange(0, 100, 0) ],
      outgoing: '{"(0,100)"}',
      incoming: '{"[1,100)"}',
      expected: [ new PGRange(1, 100, PGRange.RANGE_LB_INC) ],
    }, {
      input: [ '(0,100)' ],
      outgoing: '{"(0,100)"}',
      incoming: '{"[1,100)"}',
      expected: [ new PGRange(1, 100, PGRange.RANGE_LB_INC) ],
    } ],

    _numrange: [ { // numeric is fixed precision, so, strings back please!
      input: [ new PGRange(0.123, 99.9, 0) ],
      incoming: '{"(0.123,99.9)"}',
      expected: [ new PGRange('0.123', '99.9', 0) ],
    }, {
      input: [ '(0.123,99.9)' ],
      incoming: '{"(0.123,99.9)"}',
      expected: [ new PGRange('0.123', '99.9', 0) ],
    } ],

    _tsrange: [ {
      input: [ new PGRange(new Date(0), new Date('2023-09-07T22:25:34.000Z'), 0) ],
      outgoing: '{"(1970-01-01T00:00:00.000+00:00,2023-09-07T22:25:34.000+00:00)"}',
      incoming: '{"(\\"1970-01-01 00:00:00\\",\\"2023-09-07 22:25:34\\")"}',
    } ],

    _tstzrange: [ {
      input: [ new PGRange(new Date(0), new Date('2023-09-07T22:25:34.000Z'), 0) ],
      outgoing: '{"(1970-01-01T00:00:00.000+00:00,2023-09-07T22:25:34.000+00:00)"}',
      incoming: '{"(\\"1970-01-01 02:00:00+02\\",\\"2023-09-08 00:25:34+02\\")"}',
    } ],

    _daterange: [ { // postgres "optimizes" date ranges, too..
      input: [ new PGRange('1970-01-01', '2023-09-07', 0) ],
      outgoing: '{"(1970-01-01,2023-09-07)"}',
      incoming: '{"[1970-01-02,2023-09-07)"}',
      expected: [ new PGRange('1970-01-02', '2023-09-07', PGRange.RANGE_LB_INC) ],
    }, {
      input: '{"(1970-01-01,2023-09-07)"}',
      incoming: '{"[1970-01-02,2023-09-07)"}',
      expected: [ new PGRange('1970-01-02', '2023-09-07', PGRange.RANGE_LB_INC) ],
    } ],

    _int8range: [ { // postgres "optimizes" int ranges..
      input: [ new PGRange(0, 100, 0) ],
      outgoing: '{"(0,100)"}',
      incoming: '{"[1,100)"}',
      expected: [ new PGRange(1n, 100n, PGRange.RANGE_LB_INC) ],
    }, {
      input: [ '(0,100)' ],
      outgoing: '{"(0,100)"}',
      incoming: '{"[1,100)"}',
      expected: [ new PGRange(1n, 100n, PGRange.RANGE_LB_INC) ],
    } ],

    /* ===== SPECIAL TYPES ================================================ */

    void: [ {
      input: 'anything',
      incoming: '',
      expected: null,
    } ],

    xid: [ {
      input: 0,
      incoming: '0',
    } ],

    xid8: [ {
      input: 0n,
      incoming: '0',
    } ],

    _xid: [ {
      input: [ 0 ],
      outgoing: '{"0"}',
      incoming: '{0}',
    } ],

    _xid8: [ {
      input: [ 0n ],
      outgoing: '{"0"}',
      incoming: '{0}',
    } ],
  }

  /* ======================================================================== *
   * ACTUAL TESTS                                                             *
   * ======================================================================== */

  beforeAll(async () => {
    connection = await new Connection(new TestLogger(), {
      database: databaseName,
    }).connect()
    await connection.query('SET TIMEZONE TO +2')
  })

  afterAll(() => connection && connection.destroy())

  for (const [ type, tests ] of Object.entries(samples)) {
    const oid = PGOIDs[type as keyof PGOIDs]

    it(`should test with the "${type}" type`, async () => {
      if (! tests) return skip() // skip if no test was defined

      for (const test of tests) {
        const {
          input, // original input
          expected = input, // expected _parsed_ value
          incoming, // expected incoming serialized value
          outgoing = // expected outgoing serialized value
              typeof input === 'string' ? input : incoming,
        } = test

        let query: string | undefined = undefined
        let serialized: string | null | undefined = undefined
        let result: ConnectionQueryResult | undefined = undefined
        let value: string | null | undefined = undefined
        let parsed: any | undefined = undefined

        try {
          query = `SELECT $1::${type} AS result`
          serialized = input === null ? null : serialize(input)

          result = await connection.query(`SELECT $1::${type} AS result`, [ serialized ])
          value = result.rows[0]![0]
          parsed = value == null ? null : registry.getParser(oid)(value)

          // basics of the test
          expect(result.fields, 'Invalid OID from database').toEqual([ [ 'result', oid ] ])
          expect(result.rows.length, 'Invalid number of rows from database').toEqual(1)

          // serialization: outgoing and incoming
          expect(serialized, 'Outgoing serialized value').toStrictlyEqual(outgoing)
          expect(value, 'Incoming serialized value').toStrictlyEqual(incoming)

          // parsed value
          expect(parsed, 'Parsed value').toEqual(expected)
        } catch (error) {
          log({ input, query, serialized, result: { fields: result?.fields[0], rows: result?.rows[0] }, value, parsed })
          throw error
        }
      }
    })
  }
})
