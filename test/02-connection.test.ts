import { AssertionError } from 'node:assert'

import LibPQ from 'libpq'

import { Connection } from '../src/connection'
import { databaseName } from './00-setup.test'
import { TestLogger } from './logger'

import type { ConnectionOptions } from '../src/connection'

fdescribe('Connection', () => {
  const logger = new TestLogger()

  function captureEvents(connection: Connection): [ string, ...any[] ][] {
    const events: [ string, ...any[] ][] = []
    connection.on('error', (...args: any[]) => events.push([ 'error', ...args ]))
    connection.on('aborted', (...args: any[]) => events.push([ 'aborted', ...args ]))
    connection.on('connected', (...args: any[]) => events.push([ 'connected', ...args ]))
    connection.on('disconnected', (...args: any[]) => events.push([ 'disconnected', ...args ]))
    return events
  }

  it('should serialize options into a string', () => {
    const connection = new Connection('test', logger, {
      database: databaseName, // this is _always_ required

      host: 'foobar.com', // non-falsy string
      port: 1234, // non-falsy number
      sslCompression: true, // non-falsy boolean

      applicationName: '', // empty string *won't* be included
      keepalivesIdle: 0, // falsy number *will* be included
      keepalives: false, // false *will* be included

      foobar: 'baz', // unknown options will be skipped
    } as ConnectionOptions)

    // remember, it's sorted!
    expect((connection as any)._options).toStrictlyEqual([
      `dbname='${databaseName}'`,
      // non falsy
      'host=\'foobar.com\'',
      'port=\'1234\'',
      'sslcompression=\'1\'',
      // falsy: no "application_name"
      'keepalives_idle=\'0\'',
      'keepalives=\'0\'',
      // no foobar
    ].join(' '))
  })

  it('should connect only once', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

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

    expect(events).toEqual([
      [ 'connected' ],
      [ 'disconnected', undefined ],
    ])
  })

  it('should fail connecting to a wrong database', async () => {
    const connection = new Connection('test', logger, { database: 'not_a_database' })
    const events = captureEvents(connection)

    try {
      await expect(connection.connect())
          .toBeRejectedWithError(Error, /database "not_a_database" does not exist/)
    } finally {
      connection.disconnect()
    }

    expect(events).toEqual([])
  })

  it('should fail even without an error message', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

    const connect = LibPQ.prototype.connect
    LibPQ.prototype.connect = ((_: any, cb: any): void => cb(new Error(''))) as any

    try {
      await expect(connection.connect())
          .toBeRejectedWithError(Error, 'Unknown connection error')
    } finally {
      LibPQ.prototype.connect = connect
      connection.disconnect()
    }

    expect(events).toEqual([])
  })

  it('should fail when asynchronous communication is impossible', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

    const setNonBlocking = LibPQ.prototype.setNonBlocking
    LibPQ.prototype.setNonBlocking = ((): boolean => false) as any

    try {
      await expect(connection.connect())
          .toBeRejectedWithError(Error, 'Unable to set connection as non-blocking')
    } finally {
      LibPQ.prototype.setNonBlocking = setNonBlocking
      connection.disconnect()
    }

    expect(events).toEqual([])
  })

  it('should fail when disconnection happens while connecting', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

    let error: any = undefined
    try {
      const promise = connection.connect().catch((e) => error = e)

      connection.disconnect()

      await promise

      expect(error).toBeError(`Connection "${connection.id}" aborted`)
    } finally {
      connection.disconnect()
    }

    expect(events).toEqual([
      [ 'aborted', error ],
    ])
  })

  it('should serialize queries', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

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
          [ 'x', expect.toBeA('number') ],
          [ 'y', 25 ],
        ],
        rows: [ [ '', 'one' ] ],
      })

      expect(calls).toEqual([ 1 ])

      expect(await p2).toEqual({
        command: 'SELECT',
        rowCount: 1,
        fields: [
          [ 'x', expect.toBeA('number') ],
          [ 'y', 25 ],
        ],
        rows: [ [ '', 'two' ] ],
      })

      expect(calls).toEqual([ 1, 2 ])

      expect(await p3).toEqual({
        command: 'SELECT',
        rowCount: 1,
        fields: [
          [ 'x', expect.toBeA('number') ],
          [ 'y', 25 ],
        ],
        rows: [ [ '', 'three' ] ],
      })

      expect(calls).toEqual([ 1, 2, 3 ])
    } finally {
      connection.disconnect()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'disconnected', undefined ],
    ])
  })

  it('should allow queries after a recoverable failure', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

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
              [ 'x', expect.toBeA('number') ],
            ],
            rows: [ [ null ] ],
          })
    } finally {
      connection.disconnect()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'disconnected', undefined ],
    ])
  })

  it('should allow queries after canceling a query', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

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
              [ 'x', expect.toBeA('number') ],
            ],
            rows: [ [ expect.toBeA('string') ] ],
          })
    } finally {
      connection.disconnect()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'disconnected', undefined ],
    ])
  })

  it('should fail when a postgres status was not recognized', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      await expect(connection.query('COPY pg_type TO stdout'))
          .toBeRejectedWithError(Error, 'Unrecognized status PGRES_COPY_OUT (resultStatus)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.disconnect()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'disconnected', expect.toBeError(Error, 'Unrecognized status PGRES_COPY_OUT (resultStatus)') ],
      [ 'error', expect.toBeError(Error, 'Unrecognized status PGRES_COPY_OUT (resultStatus)') ],
    ])
  })

  it('should fail when sending a query fails', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      ;(connection as any)._pq.sendQuery = (): boolean => false

      await expect(connection.query('SELECT now()'))
          .toBeRejectedWithError(Error, 'Unable to send query (sendQuery)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.disconnect()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'disconnected', expect.toBeError(Error, 'Unable to send query (sendQuery)') ],
      [ 'error', expect.toBeError(Error, 'Unable to send query (sendQuery)') ],
    ])
  })

  it('should fail when flushing a query fails', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      ;(connection as any)._pq.flush = (): number => -1

      await expect(connection.query('SELECT now()'))
          .toBeRejectedWithError(Error, 'Unable to flush query (flush)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.disconnect()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'disconnected', expect.toBeError(Error, 'Unable to flush query (flush)') ],
      [ 'error', expect.toBeError(Error, 'Unable to flush query (flush)') ],
    ])
  })

  it('should fail when input can not be consumed', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      ;(connection as any)._pq.consumeInput = (): boolean => false

      await expect(connection.query('SELECT now()'))
          .toBeRejectedWithError(Error, 'Unable to consume input (consumeInput)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.disconnect()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'disconnected', expect.toBeError(Error, 'Unable to consume input (consumeInput)') ],
      [ 'error', expect.toBeError(Error, 'Unable to consume input (consumeInput)') ],
    ])
  })

  it('should run a real query', async () => {
    const connection = new Connection('test', logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      expect(await connection.query('SELECT "str", "num" FROM "test" ORDER BY "num"'))
          .toEqual({
            command: 'SELECT',
            rowCount: 3,
            fields: [
              [ 'str', 1043 ],
              [ 'num', 23 ],
            ],
            rows: [
              [ 'foo', '1' ],
              [ 'bar', '2' ],
              [ 'baz', '3' ],
            ],
          })

      expect(connection.connected).toBeTrue()
    } finally {
      connection.disconnect()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'disconnected', undefined ],
    ])
  })
})
