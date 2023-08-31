import LibPQ from 'libpq'

import { Connection, convertOptions } from '../src/connection'
import { databaseName } from './00-setup.test'
import { TestLogger } from './logger'

import type { ConnectionOptions } from '../src/connection'

fdescribe('Connection', () => {
  const logger = new TestLogger()

  function captureEvents(connection: Connection): [ string, ...any[] ][] {
    const events: [ string, ...any[] ][] = []
    connection.on('error', (...args: any[]) => events.push([ 'error', ...args ]))
    connection.on('connected', (...args: any[]) => events.push([ 'connected', ...args ]))
    connection.on('destroyed', (...args: any[]) => events.push([ 'destroyed', ...args ]))
    return events
  }

  it('should serialize options into a string', () => {
    const string = convertOptions({
      database: databaseName, // this is _always_ required

      host: 'foobar.com', // non-falsy string
      port: 1234, // non-falsy number
      sslCompression: true, // non-falsy boolean

      applicationName: '', // empty string *won't* be included
      keepalivesIdle: 0, // falsy number *will* be included
      keepalives: false, // false *will* be included

      foobar: 'baz', // unknown options will be skipped
      password: null as any, // null
      user: undefined as any, // undefined
    } as ConnectionOptions)

    expect(string).toStrictlyEqual([
      `dbname='${databaseName}'`,
      // non falsy
      'host=\'foobar.com\'',
      'port=\'1234\'',
      'sslcompression=\'1\'',
      // falsy: no "application_name"
      'keepalives_idle=\'0\'',
      'keepalives=\'0\'',
      // no foobar
      // no password (null)
      // no user (undefined)
    ].join(' '))
  })

  it('should connect only once', async () => {
    const options = convertOptions({ database: databaseName })
    const connection = new Connection(logger, options)
    const events = captureEvents(connection)

    try {
      expect(connection.connected).toBeFalse()
      expect(connection.destroyed).toBeFalse()

      const result = await connection.connect()

      expect(result).toStrictlyEqual(connection)

      expect(connection.connected).toBeTrue()
      expect(connection.destroyed).toBeFalse()

      expect(connection.serverVersion).toMatch(/^\d+\.\d+$/)

      await expect(connection.connect())
          .toBeRejectedWithError(/Connection .* already connected/)

      connection.destroy()

      expect(connection.connected).toBeFalse()
      expect(connection.destroyed).toBeTrue()

      expect(() => connection.serverVersion)
          .toThrowError('Not connected')

      expect(() => connection.destroy()).not.toThrow()
    } finally {
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'destroyed' ],
    ])
  })

  it('should fail connecting to a wrong database', async () => {
    const connection = new Connection(logger, { database: 'not_a_database' })
    const events = captureEvents(connection)

    try {
      await expect(connection.connect())
          .toBeRejectedWithError(/database "not_a_database" does not exist/)
    } finally {
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'error', expect.toBeError(/database "not_a_database" does not exist/) ],
    ])
  })

  it('should fail even without an error message', async () => {
    const connection = new Connection(logger, { database: databaseName })
    const events = captureEvents(connection)

    const connect = LibPQ.prototype.connect
    LibPQ.prototype.connect = ((_: any, cb: any): void => cb(new Error(''))) as any

    try {
      await expect(connection.connect())
          .toBeRejectedWithError('Unknown connection error')
    } finally {
      LibPQ.prototype.connect = connect
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'error', expect.toBeError('Unknown connection error') ],
    ])
  })

  it('should fail when asynchronous communication is impossible', async () => {
    const connection = new Connection(logger, { database: databaseName })
    const events = captureEvents(connection)

    const setNonBlocking = LibPQ.prototype.setNonBlocking
    LibPQ.prototype.setNonBlocking = ((): boolean => false) as any

    try {
      await expect(connection.connect())
          .toBeRejectedWithError('Unable to set connection as non-blocking')
    } finally {
      LibPQ.prototype.setNonBlocking = setNonBlocking
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'error', expect.toBeError('Unable to set connection as non-blocking') ],
    ])
  })

  it('should fail when destruction happens while connecting (1)', async () => {
    const connection = new Connection(logger, { database: databaseName })
    const events = captureEvents(connection)

    let error: any = undefined
    try {
      const promise = connection.connect().catch((e) => error = e)

      connection.destroy()
      ;(connection as any)._pq.connected = true // force connected
      ;(connection as any)._destroyed = true // force destroyed

      await promise

      expect(error).toBeError(`Connection "${connection.id}" aborted`)
    } finally {
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'destroyed' ],
      [ 'error', error ],
    ])
  })

  it('should fail when destruction happens while connecting (2)', async () => {
    const connection = new Connection(logger, { database: databaseName })
    const events = captureEvents(connection)

    let error: any = undefined
    try {
      const promise = connection.connect().catch((e) => error = e)

      connection.destroy()
      ;(connection as any)._pq.connected = false // force not connected
      ;(connection as any)._destroyed = false // force not destroyed

      await promise

      expect(error).toBeError(`Connection "${connection.id}" not connected`)
    } finally {
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'destroyed' ],
      [ 'error', error ],
    ])
  })

  it('should serialize queries', async () => {
    const connection = new Connection(logger, { database: databaseName })
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
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'destroyed' ],
    ])
  })

  it('should allow queries after a recoverable failure', async () => {
    const connection = new Connection(logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      await expect(connection.query('FLUBBER'))
          .toBeRejectedWithError(/FLUBBER/)

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
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'destroyed' ],
    ])
  })

  it('should allow queries after canceling a query', async () => {
    const connection = new Connection(logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      const promise = connection.query('SELECT pg_sleep(10)')

      await new Promise((resolve) => setTimeout(resolve, 50))

      connection.cancel()

      await expect(promise).toBeRejectedWithError(/cancel/i)

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
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'destroyed' ],
    ])
  })

  it('should fail when a postgres status was not recognized', async () => {
    const connection = new Connection(logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      await expect(connection.query('COPY pg_type TO stdout'))
          .toBeRejectedWithError('Unrecognized status PGRES_COPY_OUT (resultStatus)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'error', expect.toBeError('Unrecognized status PGRES_COPY_OUT (resultStatus)') ],
    ])
  })

  it('should fail when sending a query fails', async () => {
    const connection = new Connection(logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      ;(connection as any)._pq.sendQuery = (): boolean => false

      await expect(connection.query('SELECT now()'))
          .toBeRejectedWithError('Unable to send query (sendQuery)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'error', expect.toBeError('Unable to send query (sendQuery)') ],
    ])
  })

  it('should fail when flushing a query fails', async () => {
    const connection = new Connection(logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      ;(connection as any)._pq.flush = (): number => -1

      await expect(connection.query('SELECT now()'))
          .toBeRejectedWithError('Unable to flush query (flush)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'error', expect.toBeError('Unable to flush query (flush)') ],
    ])
  })

  it('should fail when input can not be consumed', async () => {
    const connection = new Connection(logger, { database: databaseName })
    const events = captureEvents(connection)

    try {
      await connection.connect()

      ;(connection as any)._pq.consumeInput = (): boolean => false

      await expect(connection.query('SELECT now()'))
          .toBeRejectedWithError('Unable to consume input (consumeInput)')

      expect(connection.connected).toBeFalse()
    } finally {
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'error', expect.toBeError('Unable to consume input (consumeInput)') ],
    ])
  })

  it('should run a real query', async () => {
    const connection = new Connection(logger, { database: databaseName })
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
      connection.destroy()
    }

    expect(events).toEqual([
      [ 'connected' ],
      [ 'destroyed' ],
    ])
  })
})
