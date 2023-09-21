/** The easiest assertion function in the world */
export function assert(what: unknown, message: string): asserts what {
  if (! what) throw new Error(message)
}
