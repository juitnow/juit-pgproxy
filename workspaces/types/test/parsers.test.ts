import {
  PGCircle,
  PGPoint,
  PGRange,
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
} from '../src/index'

describe('Posgres Types', () => {
  describe('basics', () => {
    it('should parse a bigint', () => {
      expect(parseBigInt('1234567890')).toEqual(1234567890n)
    })

    it('should parse a boolean', () => {
      expect(parseBool('TRUE')).toBeTrue()
      expect(parseBool('t')).toBeTrue()
      expect(parseBool('true')).toBeTrue()
      expect(parseBool('y')).toBeTrue()
      expect(parseBool('yes')).toBeTrue()
      expect(parseBool('on')).toBeTrue()
      expect(parseBool('1')).toBeTrue()
      expect(parseBool('false')).toBeFalse()
      expect(parseBool('literally anything else')).toBeFalse()
    })

    it('should parse a string', () => {
      expect(parseString('foo')).toStrictlyEqual('foo')
      expect(parseString('')).toStrictlyEqual('')
      expect(parseString(123 as any)).toStrictlyEqual(123) // identity!
    })

    it('should parse some json', () => {
      expect(parseJson('{"foo":123,"bar":[true]}')).toEqual({ foo: 123, bar: [ true ] })
    })

    it('should parse some timestamps', () => {
      expect(parseTimestamp('2010-10-31 00:00:00')).toEqual(new Date('2010-10-31T00:00:00.000Z'))
      expect(parseTimestamp('1000-01-01 00:00:00 BC')).toEqual(new Date('-000999-01-01T00:00:00.000Z'))
      // edge cases covering wrong values from "postgres-date"
      expect(parseTimestamp('infinity')).toEqual(new Date(NaN))
      expect(parseTimestamp('-infinity')).toEqual(new Date(NaN))
    })

    it('should parse some timestamps with a time zone', () => {
      expect(parseTimestampTz('2010-10-31 14:54:13.74-05:30')).toEqual(new Date('2010-10-31T20:24:13.740Z'))
      expect(parseTimestampTz('2011-01-23 22:05:00.68-06')).toEqual(new Date('2011-01-24T04:05:00.680Z'))
      expect(parseTimestampTz('2010-10-30 14:11:12.730838Z')).toEqual(new Date('2010-10-30T14:11:12.730Z'))
      expect(parseTimestampTz('2010-10-30 13:10:01+05')).toEqual(new Date('2010-10-30T08:10:01.000Z'))
      expect(parseTimestampTz('1000-01-01 00:00:00+00 BC')).toEqual(new Date('-000999-01-01T00:00:00.000Z'))
      // edge cases covering wrong values from "postgres-date"
      expect(parseTimestampTz('infinity')).toEqual(new Date(NaN))
      expect(parseTimestampTz('-infinity')).toEqual(new Date(NaN))
      expect(parseTimestampTz(null as any)).toEqual(new Date(NaN))
    })

    it('should parse a void type', () => {
      expect(parseVoid('foo')).toBeNull()
      expect(parseVoid('')).toBeNull()
    })
  })

  describe('arrays', () => {
    it('should parse some basic arrays', () => {
      expect(parseArray('{}', String), 'empty').toEqual([])
      expect(parseArray('{""}', String), 'empty string').toEqual([ '' ])
      expect(parseArray('{1,2,3}', String), 'numerics').toEqual([ '1', '2', '3' ])
      expect(parseArray('{a,b,c}', String), 'strings').toEqual([ 'a', 'b', 'c' ])
      expect(parseArray('{"\\"\\"\\"","\\\\\\\\\\\\"}', String), 'escaped').toEqual([ '"""', '\\\\\\' ])
      expect(parseArray('{NULL,NULL}', String), 'null').toEqual([ null, null ])

      expect(parseArray('{1,2,3}', Number), 'numerics').toEqual([ 1, 2, 3 ])
      expect(parseArray('[0:2]={1,2,3}', Number), 'numerics').toEqual([ 1, 2, 3 ])

      expect(parseArray('{1,2,{3,4,5}}', Number), 'nested').toEqual([ 1, 2, [ 3, 4, 5 ] ])

      expect(() => parseArray('{1,2,{3,4,5}', Number))
          .toThrowError('array dimension not balanced')
    })

    const samples = [ {
      name: 'bigint',
      parse: parseBigIntArray,
      value: '{123456789,987654321}',
      exp: expect.toEqual([ 123456789n, 987654321n ]),
    }, {
      name: 'bool',
      parse: parseBoolArray,
      value: '{t,nope,TRUE,0,1}',
      exp: expect.toEqual([ true, false, true, false, true ]),
    }, {
      name: 'bytea',
      parse: parseByteAArray,
      value: '{"\\\\xDEADBEEF","flubber\\\\041"}',
      exp: expect.toEqual([ Buffer.from('deadbeef', 'hex'), Buffer.from('flubber!') ]),
    }, {
      name: 'circle',
      parse: parseCircleArray,
      value: '{"<(1,2),3>","<(4,5),6>"}',
      exp: expect.toEqual([ { x: 1, y: 2, radius: 3 }, { x: 4, y: 5, radius: 6 } ]),
    }, {
      name: 'int',
      parse: parseIntArray,
      value: '{1234,43.21}',
      exp: expect.toEqual([ 1234, 43 ]),
    }, {
      name: 'float',
      parse: parseFloatArray,
      value: '{1234,43.21}',
      exp: expect.toEqual([ 1234, 43.21 ]),
    }, {
      name: 'interval',
      parse: parseIntervalArray,
      value: '{"01:00:00","00:01:00"}',
      exp: expect.toEqual([
        { years: 0, months: 0, days: 0, hours: 1, minutes: 0, seconds: 0, milliseconds: 0 },
        { years: 0, months: 0, days: 0, hours: 0, minutes: 1, seconds: 0, milliseconds: 0 },
      ]),
    }, {
      name: 'json',
      parse: parseJsonArray,
      value: '{"{\\"foo\\":true}","[1,false,\\"bar\\"]"}',
      exp: expect.toEqual([ { foo: true }, [ 1, false, 'bar' ] ]),
    }, {
      name: 'point',
      parse: parsePointArray,
      value: '{"(1,2)","(3,4)"}',
      exp: expect.toEqual([ { x: 1, y: 2 }, { x: 3, y: 4 } ]),
    }, {
      name: 'timestamp',
      parse: parseTimestampArray,
      value: '{"1970-01-01 00:00:00.0000","2023-09-07 01:02:03.4567"}',
      exp: expect.toEqual([
        new Date('1970-01-01T00:00:00.000Z'),
        new Date('2023-09-07T01:02:03.456Z'),
      ]),
    }, {
      name: 'timestamptz',
      parse: parseTimestampTzArray,
      value: '{"1970-01-01 00:00:00.0000-02","2023-09-07 01:02:03.4567+02"}',
      exp: expect.toEqual([
        new Date('1970-01-01T02:00:00.000Z'),
        new Date('2023-09-06T23:02:03.456Z'),
      ]),
    } ] as const

    for (const { name, parse, value, exp } of samples) {
      it(`should parse a "${name}" array`, () => {
        expect(parse(value)).toBeA('array', exp)
      })
    }
  })

  describe('bytea', () => {
    const compare = (actual: Uint8Array, expected: number[]): void =>
      void expect(Buffer.from(actual).toString('hex').match(/.{1,2}/g)!.join(' '))
          .toEqual(Buffer.from(expected).toString('hex').match(/.{1,2}/g)!.join(' '))

    it('should parse escaped data', () => {
      const escapedData = [ 0x61, 0x62, 0x63, 0x20, 0o153, 0o154, 0o155, 0x20, 0x5c, 0x20, 0o052, 0o251, 0o124 ]
      const escaped = 'abc \\153\\154\\155 \\\\\\ \\052\\251\\124'
      // look, ma... three \\\ characters, ^ ^ ^ ignore the 3rd

      // default native buffer, we're on node, it's Buffer
      expect(parseByteA(escaped), 'escaped default').toBeInstanceOf(Buffer, (assert) => {
        compare(assert.value, escapedData)
      })

      // force the native buffer to be Buffer (you never know...)
      expect(parseByteA(escaped, Buffer), 'native forced').toBeInstanceOf(Buffer, (assert) => {
        compare(assert.value, escapedData)
      })

      // force the native buffer to be "null", testing the non-native paths
      expect(parseByteA(escaped, null), 'non-native forced').toBeInstanceOf(Uint8Array, (assert) => {
        assert.not.toBeInstanceOf(Buffer) // we want to test our non-native conversion
        compare(assert.value, escapedData)
      })
    })

    it('should parse encoded (hex) data', () => {
      const encodedData = [ 0xDE, 0xAD, 0xBE, 0xEF ]
      const encoded = '\\xDeAdBeEfF'
      // look ma... an extra char ^

      // default native buffer, we're on node, it's Buffer
      expect(parseByteA(encoded), 'encoded default').toBeInstanceOf(Buffer, (assert) => {
        compare(assert.value, encodedData)
      })

      // force the native buffer to be Buffer (you never know...)
      expect(parseByteA(encoded, Buffer), 'native forced').toBeInstanceOf(Buffer, (assert) => {
        compare(assert.value, encodedData)
      })

      // force the native buffer to be "null", testing the non-native paths
      expect(parseByteA(encoded, null), 'non-native forced').toBeInstanceOf(Uint8Array, (assert) => {
        assert.not.toBeInstanceOf(Buffer) // we want to test our non-native conversion
        compare(assert.value, encodedData)
      })
    })
  })

  describe('geometric', () => {
    it('should parse a point', () => {
      expect(parsePoint('(25.123,10.999)'))
          .toBeInstanceOf(PGPoint)
          .toEqual({ x: 25.123, y: 10.999 })
    })

    it('should not parse an invalid point', () => {
      expect(parsePoint('foobar'))
          .toBeInstanceOf(PGPoint)
          .toEqual({ x: NaN, y: NaN })
    })

    it('should parse a circle', () => {
      expect(parseCircle('<(25.123,10.999),3.14>'))
          .toBeInstanceOf(PGCircle)
          .toEqual({ x: 25.123, y: 10.999, radius: 3.14 })
    })

    it('should not parse an invalid point', () => {
      expect(parseCircle('foobar'))
          .toBeInstanceOf(PGCircle)
          .toEqual({ x: NaN, y: NaN, radius: NaN })
    })
  })

  describe('range', () => {
    it('should parse a basic range', () => {
      const range = parseRange('(bar,foo]')

      expect(range).toEqual({ lower: 'bar', upper: 'foo', mask: PGRange.RANGE_UB_INC })

      expect(range.hasMask(PGRange.RANGE_EMPTY)).toBeFalse()
      expect(range.hasMask(PGRange.RANGE_LB_INC)).toBeFalse()
      expect(range.hasMask(PGRange.RANGE_UB_INC)).toBeTrue()
      expect(range.hasMask(PGRange.RANGE_LB_INF)).toBeFalse()
      expect(range.hasMask(PGRange.RANGE_UB_INF)).toBeFalse()

      expect(range.isLowerBoundClosed(), 'isLowerBoundClosed').toBeFalse()
      expect(range.isUpperBoundClosed(), 'isUpperBoundClosed').toBeTrue()
      expect(range.isBounded(), 'isBounded').toBeTrue()
      expect(range.isEmpty(), 'isEmpty').toBeFalse()
      expect(range.hasLowerBound(), 'hasLowerBound').toBeTrue()
      expect(range.hasUpperBound(), 'hasUpperBound').toBeTrue()
    })

    const samples = [ {
      name: 'int',
      parse: parseIntRange,
      value: '(0,100)',
      result: {
        lower: 0,
        upper: 100,
        mask: 0,
      },
    }, {
      name: 'float',
      parse: parseFloatRange,
      value: '[12.345,67.89]',
      result: {
        lower: 12.345,
        upper: 67.89,
        mask: PGRange.RANGE_LB_INC | PGRange.RANGE_UB_INC,
      },
    }, {
      name: 'bigint',
      parse: parseBigIntRange,
      value: '[0,100)',
      result: {
        lower: 0n,
        upper: 100n,
        mask: PGRange.RANGE_LB_INC,
      },
    }, {
      name: 'timestamp',
      parse: parseTimestampRange,
      value: '["2023-09-07 01:02:03.4567",]',
      result: {
        lower: new Date('2023-09-07T01:02:03.456Z'),
        upper: null,
        mask: PGRange.RANGE_LB_INC | PGRange.RANGE_UB_INC | PGRange.RANGE_UB_INF },
    }, {
      name: 'timestamptz',
      value: '(,"2023-09-07 01:02:03.4567+02")',
      parse: parseTimestampTzRange,
      result: {
        lower: null,
        upper: new Date('2023-09-06T23:02:03.456Z'),
        mask: PGRange.RANGE_LB_INF,
      },
    } ] as const

    for (const { name, parse, value, result } of samples) {
      it(`shoud parse a "${name}" range`, () => {
        expect(parse(value)).toEqual(result)
      })
    }
  })
})
