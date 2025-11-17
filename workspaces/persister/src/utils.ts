import { escape } from '@juit/pgproxy-client'

/* ========================================================================== *
 * SIMPLE ASSERTIONS                                                          *
 * ========================================================================== */

export function assert(assertion: any, message: string): asserts assertion {
  if (! assertion) throw new Error(message)
}

export function assertArray(value: any, message: string): asserts value is any[] {
  assert(Array.isArray(value), message)
}

export function assertObject(value: any, message: string): asserts value is object {
  assert(value && (typeof value === 'object'), message)
}

/* ========================================================================== *
 * HELPERS                                                                    *
 * ========================================================================== */

export function encodeSchemaAndName(string: string): string {
  const [ schemaOrTable, maybeTable, ...extra ] = string.split('.')
  assert(extra.length === 0, `Invalid table name "${string}"`)

  const [ schema, name ] = maybeTable ?
    [ schemaOrTable, maybeTable ] :
    [ 'public', schemaOrTable ]
  assert(name, `Invalid table name "${name}"`)

  return `${escape(schema || 'public')}.${escape(name)}`
}
