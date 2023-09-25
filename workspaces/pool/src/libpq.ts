import { createRequire } from 'node:module'

import type libpq from 'libpq'

// LibPQ has a nasty tendency to emit the path of its source directory when
// the parent module is not specified, and this happens *always* in ESM mode.
// By manually creating the require function, we can avoid this (aesthetics)
export type LibPQ = libpq
export type LibPQConstructor = { new(): LibPQ }
export const LibPQ: LibPQConstructor = createRequire(__fileurl)('libpq')
