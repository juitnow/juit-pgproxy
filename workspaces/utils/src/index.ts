/** Schema definition extracted from PostgreSQL */
export interface Schema {
  [ table: string ] : {
    [ column: string ] : {
      oid: number,
      isNullable?: boolean,
      hasDefault?: boolean,
      description?: string,
      enumValues?: readonly [ string, ...string[] ],
    }
  }
}

export * from './database'
export * from './extract'
export * from './migrate'
export * from './serialize'

/** Helper functions for serializing schemas */
export * as helpers from './helpers'
/** Known/basic types for serializing schemas */
export * as types from './types'
