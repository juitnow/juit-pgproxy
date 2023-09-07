/* Internal interface mimicking NodeJS's `Buffer` */
interface Buffer {
  from(source:string, format: 'hex'): Uint8Array
  from(source:Uint8Array): Uint8Array
}

/** Parse a PostgreSQL `BYTEA` string (escaped or encoded in hexadecimal) */
export function parseByteA(input: string, Buffer?: Buffer | null): Uint8Array
/* Overload defaulting `Buffer` to `globalThis.Buffer` (Node's Buffer class) */
export function parseByteA(
    input: string,
    Buffer: Buffer | null | undefined = (globalThis as any).Buffer,
): Uint8Array {
  if (input.startsWith('\\x')) {
    // Shortcut for NodeJS, use Buffer.from(str, 'hex')
    return Buffer ? Buffer.from(input.substring(2), 'hex') : parseEncoded(input)
  } else {
    return parseEscaped(input, Buffer)
  }
}

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

/** Parse a BYTEA encoded in HEX */
function parseEncoded(input: string): Uint8Array {
  const array = new Uint8Array((input.length - 2) / 2)
  let index = 0
  for (let i = 2; i < input.length; i += 2) {
    array[index ++] = parseInt(input.substring(i, i + 2), 16)
  }
  return array
}

/** Parse a BYTEA using the _escaped_ format */
function parseEscaped(input: string, Buffer?: Buffer | null): Uint8Array {
  const result = new Uint8Array(input.length)
  let pos = 0

  for (let i = 0; i < input.length; i ++) {
    const code = input.charCodeAt(i)
    if (code !== 0x5c) {
      // simple non-escaped character
      result[pos ++] = code
    } else {
      // if we have a backslash, it may be followed by three octal digits
      const token = input.substring(i + 1, i + 4)
      if (/[0-7]{3}/.test(token)) {
        result[pos ++] = parseInt(token, 8)
        i += 3 // advance after the octal number
      } else {
        // count how may backslashes we got...
        let backslashes = 1

        for (
          let char = input[++i];
          (i < input.length) && (char === '\\');
          char = input[++i]
        ) backslashes ++

        // fill the result with HALF the backslashes (escaped)
        result.fill(0x5c, pos, pos += backslashes >>> 1)

        // we consumed the character after the backslash
        i --
      }
    }
  }

  // return wrapping Buffer.from(array) with a subarray, or just a slice...
  return Buffer ? Buffer.from(result.subarray(0, pos)) : result.slice(0, pos)
}
