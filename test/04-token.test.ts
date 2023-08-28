import { AssertionError } from 'node:assert'

import { verifyToken } from '../src/token'
import { createToken } from './token'

describe('Token verification', () => {
  it('should not accept a token with the wrong length', () => {
    expect(() => verifyToken(''.padStart(63, 'A'), 'secret', 'database'))
        .toThrowError(AssertionError, 'Invalid encoded token length (63 != 64)')

    expect(() => verifyToken(''.padStart(65, 'A'), 'secret', 'database'))
        .toThrowError(AssertionError, 'Invalid encoded token length (65 != 64)')

    expect(() => verifyToken(''.padStart(63, 'A') + '=', 'secret', 'database'))
        .toThrowError(AssertionError, 'Invalid decoded token length (47 != 48)')
  })

  it('should not accept a token with the wrong timestamp', () => {
    const buffer = Buffer.alloc(48)

    buffer.writeBigInt64LE(BigInt(Date.now() - 11_000), 0)
    expect(() => verifyToken(buffer.toString('base64url'), 'secret', 'database'))
        .toThrowError(AssertionError, /^Timestamp delta out of range \(-1\d\d\d\d ms\)$/)

    buffer.writeBigInt64LE(BigInt(Date.now() + 11_000), 0)
    expect(() => verifyToken(buffer.toString('base64url'), 'secret', 'database'))
        .toThrowError(AssertionError, /^Timestamp delta out of range \(1\d\d\d\d ms\)$/)
  })

  it('should validate a token', () => {
    const buffer = createToken('mySecret', 'myDatabase')

    const token = verifyToken(buffer.toString('base64url'), 'mySecret', 'myDatabase')
    expect(token).toStrictlyEqual(buffer.subarray(0, 16).toString('hex'))
  })

  it('should not validate a token when the secret is wrong', () => {
    const buffer = createToken('mySecret', 'myDatabase')

    expect(() => verifyToken(buffer.toString('base64url'), 'wrongSecret', 'myDatabase'))
        .toThrowError(AssertionError, 'Token signature mismatch')
  })

  it('should not validate a token when the database name is wrong', () => {
    const buffer = createToken('mySecret', 'myDatabase')

    expect(() => verifyToken(buffer.toString('base64url'), 'mySecret', 'wrongDatabase'))
        .toThrowError(AssertionError, 'Token signature mismatch')
  })

  it('should not validate a token when the timestamp is tampered with', () => {
    const buffer = createToken('mySecret', 'myDatabase')
    const wrongTimestamp = Buffer.from(buffer)
    wrongTimestamp[0] ++ // increment

    expect(() => verifyToken(wrongTimestamp.toString('base64url'), 'mySecret', 'myDatabase'))
        .toThrowError(AssertionError, 'Token signature mismatch')
  })

  it('should not validate a token when the random data is tampered with', () => {
    const buffer = createToken('mySecret', 'myDatabase')
    const wrongRandom = Buffer.from(buffer)
    wrongRandom[12] ++ // increment

    expect(() => verifyToken(wrongRandom.toString('base64url'), 'mySecret', 'myDatabase'))
        .toThrowError(AssertionError, 'Token signature mismatch')
  })

  it('should not validate a token when the signature is tampered with', () => {
    const buffer = createToken('mySecret', 'myDatabase')
    const wrongSignature = Buffer.from(buffer)
    wrongSignature[24] ++ // increment

    expect(() => verifyToken(wrongSignature.toString('base64url'), 'mySecret', 'myDatabase'))
        .toThrowError(AssertionError, 'Token signature mismatch')
  })
})
