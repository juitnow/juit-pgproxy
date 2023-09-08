import { randomBytes } from 'node:crypto'

import { PGCircle, PGPoint, PGRange } from '../src'
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
    // 100 bc..
    expect(serializeDateUTC(new Date('-000100-01-01T12:00:00.000-03:00')))
        .toEqual('0101-01-01T15:00:00.000+00:00 BC')
    expect(serializeDateUTC(new Date('-000100-01-01T12:00:00.000+03:00')))
        .toEqual('0101-01-01T09:00:00.000+00:00 BC')
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
})
