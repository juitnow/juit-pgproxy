import { PGClient } from '@juit/pgproxy-client'
import { PGOIDs } from '@juit/pgproxy-types'

import { databaseName } from '../../../support/setup-db'
import { TestLogger, restoreEnv } from '../../../support/utils'
import { PSQLClient } from '../src/index'

describe('PSQL Client', () => {
  let pgdatabase: string | undefined

  beforeAll(() => {
    PSQLClient.logger = new TestLogger()
    pgdatabase = process.env.PGDATABASE
    process.env.PGDATABASE = databaseName
  })

  beforeEach(() => {
    process.env.PGDATABASE = databaseName
  })

  afterAll(() => {
    PSQLClient.logger = console
    restoreEnv('PGDATABASE', pgdatabase)
  })

  it('should construct without any parameter', async () => {
    const client = new PSQLClient()

    try {
      expect((client as any)._provider._pool._connectionOptions)
          .toStrictlyEqual('')
    } finally {
      await client.destroy().catch(log.info)
    }
  })

  it('should construct with only the protocol', async () => {
    const client = new PSQLClient('psql://')

    try {
      expect((client as any)._provider._pool._connectionOptions)
          .toStrictlyEqual('')
    } finally {
      await client.destroy().catch(log.info)
    }
  })

  it('should construct with a string url', async () => {
    const client = new PSQLClient('psql://myuser:mypass@localhost:1234/mydatabase')

    try {
      expect((client as any)._provider._pool._connectionOptions)
          .toStrictlyEqual('user=\'myuser\' password=\'mypass\' host=\'localhost\' port=\'1234\' dbname=\'mydatabase\'')
    } finally {
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

    const client = new PSQLClient(url)

    try {
      expect((client as any)._provider._pool._connectionOptions)
          .toStrictlyEqual('user=\'myuser\' password=\'mypass\' host=\'localhost\' port=\'1234\' dbname=\'mydatabase\'')
      expect((client as any)._provider._pool._minimumPoolSize).toStrictlyEqual(0)
      expect((client as any)._provider._pool._maximumPoolSize).toStrictlyEqual(100)
      expect((client as any)._provider._pool._maximumIdleConnections).toStrictlyEqual(50)
      expect((client as any)._provider._pool._acquireTimeoutMs).toStrictlyEqual(20000)
      expect((client as any)._provider._pool._borrowTimeoutMs).toStrictlyEqual(30000)
      expect((client as any)._provider._pool._retryIntervalMs).toStrictlyEqual(40000)
    } finally {
      await client.destroy().catch(log.info)
    }
  })

  it('should register the psql protocol', async () => {
    const url = new URL('psql://myuser:mypass@localhost:1234/mydatabase')

    const client = new PGClient(url) // normal client!!!

    try {
      expect((client as any)._provider._pool._connectionOptions)
          .toStrictlyEqual('user=\'myuser\' password=\'mypass\' host=\'localhost\' port=\'1234\' dbname=\'mydatabase\'')
    } finally {
      await client.destroy().catch(log.info)
    }
  })

  it('should not construct with a non-psql url', () => {
    expect(() => new PSQLClient('http://localhost/'))
        .toThrowError('Unsupported protocol "http:"')
  })

  it('should run a simple query', async () => {
    const client = new PSQLClient()

    try {
      const result = await client.query('SELECT str, num FROM test WHERE num < $1', [ 3 ])
      expect(result).toEqual({
        command: 'SELECT',
        rowCount: 2,
        fields: [
          { name: 'str', oid: PGOIDs.varchar },
          { name: 'num', oid: PGOIDs.int4 },
        ],
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

  it('should not run transactions with query', async () => {
    const client = new PSQLClient()

    try {
      const result0 = await client.query('BEGIN')
      const result1 = await client.query('CREATE TEMPORARY TABLE a (b int) ON COMMIT DROP')
      const result2 = await client.query('SELECT pg_current_xact_id_if_assigned() AS txn')

      expect(result0).toEqual({ command: 'BEGIN', rowCount: 0, fields: [], rows: [], tuples: [] })
      expect(result1).toEqual({ command: 'CREATE', rowCount: 0, fields: [], rows: [], tuples: [] })
      expect(result2).toEqual({
        command: 'SELECT',
        rowCount: 1,
        fields: [ { name: 'txn', oid: PGOIDs.xid8 } ],
        rows: [ { txn: null } ],
        tuples: [ [ null ] ],
      })
    } finally {
      await client.destroy().catch(log.error) // log failures here!
    }
  })

  it('should run transactions with connect', async () => {
    const client = new PSQLClient()

    try {
      const [ result0, result1, result2 ] = await client.connect(async (connection) => {
        const result0 = await connection.query('BEGIN')
        const result1 = await connection.query('CREATE TEMPORARY TABLE a (b int) ON COMMIT DROP')
        const result2 = await connection.query('SELECT pg_current_xact_id_if_assigned() as txn')
        return [ result0, result1, result2 ]
      })

      expect(result0).toEqual({ command: 'BEGIN', rowCount: 0, fields: [], rows: [], tuples: [] })
      expect(result1).toEqual({ command: 'CREATE', rowCount: 0, fields: [], rows: [], tuples: [] })
      expect(result2).toEqual({
        command: 'SELECT',
        rowCount: 1,
        fields: [ { name: 'txn', oid: PGOIDs.xid8 } ],
        rows: [ { txn: expect.toBeA('bigint') } ],
        tuples: [ [ expect.toBeA('bigint') ] ],
      })
      expect(result2.rows[0]!.txn).toEqual(result2.tuples[0]![0])
    } finally {
      await client.destroy().catch(log.error) // log failures here!
    }
  })
})
