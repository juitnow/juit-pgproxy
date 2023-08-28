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
 * The signature is calculated using the HMAC-SHA-256 algorithm using the     *
 * UTF-8 encoding of our `secret` as the _key_ and the concatenation of the   *
 * following fields as message:                                               *
 *                                                                            *
 *   (1) Header, the first 16 bytes of the authentication token, containing:  *
 *       (a) Little endian representation of the current timestamp (64 bits)  *
 *       (b) Random data (64 bits)                                            *
 *   (2) UTF-8 encoding of the database name (variable length)                *
 *                                                                            *
 * The total length of 48 bytes has been chose so that the BASE-64 encoding   *
 * of the authentication token is precisely 64 characters and doesn't equire  *
 * any padding.                                                               *
 * ========================================================================== */

// import { webcrypto, createHmac } from 'node:crypto'
// import assert from 'node:assert'

export async function authentication(
    secret: string,
    databaseName: string,
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
  const name = encoder.encode(databaseName)
  const header = new Uint8Array(buffer, 0, 16)
  const message = new Uint8Array(16 + name.length)
  message.set(header, 0)
  message.set(name, 16)

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
      message) // ............ // The message to sign, as UTF-8

  // Copy the signature into our token
  token.set(new Uint8Array(signature), 16)

  // Encode the token as an URL-safe BASE-64 string
  const string = String.fromCharCode(...token)
  return btoa(string)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
}

// interface Connection {
//   query(test: string, params?: any[]): Promise<Result>
// }

// interface Client extends Connection {
//   connect<T>(consumer: (connection: Connection) => T | PromiseLike<T>): Promise<T>
// }

// /** Describes the result of a PostgreSQL query */
// interface Result {
//   /** Command executed (normally `SELECT`, or `INSERT`, ...) */
//   command: string
//   /** Number of rows affected by this query (e.g. added rows in `INSERT`) */
//   rowCount: number
//   /** Fields description with `name` (column name) and `oid` (type) */
//   fields: { name: string, oid: number }[]
//   /** Result rows, as an array of unparsed `string` results from `libpq` */
//   rows: (string | null)[][]
// }

// authentication('foobar', 'juit-dev', webcrypto as Crypto)
//     .then((token) => verify(token, 'foobar', 'juit-dev'), console.log)

