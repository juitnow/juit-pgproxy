import { userInfo } from 'node:os'

import { PGClient } from '@juit/pgproxy-client'

import { databaseName } from '../../../support/setup-db'
import { TestLogger } from '../../../support/utils'
import { PGClientPSQL, PGProviderPSQL } from '../src/index'

describe('Client PSQL', () => {
  let pgdatabase: string | undefined

  beforeAll(() => {
    PGProviderPSQL.logger = new TestLogger()
    pgdatabase = process.env.PGDATABASE
    process.env.PGDATABASE = databaseName
  })

  afterAll(() => {
    delete PGProviderPSQL.logger
    process.env.PGDATABASE = pgdatabase
  })

  it('should construct without any parameter', async () => {
    const client = new PGClientPSQL()

    try {
      expect((client as any)._provider._options).toEqual({
        database: databaseName,
      })
    } finally {
      await client.destroy().catch(log.info)
    }
  })

  it('should default the database name to the current user name', async () => {
    delete process.env.PGDATABASE
    const client = new PGClientPSQL()

    try {
      expect((client as any)._provider._options).toEqual({
        database: userInfo().username,
      })
    } finally {
      process.env.PGDATABASE = databaseName
      await client.destroy().catch(log.info)
    }
  })

  it('should construct with a string url', async () => {
    const client = new PGClientPSQL('psql://myuser:mypass@localhost:1234/mydatabase')

    try {
      expect((client as any)._provider._options).toEqual({
        user: 'myuser',
        password: 'mypass',
        database: 'mydatabase',
        host: 'localhost',
        port: 1234,
      })
    } finally {
      process.env.PGDATABASE = databaseName
      await client.destroy().catch(log.info)
    }
  })

  it('should construct with a full url', async () => {
    const url = new URL('psql://myuser:mypass@localhost:1234/mydatabase')
    url.searchParams.set('minimumPoolSize', '0')
    url.searchParams.set('maximumPoolSize', '100')
    url.searchParams.set('maximumIdleConnections', '50')
    url.searchParams.set('acquireTimeout', '20')
    url.searchParams.set('borrowTimeout', '30')
    url.searchParams.set('retryInterval', '40')

    const client = new PGClientPSQL(url)

    try {
      expect((client as any)._provider._options).toEqual({
        user: 'myuser',
        password: 'mypass',
        database: 'mydatabase',
        host: 'localhost',
        port: 1234,
        minimumPoolSize: 0,
        maximumPoolSize: 100,
        maximumIdleConnections: 50,
        acquireTimeout: 20,
        borrowTimeout: 30,
        retryInterval: 40,
      })
    } finally {
      process.env.PGDATABASE = databaseName
      await client.destroy().catch(log.info)
    }
  })

  it('should register the psql protocol', async () => {
    const url = new URL('psql://myuser:mypass@localhost:1234/mydatabase')

    const client = new PGClient(url) // normal client!!!

    try {
      expect((client as any)._provider._options).toEqual({
        user: 'myuser',
        password: 'mypass',
        database: 'mydatabase',
        host: 'localhost',
        port: 1234,
      })
    } finally {
      process.env.PGDATABASE = databaseName
      await client.destroy().catch(log.info)
    }
  })

  it('should not construct with a non-psql url', () => {
    expect(() => new PGClientPSQL('http://localhost/'))
        .toThrowError('Unsupported protocol "http:"')
  })

  it('should run a simple query', async () => {
    const client = new PGClientPSQL()

    try {
      const result = await client.query('SELECT str, num FROM test WHERE num < $1', [ 3 ])
      expect(result).toEqual({
        command: 'SELECT',
        rowCount: 2,
        rows: [
          { str: 'foo', num: 1 },
          { str: 'bar', num: 2 },
        ],
        tuples: [
          [ 'foo', 1 ],
          [ 'bar', 2 ],
        ],
      })
    } finally {
      await client.destroy().catch(log.error) // log failures here!
    }
  })
})
