import assert from 'node:assert'
import { createHmac } from 'node:crypto'

export function verifyToken(
    token: string,
    secret: string,
    databaseName: string,
): string {
  assert.strictEqual(token.length, 64, `Invalid encoded token length (${token.length} != 64)`)

  const buffer = Buffer.from(token, 'base64url')
  assert.strictEqual(buffer.length, 48, `Invalid decoded token length (${buffer.length} != 48)`)

  // First of all check the time delta
  const timeDelta = buffer.readBigInt64LE(0) - BigInt(Date.now())
  const absoluteDelta = timeDelta < 0n ? -timeDelta : timeDelta
  assert(absoluteDelta < 10_000n, `Timestamp delta out of range (${timeDelta} ms)`)

  // Then prepare the message concatenating header and database name
  const message = Buffer.concat([
    buffer.subarray(0, 16), // ....... // token header: timestamp + random
    Buffer.from(databaseName, 'utf8'), // database name as an UTF-8 string
  ])

  // Compute the HMAC-SHA-256 signature of the message using our secret
  const signature = createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(message)
      .digest()

  // Compare the signatures (computed vs received)
  assert(signature.compare(buffer, 16) === 0, 'Token signature mismatch')
  return buffer.toString('hex', 0, 16).toLowerCase()
}
