import { PGClient, escape } from '@juit/pgproxy-client'
import { $ylw, log } from '@plugjs/plug'

const NAME_EXPR = /^[-\w]{4,}$/

/** Create a test database name from a prefix and some randomness */
export function testdb(prefix = 'test'): string {
  if (! NAME_EXPR.test(prefix)) throw new Error(`Invalid database name prefix "${prefix}"`)
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `${prefix}-${new Date().toISOString().replace(/[^\d]/g, '')}-${random}`
}

/**
 * Create a database with the specified name (or a test database).
 *
 * The default database name to use is the result of calling {@link testdb()}.
 *
 * The default URL to use when creating the database is `psql:///postgres`.
 */
export async function createdb(
    name = testdb(),
    url: string | URL = 'psql:///postgres',
): Promise<string> {
  if (! NAME_EXPR.test(name)) throw new Error(`Invalid database name "${name}"`)
  log.notice(`Creating database ${$ylw(name)}`)

  await using client = new PGClient(url)
  await client.query(`CREATE DATABASE ${escape(name)}`)
  return name
}

/**
 * Drop the database with the specified name.
 *
 * The default URL to use when creating the database is `psql:///postgres`.
 */
export async function dropdb(
    name: string,
    url: string | URL = 'psql:///postgres',
): Promise<void> {
  if (! NAME_EXPR.test(name)) throw new Error(`Invalid database name "${name}"`)
  log.notice(`Dropping database ${$ylw(name)}`)

  await using client = new PGClient(url)
  await client.query(`DROP DATABASE IF EXISTS ${escape(name)}`)
}
