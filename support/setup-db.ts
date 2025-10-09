import { randomUUID } from 'node:crypto'

import LibPQ from '@juit/libpq'
import { $gry, $ylw } from '@plugjs/build'

import { sleep } from './utils'

export const databaseName = `test-${randomUUID()}`

// Reuse LibPQ (one instance per process) because creating/disposing fails:
// | Assertion failed: (handle->flags & UV_HANDLE_CLOSING),
// | function uv__finish_close, file core.c, line 314.
// Assuming something is odd in "connection.cc" at around line 76, see
// https://github.com/brianc/node-libpq/blob/master/src/connection.cc#L76
const pq = new LibPQ()

// LibPQ "connectSync" fails with the following:
// | Assertion failed: (!(handle->flags & UV_HANDLE_CLOSED)),
// | function uv__finish_close, file core.c, line 271.
// Assuming something is odd in "connection.cc" at around line 30, see
// https://github.com/brianc/node-libpq/blob/master/src/connection.cc#L30
async function connect(params: string): Promise<void> {
  return new Promise((res, rej) => {
    pq.connect(params, (err) => err ? rej(err) : res())
  })
}

beforeAll(async () => {
  log.notice(`Creating database ${$ylw(databaseName)} ${$gry('(pid=')}${process.pid}${$gry(')')}`)

  // create our test database
  await connect('dbname=postgres')

  pq.execParams(`CREATE DATABASE "${databaseName}"`)
  expect(pq.resultStatus(), pq.errorMessage()).toStrictlyEqual('PGRES_COMMAND_OK')

  pq.finish()

  // populate our test database with some test data
  await connect(`dbname=${databaseName} application_name=pool:beforeAll`)

  pq.exec('CREATE TABLE "test" ("str" VARCHAR(32) NOT NULL, "num" INTEGER NOT NULL)')
  expect(pq.resultStatus(), pq.errorMessage()).toStrictlyEqual('PGRES_COMMAND_OK')

  pq.exec('INSERT INTO "test" ("str", "num") VALUES (\'foo\', 1), (\'bar\', 2), (\'baz\', 3)')
  expect(pq.resultStatus(), pq.errorMessage()).toStrictlyEqual('PGRES_COMMAND_OK')

  pq.finish()
})

afterAll(async () => {
  log.notice(`\nDropping database ${$ylw(databaseName)} ${$gry('(pid=')}${process.pid}${$gry(')')}`)

  await sleep(500) // give it a moment to close connections (might be async!)

  await connect('dbname=postgres')
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
