import { databaseName } from '../../../support/setup-db'
import { TestLogger, restoreEnv, sleep } from '../../../support/utils'
import { Connection } from '../src/connection'
import { ConnectionPool } from '../src/index'

import type { ConnectionQueryResult } from '../src/connection'
import type { Logger } from '../src/index'

describe('Connection Pool', () => {
  const logger = new TestLogger()

  function captureEvents(pool: ConnectionPool): () => [ string, ...any[] ][] {
    const events: [ string, ...any[] ][] = []
    pool.on('started', () => events.push([ 'started' ]))
    pool.on('stopped', () => events.push([ 'stopped' ]))
    pool.on('error', (error) => events.push([ 'error', error ]))
    pool.on('connection_created', (connection) => events.push([ 'connection_created', connection.id ]))
    pool.on('connection_destroyed', (connection) => events.push([ 'connection_destroyed', connection.id ]))
    pool.on('connection_aborted', (connection) => events.push([ 'connection_aborted', connection.id ]))
    pool.on('connection_acquired', (connection) => events.push([ 'connection_acquired', connection.id ]))
    pool.on('connection_released', (connection) => events.push([ 'connection_released', connection.id ]))
    return () => [ ...events ]
  }

  describe('construction', () => {
    it('should construct with some defaults', () => {
      const pool = new ConnectionPool(logger)
      expect(pool.configuration).toEqual({
        minimumPoolSize: 0,
        maximumPoolSize: 20,
        maximumIdleConnections: 10,
        acquireTimeout: 30,
        borrowTimeout: 120,
        retryInterval: 5,
        validateOnBorrow: true,
      })
    })

    it('should construct from environment variables', () => {
      const minimumPoolSize = process.env.PGPOOLMINSIZE
      const maximumPoolSize = process.env.PGPOOLMAXSIZE
      const maximumIdleConnections = process.env.PGPOOLIDLECONN
      const acquireTimeout = process.env.PGPOOLACQUIRETIMEOUT
      const borrowTimeout = process.env.PGPOOLBORROWTIMEOUT
      const retryInterval = process.env.PGPOOLRETRYINTERVAL
      const validateOnBorrow = process.env.PGPOOLVALIDATEONBORROW
      try {
        process.env.PGPOOLMINSIZE = '2'
        process.env.PGPOOLMAXSIZE = '4'
        process.env.PGPOOLIDLECONN = '3'
        process.env.PGPOOLACQUIRETIMEOUT = '10'
        process.env.PGPOOLBORROWTIMEOUT = '20'
        process.env.PGPOOLRETRYINTERVAL = '30'
        process.env.PGPOOLVALIDATEONBORROW = 'true'

        const pool = new ConnectionPool(logger)
        expect(pool.configuration).toEqual({
          minimumPoolSize: 2,
          maximumPoolSize: 4,
          maximumIdleConnections: 3,
          acquireTimeout: 10,
          borrowTimeout: 20,
          retryInterval: 30,
          validateOnBorrow: true,
        })
      } finally {
        restoreEnv('PGPOOLMINSIZE', minimumPoolSize)
        restoreEnv('PGPOOLMAXSIZE', maximumPoolSize)
        restoreEnv('PGPOOLIDLECONN', maximumIdleConnections)
        restoreEnv('PGPOOLACQUIRETIMEOUT', acquireTimeout)
        restoreEnv('PGPOOLBORROWTIMEOUT', borrowTimeout)
        restoreEnv('PGPOOLRETRYINTERVAL', retryInterval)
        restoreEnv('PGPOOLVALIDATEONBORROW', validateOnBorrow)
      }
    })

    it('should fail when an environment variable is wrong', () => {
      const minimumPoolSize = process.env.PGPOOLMINSIZE
      try {
        process.env.PGPOOLMINSIZE = 'foobar'

        expect(() => new ConnectionPool(logger))
            .toThrowError('Invalid value "foobar" for environment variable "PGPOOLMINSIZE"')
      } finally {
        restoreEnv('PGPOOLMINSIZE', minimumPoolSize)
      }

      const validateOnBorrow = process.env.PGPOOLVALIDATEONBORROW
      try {
        process.env.PGPOOLVALIDATEONBORROW = 'foobar'

        expect(() => new ConnectionPool(logger))
            .toThrowError('Invalid value "foobar" for environment variable "PGPOOLVALIDATEONBORROW"')
      } finally {
        restoreEnv('PGPOOLVALIDATEONBORROW', validateOnBorrow)
      }
    })
  })

  describe('pool lifecycle', () => {
    it('should start a pool and stop it without keeping the initial connection', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 0,
      })

      const events = captureEvents(pool)

      try {
        expect(pool.running).toBeFalse()
        // should allow to be started twice
        await pool.start()
        expect(pool.running).toBeTrue()
        await pool.start()

        expect(events()).toEqual([
          [ 'started' ],
          [ 'connection_created', expect.toBeA('string') ],
          [ 'connection_destroyed', expect.toBeA('string') ],
        ])

        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })
      } finally {
        // should allow to be stopped twice
        expect(pool.running).toBeTrue()
        pool.stop()
        expect(pool.running).toBeFalse()
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', expect.toBeA('string') ],
        [ 'connection_destroyed', expect.toBeA('string') ],
        [ 'stopped' ],
      ])
    })

    it('should start a pool and stop it keeping the initial connection', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 1,
        maximumPoolSize: 1,
        maximumIdleConnections: 1,
      })

      const events = captureEvents(pool)

      try {
      // should allow to be started twice
        await pool.start()
        await pool.start()

        expect(events()).toEqual([
          [ 'started' ],
          [ 'connection_created', expect.toBeA('string') ],
        ])

        expect(pool.stats).toEqual({
          available: 1,
          borrowed: 0,
          connecting: 0,
          total: 1,
        })
      } finally {
      // should allow to be stopped twice
        pool.stop()
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', expect.toBeA('string') ],
        [ 'stopped' ],
        [ 'connection_destroyed', expect.toBeA('string') ],
      ])
    })

    it('should start a pool with a single connections', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 1,
        maximumPoolSize: 1,
      })

      const events = captureEvents(pool)

      let id: string | undefined
      try {
        // should allow to be started twice
        await pool.start()
        await pool.start()

        // acquire the only connection
        const connection = await pool.acquire()
        id = connection.id

        // those should be resolved in series
        const promise1 = pool.acquire()
        const promise2 = pool.acquire()
        const promise3 = pool.acquire()

        // release back in series
        pool.release(connection)
        pool.release(await promise1)
        pool.release(await promise2)
        pool.release(await promise3)

        // let the connection be released (async) before stopping below
        await sleep(100)
      } finally {
        // should allow to be stopped twice
        pool.stop()
        pool.stop()
      }

      expect(events()).toEqual([
        // start
        [ 'started' ],
        [ 'connection_created', id ],
        // acquire and then release the first connection
        [ 'connection_acquired', id ],
        [ 'connection_released', id ],
        // three more times, coming from the promises 1, 2 and 3
        [ 'connection_acquired', id ],
        [ 'connection_released', id ],
        [ 'connection_acquired', id ],
        [ 'connection_released', id ],
        [ 'connection_acquired', id ],
        [ 'connection_released', id ],
        // stop the pool
        [ 'stopped' ],
        // destroy the connections
        [ 'connection_destroyed', id ],
      ])
    })

    it('should start with multiple acquires in parallel', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 10,
        maximumIdleConnections: 10,
      })

      const events = captureEvents(pool)

      let id1: string | undefined
      let id2: string | undefined
      try {
        // asynchronously start and get immediately two connections
        const promise = pool.start()
        const promise1 = pool.acquire()
        const promise2 = pool.acquire()

        // release back in series
        await promise // start
        const connection1 = await promise1
        const connection2 = await promise2
        id1 = connection1.id
        id2 = connection2.id
        pool.release(connection1)
        pool.release(connection2)

        // let the connection be released (async) before stopping below
        await sleep(100)
      } finally {
        pool.stop()
      }

      // The order here can be a bit messy, so we check manually...
      expect(events().slice(0, 2)).toEqual([
        [ 'started' ],
        [ 'connection_created', id1 ],
      ]) // first is start and initial connection creation

      expect(events().slice(2, 5)).toMatchContents([
        [ 'connection_acquired', id1 ],
        [ 'connection_created', id2 ],
        [ 'connection_acquired', id2 ],
      ]) // then is acquire conn 1 and create + acquire conn 2

      expect(events().slice(5, 7)).toMatchContents([
        [ 'connection_released', id1 ],
        [ 'connection_released', id2 ],
      ]) // then connections get released (order might vary)

      expect(events()[7]).toEqual([ 'stopped' ]) // then stop

      expect(events().slice(8)).toMatchContents([
        [ 'connection_destroyed', id1 ],
        [ 'connection_destroyed', id2 ],
      ]) // finally destroy both connections
    })

    it('should not start in case the first connection fails', async () => {
      const pool = new ConnectionPool(logger, {
        database: 'this-is-not-a-valid-database',
        minimumPoolSize: 1,
        maximumPoolSize: 1,
      })

      const events = captureEvents(pool)

      try {
        await expect(pool.start())
            .toBeRejectedWithError(/this-is-not-a-valid-database/)
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'error', expect.toBeInstanceOf(Error) ],
      ])
    })

    it('should fail acquired connections when start fails', async () => {
      const pool = new ConnectionPool(logger, {
        database: 'this-is-not-a-valid-database',
        minimumPoolSize: 0,
        maximumPoolSize: 10,
        maximumIdleConnections: 0,
      })

      const events = captureEvents(pool)

      // asynchronously start and get immediately two connections
      const promise = pool.start()
      const promise1 = pool.acquire()
      const promise2 = pool.acquire()

      // expect "start" to fail with an error
      await expect(promise).toBeRejectedWithError()
      const error = await promise.catch((error) => error)
      expect(error).toBeInstanceOf(Error)

      // expect the promises to the initial connections to be rejected
      // with the same error that triggered the "start" failure
      await expect(promise1).toBeRejectedWith(error)
      await expect(promise2).toBeRejectedWith(error)

      expect(events()).toEqual([
        [ 'error', error ],
      ])
    })

    it('should terminate any pending acquisition when the pool stops', async () => {
      let delay = 0

      const pool = new class extends ConnectionPool {
        protected _create(logger: Logger, options: string): Connection {
          return new class extends Connection {
            async connect(): Promise<Connection> {
              if (delay) await sleep(delay)
              return super.connect()
            }
          }(logger, options)
        }
      }(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 0,
      })

      const events = captureEvents(pool)

      try {
        await pool.start()

        // make sure no connection is retained
        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })

        delay = 100

        const error = pool.acquire().catch((error) => error)
        pool.stop()

        expect(await error).toBeError('Connection pool stopped')
      } finally {
        delay = 0
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', expect.toBeA('string') ],
        [ 'connection_destroyed', expect.toBeA('string') ],
        [ 'stopped' ],
      ])
    })

    it('should ignore while previously managed connections', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 0,
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        // make sure no connection is retained
        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })

        connection = await pool.acquire()

        pool.release(connection) // release should work

        // await for the pool to evict the connection
        await sleep(20)
        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })

        // this was already evicted by the pool, it should not throw
        expect(() => pool.release(connection!)).not.toThrow()

        // negative test, any other connection must throw
        const connection2 = new Connection(logger, { database: databaseName })
        expect(() => pool.release(connection2))
            .toThrowError(`Connection "${connection2.id}" not owned by this pool`)
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', expect.toBeA('string') ],
        [ 'connection_destroyed', expect.toBeA('string') ],
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'connection_destroyed', connection.id ],
        [ 'stopped' ],
      ])
    })

    it('should start a pool with multiple connections', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 2,
        maximumPoolSize: 4,
        maximumIdleConnections: 3,
      })

      const events = captureEvents(pool)

      try {
        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })

        await pool.start()

        // creation happens in a run loop, it might take time for all connections
        // to be fille up to the minimum pool size... wait a bit!
        await sleep(200)

        expect(pool.stats).toEqual({
          available: 2,
          borrowed: 0,
          connecting: 0,
          total: 2,
        })
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', expect.toBeA('string') ],
        [ 'connection_created', expect.toBeA('string') ],
        [ 'stopped' ],
        [ 'connection_destroyed', expect.toBeA('string') ],
        [ 'connection_destroyed', expect.toBeA('string') ],
      ])
    })
  })

  describe('disconnections', () => {
    it('should remove an available connection when destroyed from outside', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 1,
        maximumPoolSize: 1,
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        connection = (pool as any)._available[0] as Connection
        expect(connection).toBeDefined()

        // check that the connection is in the available list, not borrowed
        expect((pool as any)._connections.has(connection)).toBeTrue()
        expect((pool as any)._borrowed.has(connection)).toBeFalse()
        expect((pool as any)._available.indexOf(connection)).toBeGreaterThanOrEqual(0)

        // destroy connection, handlers are synchronous
        connection.destroy()

        // not in the available, nor in the borrowed lists
        expect((pool as any)._connections.has(connection)).toBeFalse()
        expect((pool as any)._borrowed.has(connection)).toBeFalse()
        expect((pool as any)._available.indexOf(connection)).toStrictlyEqual(-1)

        // at this point the creation loop needs to run to re-create
        // at least one connection, our "minimumPoolSize"
        await sleep(100)
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', connection.id ],
        [ 'connection_destroyed', connection.id ],
        [ 'connection_created', expect.toBeA('string').not.toEqual(connection.id) ],
        [ 'stopped' ],
        [ 'connection_destroyed', expect.toBeA('string').not.toEqual(connection.id) ],
      ])
    })

    it('should remove a borrowed connection when destroyed from outside', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 1,
        maximumPoolSize: 1,
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        connection = await pool.acquire()

        expect((pool as any)._connections.has(connection)).toBeTrue()
        expect((pool as any)._borrowed.has(connection)).toBeTrue()
        expect((pool as any)._available.indexOf(connection)).toStrictlyEqual(-1)

        connection.destroy()

        expect((pool as any)._connections.has(connection)).toBeFalse()
        expect((pool as any)._borrowed.has(connection)).toBeFalse()
        expect((pool as any)._available.indexOf(connection)).toStrictlyEqual(-1)

        // at this point the creation loop needs to run to re-create
        // at least one connection, our "minimumPoolSize"
        await sleep(100)
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'connection_destroyed', connection.id ],
        [ 'connection_created', expect.toBeA('string').not.toEqual(connection.id) ],
        [ 'stopped' ],
        [ 'connection_destroyed', expect.toBeA('string').not.toEqual(connection.id) ],
      ])
    })
  })

  describe('connection creation', () => {
    it('should retry after some time when a connection can not be created', async () => {
      let fail = false
      const timings: number[] = []
      const pool = new class extends ConnectionPool {
        protected _create(logger: Logger, options: string): Connection {
          timings.push(Date.now())
          if (! fail) return super._create(logger, options)
          fail = false
          throw new Error('This is intended')
        }
      }(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 0,
        retryInterval: 0.5, // 500 ms
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined
      try {
        await pool.start()

        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })

        fail = true
        connection = await pool.acquire()

        expect(fail).toBeFalse() // must have been reset by create!
        expect(timings).toHaveLength(3) // must be called 3 times
        expect(timings[2]! - timings[1]!).toBeGreaterThanOrEqual(490)
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        // this is the initial connection
        [ 'connection_created', expect.toBeA('string').not.toEqual(connection.id) ],
        [ 'connection_destroyed', expect.toBeA('string').not.toEqual(connection.id) ],
        // the failed connection doesn't generate events, here we'll only see
        // see the events for the one that *actually* was created successfully
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'stopped' ],
        [ 'connection_destroyed', connection.id ],
      ])
    })

    it('should retry after some time when a connection can not be connected', async () => {
      let fail = false
      const timings: number[] = []
      const pool = new class extends ConnectionPool {
        protected _create(logger: Logger, params: string): Connection {
          return new class extends Connection {
            async connect(): Promise<Connection> {
              timings.push(Date.now())
              if (! fail) return super.connect()
              fail = false
              throw new Error('This is intended')
            }
          }(logger, params)
        }
      }(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 0,
        retryInterval: 0.5, // 500 ms
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined
      try {
        await pool.start()

        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })

        fail = true
        connection = await pool.acquire()

        expect(fail).toBeFalse() // must have been reset by create!
        expect(timings).toHaveLength(3) // must be called 3 times
        expect(timings[2]! - timings[1]!).toBeGreaterThanOrEqual(500)
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        // this is the initial connection
        [ 'connection_created', expect.toBeA('string').not.toEqual(connection.id) ],
        [ 'connection_destroyed', expect.toBeA('string').not.toEqual(connection.id) ],
        // the connection that failed connecting is "aborted"
        [ 'connection_aborted', expect.toBeA('string').not.toEqual(connection.id) ],
        // the connection that *actually* was created successfully
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'stopped' ],
        [ 'connection_destroyed', connection.id ],
      ])
    })

    it('should retry immediately when a connection can not be validated', async () => {
      let fail = false
      const timings: number[] = []
      const pool = new class extends ConnectionPool {
        protected async _validate(connection: Connection): Promise<boolean> {
          timings.push(Date.now())
          if (! fail) return super._validate(connection)
          fail = false
          return false
        }
      }(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 1,
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined
      try {
        await pool.start()

        expect(pool.stats).toEqual({
          available: 1,
          borrowed: 0,
          connecting: 0,
          total: 1,
        })

        fail = true
        connection = await pool.acquire()

        expect(fail).toBeFalse() // must have been reset by create!
        expect(timings).toHaveLength(3) // must be called 3 times
        expect(timings[2]! - timings[1]!).toBeLessThan(50) // max 50 ms!
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        // this is the initial connection
        [ 'connection_created', expect.toBeA('string').not.toEqual(connection.id) ],
        [ 'connection_destroyed', expect.toBeA('string').not.toEqual(connection.id) ],
        // the connection that *actually* was created successfully
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'stopped' ],
        [ 'connection_destroyed', connection.id ],
      ])
    })
  })

  describe('connection recycling', () => {
    it('should not recycle a disconnected connection', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 0,
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        connection = await pool.acquire()

        // disconnect without triggering any event
        ;(connection as any)._pq.finish()

        pool.release(connection)

        // the pool runs the recycling asynchronously
        await sleep(100)

        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        // initial connection (not kept idle)
        [ 'connection_created', expect.toBeA('string').not.toEqual(connection.id) ],
        [ 'connection_destroyed', expect.toBeA('string').not.toEqual(connection.id) ],
        // our connection
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'connection_destroyed', connection.id ],
        [ 'stopped' ],
      ])
    })

    it('should not recycle a connection when enough are available', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 0,
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        connection = await pool.acquire()
        pool.release(connection)

        // the pool runs the recycling asynchronously
        await sleep(100)

        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        // initial connection (not kept idle)
        [ 'connection_created', expect.toBeA('string').not.toEqual(connection.id) ],
        [ 'connection_destroyed', expect.toBeA('string').not.toEqual(connection.id) ],
        // our connection
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'connection_destroyed', connection.id ],
        [ 'stopped' ],
      ])
    })

    it('should not recycle a connection when recycling fails', async () => {
      const pool = new class extends ConnectionPool {
        protected async _recycle(connection: Connection): Promise<boolean> {
          void connection
          return false
        }
      }(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 1, // recycle happens *after* minimum levels check
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        connection = await pool.acquire()
        pool.release(connection)

        // the pool runs the recycling asynchronously
        await sleep(100)

        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        // initial connection (kept idle)
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        // recycle fails!
        [ 'connection_destroyed', connection.id ],
        [ 'stopped' ],
      ])
    })

    it('should not recycle a connection when an error occurs', async () => {
      const pool = new class extends ConnectionPool {
        protected async _recycle(connection: Connection): Promise<boolean> {
          void connection
          throw new Error('This is intended!')
        }
      }(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 1, // recycle happens *after* minimum levels check
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        connection = await pool.acquire()
        pool.release(connection)

        // the pool runs the recycling asynchronously
        await sleep(100)

        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        // initial connection (kept idle)
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        // recycle throws an error!
        [ 'connection_destroyed', connection.id ],
        [ 'stopped' ],
      ])
    })

    it('should roll back transactions on release', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        connection = await pool.acquire()

        const result1 = await connection.query('BEGIN')
        expect(result1, 'Result for BEGIN').toEqual({
          command: 'BEGIN',
          rowCount: 0,
          fields: [],
          rows: [],
        })

        const result2 = await connection.query('CREATE TEMPORARY TABLE a (b int) ON COMMIT DROP')
        expect(result2, 'Result for CREATE').toEqual({
          command: 'CREATE',
          rowCount: 0,
          fields: [],
          rows: [],
        })

        const result3 = await connection.query('SELECT pg_current_xact_id_if_assigned()')
        expect(result3.rows[0]?.[0], 'No transaction ID').toBeDefined()

        pool.release(connection)

        const connection2 = await pool.acquire()
        expect(connection2).toStrictlyEqual(connection)

        const result4 = await connection.query('SELECT pg_current_xact_id_if_assigned()')
        expect(result4.rows[0]?.[0], 'No rollback').not.toEqual(result3.rows[0]?.[0])

        pool.release(connection2)
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'connection_released', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'stopped' ],
        [ 'connection_destroyed', connection.id ],
      ])
    })
  })

  describe('connection borrowing', () => {
    it('should ignore a request if connection creation took longer than the acquisition timeout', async () => {
      let delay = 0
      const pool = new class extends ConnectionPool {
        protected _create(logger: Logger, params: string): Connection {
          return new class extends Connection {
            async connect(): Promise<Connection> {
              if (delay) await sleep(delay)
              return super.connect()
            }
          }(logger, params)
        }
      }(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 0,
        acquireTimeout: 0.01, // 10 ms
      })

      const events = captureEvents(pool)

      try {
        await pool.start()

        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })

        delay = 50
        const error = await pool.acquire().catch((error) => error)
        expect(error).toBeError('Timeout of 10 ms reached acquiring connection')

        // let the pool catch up with the fact the request timed out
        await sleep(100)

        // check that available connections are zeroed out... no idle!
        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 0,
          connecting: 0,
          total: 0,
        })
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', expect.toBeA('string') ],
        [ 'connection_destroyed', expect.toBeA('string') ],
        [ 'connection_created', expect.toBeA('string') ],
        [ 'connection_destroyed', expect.toBeA('string') ], // destroy in run loop
        [ 'stopped' ],
      ])
    })

    it('should ignore a request and recycle its connection if creation took longer than the acquisition timeout', async () => {
      let delay = 0
      const pool = new class extends ConnectionPool {
        protected _create(logger: Logger, params: string): Connection {
          return new class extends Connection {
            async connect(): Promise<Connection> {
              if (delay) await sleep(delay)
              return super.connect()
            }
          }(logger, params)
        }
      }(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 2,
        maximumIdleConnections: 1,
        acquireTimeout: 0.01, // 10 ms
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        expect(pool.stats).toEqual({
          available: 1,
          borrowed: 0,
          connecting: 0,
          total: 1,
        })

        // this will get the connection created on "start()"
        connection = await pool.acquire()

        expect(pool.stats).toEqual({
          available: 0,
          borrowed: 1,
          connecting: 0,
          total: 1,
        })

        delay = 50
        const error = await pool.acquire().catch((error) => error)
        expect(error).toBeError('Timeout of 10 ms reached acquiring connection')

        // let the pool catch up with the fact the request timed out
        await sleep(100)

        // the connection from the last "acquire()" is now available
        expect(pool.stats).toEqual({
          available: 1,
          borrowed: 1,
          connecting: 0,
          total: 2,
        })
      } finally {
        pool.stop()
      }

      void connection

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'connection_created', expect.toBeA('string') ],
        [ 'stopped' ],
        [ 'connection_destroyed', connection.id ], // destroy in run loop
        [ 'connection_destroyed', expect.toBeA('string') ],
      ])
    })

    it('should recycle a connection if validation took longer than the acquisition timeout', async () => {
      let delay = 0
      const pool = new class extends ConnectionPool {
        protected async _validate(conn: Connection): Promise<boolean> {
          if (delay) await sleep(delay)
          connection = conn
          return super._validate(conn)
        }
      }(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleConnections: 1,
        acquireTimeout: 0.01, // 10 ms
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        expect(pool.stats).toEqual({
          available: 1,
          borrowed: 0,
          connecting: 0,
          total: 1,
        })

        connection = (pool as any)._available[0]

        delay = 50
        const error = await pool.acquire().catch((error) => error)
        expect(error).toBeError('Timeout of 10 ms reached acquiring connection')

        // wait for the pool to catch up
        await sleep(150)
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', connection?.id ],
        [ 'connection_released', connection?.id ],
        [ 'stopped' ],
        [ 'connection_destroyed', connection?.id ],
      ])
    })

    it('should end the borrow loop if the pool is stopped while valiadting', async () => {
      let delay = 0
      const pool = new class extends ConnectionPool {
        protected async _validate(): Promise<boolean> {
          if (delay) await sleep(delay)
          return true
        }
      }(logger, {
        database: databaseName,
        minimumPoolSize: 1,
        maximumPoolSize: 1,
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        expect(pool.stats).toEqual({
          available: 1,
          borrowed: 0,
          connecting: 0,
          total: 1,
        })

        connection = (pool as any)._available[0]

        // set a delay, start acquiring the connection, sleep so that the
        // borrow loop starts, and then await for the error to be raised
        delay = 50
        const error = pool.acquire().catch((error) => error)
        await sleep(10)
        pool.stop()

        // this error is emitted by the run loop, which consumed the request
        expect(await error).toBeError(`Pool stopped while validatin connection ${connection?.id}`)

        // wait for the pool to catch up
        await sleep(150)
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', connection?.id ],
        [ 'stopped' ],
        [ 'connection_destroyed', connection?.id ],
      ])
    })

    it('should enforce a connection borrowing timeout', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        borrowTimeout: 0.01, // 10 ms
      })

      const events = captureEvents(pool)

      let connection: Connection | undefined = undefined
      try {
        await pool.start()

        connection = await pool.acquire()

        expect(connection.connected).toBeTrue()

        await sleep(20)

        expect(connection.connected).toBeFalse()
      } finally {
        pool.stop()
      }

      expect(events()).toEqual([
        [ 'started' ],
        [ 'connection_created', connection.id ],
        [ 'connection_acquired', connection.id ],
        [ 'connection_destroyed', connection.id ],
        [ 'stopped' ],
      ],
      )
    })
  })

  describe('validate and recycle', () => {
    class MockPool extends ConnectionPool {
      public async _validate(connection: Connection): Promise<boolean> {
        return super._validate(connection)
      }
      public _recycle(connection: Connection): Promise<boolean> {
        return super._recycle(connection)
      }
    }
    const pool = new MockPool(logger, { database: databaseName })

    it('should not validate a disconnected connection', async () => {
      const connection = new Connection(logger, { database: databaseName })
      try {
        await connection.connect()
        connection.destroy()
        expect(await pool._validate(connection)).toBeFalse()
      } finally {
        connection.destroy()
      }
    })

    it('should not validate a connection when validate on borrow is disabled', async () => {
      const validateOnBorrow = process.env.PGPOOLVALIDATEONBORROW

      const connection = new class extends Connection {
        query(text: string): Promise<ConnectionQueryResult> {
          throw new Error(`Should not issue SQL: ${text}`)
        }
      }(logger, { database: databaseName })

      try {
        process.env.PGPOOLVALIDATEONBORROW = 'false'
        const pool = new MockPool(logger, { database: databaseName })
        await connection.connect()
        expect(await pool._validate(connection)).toBeTrue() // still says it's valid
      } finally {
        restoreEnv('PGPOOLVALIDATEONBORROW', validateOnBorrow)
        connection.destroy()
      }
    })

    it('should not recycle a disconnected connection', async () => {
      const connection = new Connection(logger, { database: databaseName })
      await connection.connect()
      try {
        connection.destroy()
        expect(await pool._recycle(connection)).toBeFalse()
      } finally {
        connection.destroy()
      }
    })

    it('should not validate a connection throwing errors querying', async () => {
      const connection = new class extends Connection {
        async query(_text: string, _params?: any[] | undefined): Promise<ConnectionQueryResult> {
          throw new Error('This is intended')
        }
      }(logger, { database: databaseName })
      try {
        await connection.connect()
        expect(await pool._validate(connection)).toBeFalse()
      } finally {
        connection.destroy()
      }
    })

    it('should not recycle a connection throwing errors querying', async () => {
      const connection = new class extends Connection {
        async query(_text: string, _params?: any[] | undefined): Promise<ConnectionQueryResult> {
          throw new Error('This is intended')
        }
      }(logger, { database: databaseName })
      try {
        await connection.connect()
        expect(await pool._recycle(connection)).toBeFalse()
      } finally {
        connection.destroy()
      }
    })

    it('should handle a large number of connections', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 1,
        maximumPoolSize: 200,
        maximumIdleConnections: 200,
      })

      const connections: Connection[] = []

      try {
        await pool.start()
        for (let i = 0; i < 100; i ++) connections.push(await pool.acquire())
        for (const connection of connections) pool.release(connection)
      } finally {
        pool.stop()
      }

      let connected: number = 0
      let disconnected: number = 0
      for (const connection of connections) {
        if (connection.connected) connected ++
        else disconnected ++
      }

      expect({ connected, disconnected }).toEqual({ connected: 0, disconnected: 100 })
    })
  })

  describe('performance', () => {
    it('should acquire and release in series', async () => {
      if (process.env.CI === 'true') return skip()

      const logger: Logger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 1,
        maximumPoolSize: 1,
      })

      try {
        await pool.start()

        const now = Date.now()
        for (let i = 0; i < 1000; i ++) {
          const connection = await pool.acquire()
          pool.release(connection)
        }

        const time = Date.now() - now
        log(`Total time ${time} ms, (${time / 1000} ms per connection)`)
      } finally {
        pool.stop()
      }
    })
  })
})
