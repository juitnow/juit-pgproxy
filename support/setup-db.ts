import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

import { $gry, $ylw } from '@plugjs/build'

import type libpq from 'libpq'

export const databaseName = `test-${randomUUID()}`

// LibPQ "connectSync" fails with the following:
// | Assertion failed: (!(handle->flags & UV_HANDLE_CLOSED)),
// | function uv__finish_close, file core.c, line 271.
// Assuming something is odd in "connection.cc" at around line 30, see
// https://github.com/brianc/node-libpq/blob/master/src/connection.cc#L30
function connect(pq: LibPQ, params: string): Promise<LibPQ> {
  return new Promise((res, rej) => {
    pq.connect(params, (err) => err ? rej(err) : res(pq))
  })
}

// LibPQ has a nasty tendency to emit the path of its source directory when
// the parent module is not specified, and this happens *always* in ESM mode.
// By manually creating the require function, we can avoid this (aesthetics)
type LibPQ = libpq
type LibPQConstructor = { new(): LibPQ }
const LibPQ: LibPQConstructor = createRequire(__fileurl)('libpq')

beforeAll(async () => {
  log.notice(`Creating database ${$ylw(databaseName)}`)

  // create our test database
  const pq = await connect(new LibPQ(), 'dbname=postgres')

  pq.execParams(`CREATE DATABASE "${databaseName}"`)
  expect(pq.resultStatus(), pq.errorMessage()).toStrictlyEqual('PGRES_COMMAND_OK')

  pq.finish()

  // populate our test database with some test data
  await connect(pq, `dbname=${databaseName} application_name=pool:beforeAll`)

  pq.exec('CREATE TABLE "test" ("str" VARCHAR(32) NOT NULL, "num" INTEGER NOT NULL)')
  expect(pq.resultStatus(), pq.errorMessage()).toStrictlyEqual('PGRES_COMMAND_OK')

  pq.exec('INSERT INTO "test" ("str", "num") VALUES (\'foo\', 1), (\'bar\', 2), (\'baz\', 3)')
  expect(pq.resultStatus(), pq.errorMessage()).toStrictlyEqual('PGRES_COMMAND_OK')

  pq.finish()
})

afterAll(async () => {
  log.notice(`\nDropping database ${$ylw(databaseName)}`)

  const pq = await connect(new LibPQ(), 'dbname=postgres')
  let connections = 0
  try {
    // Figure out if there are leftover connections...
    pq.execParams(`
      SELECT application_name
        FROM pg_stat_activity
      WHERE application_name LIKE 'pool:%'
        AND datname=$1`, [ databaseName ])
    expect(pq.resultStatus(), pq.errorMessage()).toStrictlyEqual('PGRES_TUPLES_OK')
    expect(pq.nfields(), 'Fields').toStrictlyEqual(1)

    connections = pq.ntuples()
    if (connections > 0) {
      log.warn('Found', $ylw(`${connections}`), 'connections left open:')
      for (let i = 0; i < connections; i ++) {
        log.warn($gry('  -'), $ylw(pq.getvalue(i, 0)))
      }
    }

    // Kill any leftover connection (or at least try to)
    pq.execParams(`
      SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
       WHERE application_name LIKE 'pool:%'
         AND pid <> pg_backend_pid()
         AND datname = $1`, [ databaseName ])
    expect(pq.resultStatus(), pq.errorMessage()).toStrictlyEqual('PGRES_TUPLES_OK')

    // Drop the database waiting at most 10 seconds
    pq.exec('SET statement_timeout=10000')
    expect(pq.resultStatus(), pq.errorMessage()).toStrictlyEqual('PGRES_COMMAND_OK')

    pq.exec(`DROP DATABASE "${databaseName}"`)
    expect(pq.resultStatus(), pq.errorMessage()).toStrictlyEqual('PGRES_COMMAND_OK')
  } finally {
    pq.finish()
  }

  expect(connections, `Left ${connections} connections`).toStrictlyEqual(0)
}, 30_000)
