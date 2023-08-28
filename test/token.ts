import { createHmac, randomBytes } from 'node:crypto'

export function createToken(secret: string, database: string): Buffer {
  const buffer = randomBytes(48)

  buffer.writeBigInt64LE(BigInt(Date.now()), 0)

  const message = Buffer.concat([
    buffer.subarray(0, 16),
    Buffer.from(database, 'utf8'),
  ])

  createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(message)
      .digest()
      .copy(buffer, 16)

  return buffer
}
