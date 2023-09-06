import { randomUUID } from 'node:crypto'

import { $gry, $ylw } from '@plugjs/build'
import pg from 'pg'

export const databaseName = `test-${randomUUID()}`

beforeAll(async () => {
  log.notice(`Creating database ${$ylw(databaseName)}`)
  const client = new pg.Client({ database: 'postgres' })
  await client.connect()
  try {
    await client.query(`CREATE DATABASE "${databaseName}"`)
  } finally {
    await client.end()
  }

  const client2 = new pg.Client({ database: databaseName })
  await client2.connect()
  try {
    await client2.query('CREATE TABLE "test" ("str" VARCHAR(32) NOT NULL, "num" INTEGER NOT NULL)')
    await client2.query('INSERT INTO "test" ("str", "num") VALUES (\'foo\', 1), (\'bar\', 2), (\'baz\', 3)')
  } finally {
    await client2.end()
  }
})

afterAll(async () => {
  log.notice(`\nDropping database ${$ylw(databaseName)}`)
  const mainClient = new pg.Client({ database: 'postgres' })
  await mainClient.connect()

  let leftovers = 0
  try {
    // do we have any leftover connections?
    const result = await mainClient.query(`
      SELECT application_name
        FROM pg_stat_activity
       WHERE application_name LIKE 'pool:%'
         AND datname=$1`, [ databaseName ])

    if (result.rows.length) {
      log.warn('Found', $ylw(`${result.rows.length}`), 'connections left open:')
      result.rows.forEach(({ application_name: name }) => log.warn($gry('  -'), $ylw(name)))
      leftovers = result.rows.length
    }

    // kill all remaining connections
    await mainClient.query(`
      SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
       WHERE application_name LIKE 'pool:%'
         AND pid <> pg_backend_pid()
         AND datname = $1`, [ databaseName ])

    await mainClient.query(`DROP DATABASE "${databaseName}"`)
  } finally {
    await mainClient.end()
  }

  expect(leftovers, `Left ${leftovers} connections`).toStrictlyEqual(0)
}, 30_000)
