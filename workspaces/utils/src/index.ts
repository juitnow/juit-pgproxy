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

export * as helpers from './helpers'
export * as types from './types'
