import type { PGQuery } from './client'

/**
 * A _function_ capable of converting a template string into a {@link PGQuery}
 * like structure (tagged template literals).
 *
 * For example:
 *
 * ```typescript
 * const email = 'user@example.org'
 * const query = SQL `SELECT * FROM users WHERE email = ${email}`
 *
 * // Here "query" will be something like:
 * // {
 * //   query: 'SELECT * FROM users WHERE email = $1',
 * //   params: [ 'user@example.org' ],
 * // }
 * ```
 *
 * The `SQL` function can also be use with _concatenated_ template strings, for
 * example:
 *
 * ```typescript
 * const email = 'user@example.org'
 * const hash = 'thePasswordHash'
 * const query = SQL
 *     `SELECT * FROM users WHERE email = ${email}`
 *     `AND password_hash = ${hash}`
 *
 * // Here "query" will be something like:
 * // {
 * //   query: 'SELECT * FROM users WHERE email = $1 AND password_hash = $2',
 * //   params: [ 'user@example.org', 'thePasswordHash' ],
 * // }
 * ```
 *
 * In this case, multiple template strings will be concatenated with a single
 * space character.
 */
export interface SQL extends Required<PGQuery> {
  (strings: readonly string [], ...args: any[]): SQL,
}

/**
 * Entry point to parse a template string, optionally concatenating it to a
 * previously parsed template (already converted into a `SQL` function)
 */
function makeSQL(
    parts: readonly string [],
    params: readonly any[],
    query: string = '',
    start: number = 0,
): SQL {
  const [ first = '', ...rest ] = parts

  if (query) query += ' '
  query += rest.reduce((q, s, i) => `${q}$${i + start + 1}${s}`, first)

  const sql = (strings: readonly string[], ...args: readonly any[]): SQL => {
    return makeSQL(strings, [ ...params, ...args ], query, params.length)
  }

  return Object.assign(sql, {
    get query(): string {
      return query
    },
    get params(): readonly any[] {
      return [ ...params ]
    },
  })
}

/**
 * A _function_ capable of converting a template string into a {@link PGQuery}
 * like structure (tagged template literals).
 *
 * For example:
 *
 * ```typescript
 * const email = 'user@example.org'
 * const query = SQL `SELECT * FROM users WHERE email = ${email}`
 *
 * // Here "query" will be something like:
 * // {
 * //   query: 'SELECT * FROM users WHERE email = $1',
 * //   params: [ 'user@example.org' ],
 * // }
 * ```
 *
 * The `SQL` function can also be use with _concatenated_ template strings, for
 * example:
 *
 * ```typescript
 * const email = 'user@example.org'
 * const hash = 'thePasswordHash'
 * const query = SQL
 *     `SELECT * FROM users WHERE email = ${email}`
 *     `AND password_hash = ${hash}`
 *
 * // Here "query" will be something like:
 * // {
 * //   query: 'SELECT * FROM users WHERE email = $1 AND password_hash = $2',
 * //   params: [ 'user@example.org', 'thePasswordHash' ],
 * // }
 * ```
 *
 * In this case, multiple template strings will be concatenated with a single
 * space character.
 */
export function SQL(strings: readonly string[], ...args: readonly any[]): SQL {
  return makeSQL(strings, args)
}

/** Escape a PostgreSQL identifier (table, column, ... names) */
export function escape(str: string): string {
  return `"${str.replaceAll('"', '""').trim()}"`
}
