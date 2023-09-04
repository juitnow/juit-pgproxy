import { createHmac, randomBytes } from 'node:crypto'

export function createToken(secret: string): Buffer {
  const buffer = randomBytes(48)

  buffer.writeBigInt64LE(BigInt(Date.now()), 0)

  createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(buffer.subarray(0, 16))
      .digest()
      .copy(buffer, 16)

  return buffer
}
