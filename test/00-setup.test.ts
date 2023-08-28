import { randomUUID } from 'node:crypto'

import { $ylw } from '@plugjs/build'
import pg from 'pg'

export const databaseName = `test-${randomUUID()}`

afterAll(async () => {
  log.notice(`\nDropping database ${$ylw(databaseName)}`)
  const mainClient = new pg.Client({ database: 'postgres' })
  await mainClient.connect()
  try {
    await mainClient.query(`DROP DATABASE "${databaseName}"`)
  } finally {
    await mainClient.end()
  }
})

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

// ?afterAll()
