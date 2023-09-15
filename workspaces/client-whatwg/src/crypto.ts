export function getUniqueRequestId(crypto: Crypto = globalThis.crypto): string {
  return crypto.randomUUID()
}

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

export async function getAuthenticationToken(
    secret: string,
    crypto: Crypto = globalThis.crypto,
): Promise<string> {
  const encoder = new TextEncoder()

  // Prepare the buffer and its Uint8Array view for the token
  const buffer = new ArrayBuffer(48)
  const token = new Uint8Array(buffer)

  // Fill the whole token with random data
  crypto.getRandomValues(token)

  // Write the timestamp at offset 0 as a little endian 64-bits bigint
  const timestamp = new DataView(buffer, 0, 8)
  timestamp.setBigInt64(0, BigInt(Date.now()), true)

  // Prepare the message, concatenating the header and database name
  const header = new Uint8Array(buffer, 0, 16)

  // Prepare the key for HMAC-SHA-256
  const key = await crypto.subtle.importKey(
      'raw', // ........................ // Our key type
      encoder.encode(secret), // ....... // UTF-8 representation of the secret
      { name: 'HMAC', hash: 'SHA-256' }, // We want the HMAC(SHA-256)
      false, // ........................ // The key is not exportable
      [ 'sign', 'verify' ]) // ......... // Key is used to sign and verify

  // Compute the signature of the message using the key
  const signature = await crypto.subtle.sign(
      'HMAC', // ............. // We need an HMAC
      key, // ................ // Use the key as allocated above
      header) // ............ // The message to sign, as UTF-8

  // Copy the signature into our token
  token.set(new Uint8Array(signature), 16)

  // Encode the token as an URL-safe BASE-64 string
  const string = String.fromCharCode(...token)
  return btoa(string)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
}
