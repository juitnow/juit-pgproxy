import { AssertionError } from 'node:assert'

import LibPQ from 'libpq'

import { Connection } from '../src/connection'

describe('Connection', () => {
  it('should serialize options into a string', () => {
    const connection = new Connection({
      application_name: '', // will be trimmed!
      dbname: undefined, // has key, but it's null
      foobar: 'baz', // this is not recognized, will be skipped
      host: 'foobar.com',
      keepalives: false,
      port: 1234,
      sslcompression: true,
    } as any)

    // remember, it's sorted!
    expect((connection as any)._options).toStrictlyEqual([
      'host=\'foobar.com\'',
      'keepalives=\'0\'',
      'port=\'1234\'',
      'sslcompression=\'1\'',
    ].join(' '))
  })

  it('should connect only once', async () => {
    const connection = new Connection()

    try {
      expect(connection.connected).toBeFalse()
      const result = await connection.connect()

      expect(result).toStrictlyEqual(connection)
      expect(connection.connected).toBeTrue()

      expect(connection.serverVersion).toMatch(/^\d+\.\d+$/)

      await expect(connection.connect())
          .toBeRejectedWithError(AssertionError, 'Already connected')

      connection.disconnect()
      expect(connection.connected).toBeFalse()
      expect(() => connection.serverVersion)
          .toThrowError(AssertionError, 'Not connected')

      expect(() => connection.disconnect()).not.toThrow()
    } finally {
      connection.disconnect()
    }
  })

  it('should fail connecting to a wrong database', async () => {
    const connection = new Connection({ dbname: 'not_a_database' })

    try {
      await expect(connection.connect())
          .toBeRejectedWithError(Error, /database "not_a_database" does not exist/)
    } finally {
      connection.disconnect()
    }
  })

  it('should fail even without an error message', async () => {
    const connection = new Connection()

    const connect = LibPQ.prototype.connect
    LibPQ.prototype.connect = ((_: any, cb: any): void => cb(new Error(''))) as any

    try {
      await expect(connection.connect())
          .toBeRejectedWithError(Error, 'Unknown connection error')
    } finally {
      LibPQ.prototype.connect = connect
      connection.disconnect()
    }
  })

  it('should fail when asynchronous communication is impossible', async () => {
    const connection = new Connection()

    const setNonBlocking = LibPQ.prototype.setNonBlocking
    LibPQ.prototype.setNonBlocking = ((): boolean => false) as any

    try {
      await expect(connection.connect())
          .toBeRejectedWithError(Error, 'Unable to set connection as non-blocking')
    } finally {
      LibPQ.prototype.setNonBlocking = setNonBlocking
      connection.disconnect()
    }
  })

  it('should serialize queries', async () => {
    const connection = new Connection()

    try {
      await connection.connect()

      const calls: number[] = []

      const p1 = connection.query('SELECT pg_sleep(0.3) AS x, \'one\' AS y')
          .finally(() => calls.push(1))
      const p2 = connection.query('SELECT pg_sleep(0.2) AS x, \'two\' AS y', [])
          .finally(() => calls.push(2))
      const p3 = connection.query('SELECT pg_sleep(0.2) AS x, $1 AS y', [ 'three' ])
          .finally(() => calls.push(3))

      expect(calls).toEqual([])

      expect(await p1).toEqual({
        command: 'SELECT',
        rowCount: 1,
        fields: [
          { name: 'x', oid: expect.toBeA('number') },
          { name: 'y', oid: 25 },
        ],
        rows: [ [ '', 'one' ] ],
      })

      expect(calls).toEqual([ 1 ])

      expect(await p2).toEqual({
        command: 'SELECT',
        rowCount: 1,
        fields: [
          { name: 'x', oid: expect.toBeA('number') },
          { name: 'y', oid: 25 },
        ],
        rows: [ [ '', 'two' ] ],
      })

      expect(calls).toEqual([ 1, 2 ])

      expect(await p3).toEqual({
        command: 'SELECT',
        rowCount: 1,
        fields: [
          { name: 'x', oid: expect.toBeA('number') },
          { name: 'y', oid: 25 },
        ],
        rows: [ [ '', 'three' ] ],
      })

      expect(calls).toEqual([ 1, 2, 3 ])
    } finally {
      connection.disconnect()
    }
  })

  it('should allow queries after a recoverable failure', async () => {
    const connection = new Connection()

    try {
      await connection.connect()

      await expect(connection.query('FLUBBER'))
          .toBeRejectedWithError(Error, /FLUBBER/)

      expect(connection.connected).toBeTrue()

      expect(await connection.query('SELECT null as x'))
          .toEqual({
            command: 'SELECT',
            rowCount: 1,
            fields: [
              { name: 'x', oid: expect.toBeA('number') },
            ],
            rows: [ [ null ] ],
          })
    } finally {
      connection.disconnect()
    }
  })

  it('should allow queries after canceling a query', async () => {
    const connection = new Connection()

    try {
      await connection.connect()

      const promise = connection.query('SELECT pg_sleep(10)')

      await new Promise((resolve) => setTimeout(resolve, 50))

      connection.cancel()

      await expect(promise).toBeRejectedWithError(Error, /cancel/i)

      expect(connection.connected).toBeTrue()

      expect(await connection.query('SELECT now() as x'))
          .toEqual({
            command: 'SELECT',
            rowCount: 1,
            fields: [
              { name: 'x', oid: expect.toBeA('number') },
            ],
            rows: [ [ expect.toBeA('string') ] ],
          })
    } finally {
      connection.disconnect()
    }
  })

  it('should fail when a postgres status was not recognized', async () => {
    const connection = new Connection()

    try {
      await connection.connect()

      await expect(connection.query('COPY pg_type TO stdout'))
          .toBeRejectedWithError(Error, 'Unrecognized status PGRES_COPY_OUT (resultStatus)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.disconnect()
    }
  })

  it('should fail when sending a query fails', async () => {
    const connection = new Connection()

    try {
      await connection.connect()

      ;(connection as any)._pq.sendQuery = (): boolean => false

      await expect(connection.query('SELECT now()'))
          .toBeRejectedWithError(Error, 'Unable to send query (sendQuery)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.disconnect()
    }
  })

  it('should fail when flushing a query fails', async () => {
    const connection = new Connection()

    try {
      await connection.connect()

      ;(connection as any)._pq.flush = (): number => -1

      await expect(connection.query('SELECT now()'))
          .toBeRejectedWithError(Error, 'Unable to flush query (flush)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.disconnect()
    }
  })

  it('should fail when input can not be consumed', async () => {
    const connection = new Connection()

    try {
      await connection.connect()

      ;(connection as any)._pq.consumeInput = (): boolean => false

      await expect(connection.query('SELECT now()'))
          .toBeRejectedWithError(Error, 'Unable to consume input (consumeInput)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.disconnect()
    }
  })
})
