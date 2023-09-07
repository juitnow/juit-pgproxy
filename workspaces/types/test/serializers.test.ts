import { randomBytes } from 'node:crypto'

import { serializeByteA } from '../src/serializers'

describe('Serializers', () => {
  it('should serialize a buffers and array views as bytea', () => {
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
})
