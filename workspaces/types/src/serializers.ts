import { serializeByteA } from './serializers/bytea'
import { serializeDateUTC } from './serializers/date'

/** A cache storing serialized versions of objects */
const serializationCache = new WeakMap<object, string>()

/** Quote (escape with "quotes") a string */
function quote(string: string): string {
  return `"${string.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Serialize an {@link Array} as a PosgreSQL `ARRAY` */
function serializeArray(value: any[], stack: WeakSet<object>): string {
  const result = new Array<string>(value.length)

  for (let i = 0; i < value.length; i ++) {
    const member = value[i]
    /* Nulls (or undefined, we consider them same) are the unquoted "NULL" */
    if ((member === null) || (member === undefined)) {
      result[i] = 'NULL'

    /* Arrays are a beast on their own: we leave them unquoted, and we can
     * short-circuit on "arraySerializer" directly, but in this case we have
     * to manually manage our cache and our stack... */
    } else if (Array.isArray(member)) {
      const cached = serializationCache.get(member)
      if (cached) {
        result[i] = cached
      } else {
        if (stack.has(value)) throw new TypeError('Circularity detected serializing')
        stack.add(member) // we bypass "valueSerializer", so add to the stack
        result[i] = serializeArray(member, stack) // invoke ourselves
        serializationCache.set(member, result[i]!) // cache the result
        stack.delete(member) // then remove the member from the stack
      }

    /* BYTEA representations can *also* be left **unquoted**. */
    } else if (ArrayBuffer.isView(member)) {
      result[i] = serializeByteA(member)

    /* Everything else gets serialized *and* properly quoted */
    } else {
      result[i] = quote(serializeValue(member, stack))
    }
  }

  return `{${result.join(',')}}`
}

/** Serialize any value into its PostgreSQL string equivalent */
function serializeValue(value: any, stack: WeakSet<object>): string {
  /* Never "null" */
  if (value === null) throw new TypeError('Can not serialize "null"')

  /* Basic primitives */
  switch (typeof value) {
    case 'string':
      return value

    case 'bigint':
    case 'number':
    case 'boolean':
      return value.toString()

    case 'object':
      break

    case 'function':
    case 'symbol':
    case 'undefined':
    default:
      throw new TypeError(`Can not serialize "${typeof value}"`)
  }

  /* All primitives, "null" or "undefined" are resolved, value is "object" */

  /* Check caches */
  const cached = serializationCache.get(value)
  if (cached !== undefined) return cached

  /* Check for loops */
  if (stack.has(value)) throw new TypeError('Circularity detected serializing')
  stack.add(value)

  /* Create a sub-serializer to serialize values (it carries our stack) */
  const subserialize = ((v: any) => serializeValue(v, stack)) as PGSerialize

  /* The string we serialized */
  let string: string

  /* PGSerializable objects */
  if (isPGSerializable(value)) {
    string = value.toPostgres(subserialize)

  /* Buffers, Uint8Arrays, and all other ArrayBufferViews */
  } else if (ArrayBuffer.isView(value)) {
    string = serializeByteA(value)

  /* Arrays */
  } else if (Array.isArray(value)) {
    string = serializeArray(value, stack)

  /* Dates: for now always UTC, but we have the code for including TZ */
  } else if (value instanceof Date) {
    string = serializeDateUTC(value)

  /* Any other object gets serialized as JSON */
  } else {
    string = JSON.stringify(value)
  }

  /* Cache the resulting string, pop value out of the stack and return */
  serializationCache.set(value, string)
  stack.delete(value)
  return string
}

/** Type guard identifying {@link PGSerializable} instances */
function isPGSerializable(value: any): value is PGSerializable {
  return value && (typeof value['toPostgres'] === 'function')
}

/* ========================================================================== *
 * EXPORTED SERIALIZATION INTERFACE                                           *
 * ========================================================================== */

/**
 * Defines an object that can be serialized to a _string_ comprehensible by
 * PostgreSQL.
 *
 * The `serialize` parameter is a serialization function which can be used
 * to serialize _members_ of the {@link PGSerializable} itself (e.g. boundaries
 * of a {@link PGRange}, members of an _array_, ...).
 */
export interface PGSerializable {
  toPostgres(serialize: PGSerialize): string
}

/** An interface describing our {@link serialize} function. */
export interface PGSerialize {
  (value?: null | undefined): never
  (value: any): string
}

/** Serialize a value to _string_ comprehensible by PostgreSQL. */
export const serialize: PGSerialize =
  ((value: any) => serializeValue(value, new WeakSet())) as PGSerialize

/* All other exported serializers */
export { serializeByteA } from './serializers/bytea'
export { serializeDateUTC } from './serializers/date'
