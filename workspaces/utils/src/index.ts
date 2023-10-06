/** Schema definition extracted from PostgreSQL */
export interface Schema {
  [ table: string ] : {
    [ column: string ] : {
      oid: number,
      isNullable?: boolean,
      hasDefault?: boolean,
      description?: string,
      enumValues?: [ string, ...string[] ],
    }
  }
}

export * from './database'
export * from './extract'
export * from './generate'
export * from './migrate'
