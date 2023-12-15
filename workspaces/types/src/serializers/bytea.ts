/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

/* Internal interface mimicking NodeJS's `Buffer` */
interface NodeJSBuffer extends Uint8Array {
  toString(format?: 'hex'): string
}

/* Internal interface mimicking NodeJS's `Buffer`'s constructor */
interface NodeJSBufferConstructor {
  isBuffer(value: any): value is NodeJSBuffer
  from(source:Uint8Array): NodeJSBuffer
}

/* Return a {@link Uint8Array} from an {@link ArrayBufferView} */
function getUint8Array(value: any): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }

  throw new TypeError('Unsupported type for serialization as BYTEA')
}

/** All HEX values (from "00" to "ff" in order) */
const hex = '0123456789abcdef'.split('') // [ '0', '1', '2', ... ]
    .map((c1, _, a) => a.map((c2) => `${c1}${c2}`)) // [ [ '00', '01', ...], ...]
    .flat() // [ '00', '01', '02', ... ]

/* ========================================================================== *
 * EXPORTED SERIALIZER                                                        *
 * ========================================================================== */

/**
 * Serialize an {@link ArrayBufferView} (e.g. an {@link Uint8Array}, a NodeJS
 * `Buffer`, ...) into a PostgreSQL _HEX-encoded_ `string` (e.g. `\\xdeadbeef`).
 */
export function serializeByteA(
  value: ArrayBufferView,
  Buffer?: NodeJSBufferConstructor | null | undefined,
): string
/* Overload */
export function serializeByteA(
    value: any, // we need _any_ for type guards to work properly
    Buffer: NodeJSBufferConstructor | null | undefined = (globalThis as any).Buffer,
): string {
  /* In NodeJS we can use some shortcuts with buffers */
  if (Buffer) {
    /* Get a NodeJS buffer, either the value itself or wrapping a Uint8Array */
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(getUint8Array(value))
    return `\\x${buffer.toString('hex')}`
  }

  /* No support for NodeJS "Buffer"... Gotta do manually */
  const array = getUint8Array(value)
  const result = new Array<string>(array.length + 1)
  result[0] = '\\x'

  /* Run a tight loop over our Uint8Array, converting it to HEX */
  for (let i = 0, c = array[0]!; i < array.length; c = array[i]!) {
    result[++i] = hex[c]!
  }

  /* Join up and return */
  return result.join('')
}
