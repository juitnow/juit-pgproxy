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

export function encodeSchemaAndName(name: string): string {
  const [ schemaOrTable, maybeTable, ...extra ] = name.split('.')
  assert(extra.length === 0, `Invalid table name "${name}"`)

  const [ schema, table ] = maybeTable ?
    [ schemaOrTable, maybeTable ] :
    [ 'public', schemaOrTable ]
  assert(table, `Invalid table name "${name}"`)

  return `${escape(schema || 'public')}.${escape(table)}`
}
