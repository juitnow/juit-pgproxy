import { randomBytes } from 'node:crypto'

import { serializeByteA, serializeDateUTC } from '../src/serializers'

describe('Serializers', () => {
  it('should serialize buffers and array views as bytea', () => {
    const buf = Buffer.from('deadbeef', 'hex')
    const ui8 = new Uint8Array([ 0xde, 0xad, 0xbe, 0xef ])
    const u32 = new Uint32Array([ 0xefbeadde ]) // little endian...

    // get Buffer instance as an optional parameter
    expect(serializeByteA(buf)).toEqual('\\\\xdeadbeef')
    expect(serializeByteA(ui8)).toEqual('\\\\xdeadbeef')
    expect(serializeByteA(u32)).toEqual('\\\\xdeadbeef')

    // force the use of NodeJS "Buffer"
    expect(serializeByteA(buf, Buffer)).toEqual('\\\\xdeadbeef')
    expect(serializeByteA(ui8, Buffer)).toEqual('\\\\xdeadbeef')
    expect(serializeByteA(u32, Buffer)).toEqual('\\\\xdeadbeef')

    // force the _lack_ of NodeJS "Buffer", and test our manual code
    expect(serializeByteA(buf, null)).toEqual('\\\\xdeadbeef')
    expect(serializeByteA(ui8, null)).toEqual('\\\\xdeadbeef')
    expect(serializeByteA(u32, null)).toEqual('\\\\xdeadbeef')

    // random length, 100 times, just to be safe...
    for (let i = 0; i < 100; i ++) {
      const random = randomBytes(32 + (Math.random() * 64))
      const expected = `\\\\x${random.toString('hex')}`

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
})
