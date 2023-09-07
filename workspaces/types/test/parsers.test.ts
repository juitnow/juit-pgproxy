import {
  parseArray,
  parseBigIntArray,
  parseBoolArray,
  parseByteA,
  parseByteAArray,
  parseCircleArray,
  parseFloatArray,
  parseIntArray,
  parseIntervalArray,
  parseJsonArray,
  parsePointArray,
  parseTimestampArray,
  parseTimestampTzArray,
} from '../src/parsers'

describe('Posgres Types', () => {
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

  it('should parse binary data', () => {
    const escapedData = [ 0x61, 0x62, 0x63, 0x20, 0o153, 0o154, 0o155, 0x20, 0x5c, 0x20, 0o052, 0o251, 0o124 ]
    const escaped = 'abc \\153\\154\\155 \\\\\\ \\052\\251\\124'
    // look, ma... three \\\ characters, ^ ^ ^ ignore the 3rd

    const encodedData = [ 0xDE, 0xAD, 0xBE, 0xEF ]
    const encoded = '\\xDeAdBeEfF'
    // look ma... an extra char ^

    const compare = (actual: Uint8Array, expected: number[]): void =>
      void expect(Buffer.from(actual).toString('hex').match(/.{1,2}/g)!.join(' '))
          .toEqual(Buffer.from(expected).toString('hex').match(/.{1,2}/g)!.join(' '))

    // default native buffer, we're on node, it's Buffer
    expect(parseByteA(encoded), 'encoded default').toBeInstanceOf(Buffer, (assert) => {
      compare(assert.value, encodedData)
    })

    expect(parseByteA(escaped), 'escaped default').toBeInstanceOf(Buffer, (assert) => {
      compare(assert.value, escapedData)
    })

    // force the native buffer to be Buffer (you never know...)
    expect(parseByteA(encoded, Buffer), 'native forced').toBeInstanceOf(Buffer, (assert) => {
      compare(assert.value, encodedData)
    })

    expect(parseByteA(escaped, Buffer), 'native forced').toBeInstanceOf(Buffer, (assert) => {
      compare(assert.value, escapedData)
    })

    // force the native buffer to be "null", testing the non-native paths
    expect(parseByteA(encoded, null), 'non-native forced').toBeInstanceOf(Uint8Array, (assert) => {
      assert.not.toBeInstanceOf(Buffer) // we want to test our non-native conversion
      compare(assert.value, encodedData)
    })

    expect(parseByteA(escaped, null), 'non-native forced').toBeInstanceOf(Uint8Array, (assert) => {
      assert.not.toBeInstanceOf(Buffer) // we want to test our non-native conversion
      compare(assert.value, escapedData)
    })
  })
})
