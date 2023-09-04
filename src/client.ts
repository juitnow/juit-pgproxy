export async function authentication(
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
