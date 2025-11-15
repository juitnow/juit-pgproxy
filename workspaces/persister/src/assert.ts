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
