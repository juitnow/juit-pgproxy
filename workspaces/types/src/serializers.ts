/** A cache storing serialized versions of objects */
const serializationCache = new WeakMap<object, string>()

/** Internal serialization function, recursively calling itself */
function serializer(value: any, stack = new WeakSet<PGSerializable>()): string {
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

  /* Check for loops and create a sub-serializer */
  if (stack.has(value)) throw new TypeError('Circularity detected serializing')
  const subserialize = ((v: any) => serializer(v, stack)) as PGSerialize

  /* PGSerializable objects */
  if (isPGSerializable(value)) {
    const string = value.toPostgres(subserialize)
    stack.delete(value)
    return string
  }

  // TODO: BYTEA
  // TODO: ARRAY
  // TODO: DATE
  // TODO: JSON

  /* Any other object gets serialized as JSON */
  return JSON.stringify(value)
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
export const serialize: PGSerialize = serializer as PGSerialize

export { serializeByteA } from './serializers/bytea'
