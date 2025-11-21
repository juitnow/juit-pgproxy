/** Prettify a type by flattening intersections */
export type Prettify<T extends object> = { [ K in keyof T ]: T[K] } & {}
/** Extract only the string keys from a type */
export type OnlyStrings<T> = T extends string ? T : never
