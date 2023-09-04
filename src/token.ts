import assert from 'node:assert'
import { createHmac } from 'node:crypto'

/* ========================================================================== *
 * AUTHENTICATION TOKEN                                                       *
 * ========================================================================== *
 *                                                                            *
 * Our authentication token is defined as follows:                            *
 *                                                                            *
 *   +-------------------+----------------+---------------------------+       *
 *   | bits              | bytes          | field                     |       *
 *   +-------------------+----------------+---------------------------+       *
 *   |   0 ...  63  (64) |  0 ... 7   (8) | timestamp (little endian) |       *
 *   |  64 ... 127  (64) |  8 ... 15  (8) | random bytes              |       *
 *   | 128 ... 392 (256) | 16 ... 47 (32) | HMAC-SHA-256 signature    |       *
 *   +-------------------+----------------+---------------------------+       *
 *                                                                            *
 * The signature is calculated using the HMAC-SHA-256 algorithm, with the     *
 * UTF-8 encoding of our `secret` as the _key_ and the first 16 bytes of the  *
 * token itself as the message.                                               *
 *                                                                            *
 * The total length of 48 bytes has been chosen so that the BASE-64 encoding  *
 * of the authentication token is precisely 64 characters and doesn't equire  *
 * any padding.                                                               *
 *                                                                            *
 * Furthermore, authentication tokens must be validated against the current   *
 * timestamp, and this implementation requires any acceptable token to be     *
 * within +/- 10 seconds of _now_.                                            *
 * ========================================================================== */

export function verifyToken(
    token: string,
    secret: string,
): string {
  assert.strictEqual(token.length, 64, `Invalid encoded token length (${token.length} != 64)`)

  const buffer = Buffer.from(token, 'base64url')
  assert.strictEqual(buffer.length, 48, `Invalid decoded token length (${buffer.length} != 48)`)

  // First of all check the time delta
  const timeDelta = buffer.readBigInt64LE(0) - BigInt(Date.now())
  const absoluteDelta = timeDelta < 0n ? -timeDelta : timeDelta
  assert(absoluteDelta < 10_000n, `Timestamp delta out of range (${timeDelta} ms)`)

  // Compute the HMAC-SHA-256 signature of the message using our secret
  const signature = createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(buffer.subarray(0, 16))
      .digest()

  // Compare the signatures (computed vs received)
  assert(signature.compare(buffer, 16) === 0, 'Token signature mismatch')
  return buffer.toString('hex', 0, 16).toLowerCase()
}
