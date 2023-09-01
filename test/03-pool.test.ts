import { Connection } from '../src/connection'
import { ConnectionPool } from '../src/pool'
import { databaseName } from './00-setup.test'
import { TestLogger } from './logger'

import type { Result } from '../src/connection'
import type { Logger } from '../src/logger'

fdescribe('Connection Pool', () => {
  const logger = new TestLogger()

  const sleep = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  function captureEvents(pool: ConnectionPool): () => [ string, ...any[] ][] {
    const events: [ string, ...any[] ][] = []
    pool.on('started', () => events.push([ 'started' ]))
    pool.on('stopped', () => events.push([ 'stopped' ]))
    pool.on('connection_created', (connection) => events.push([ 'connection_created', connection.id ]))
    pool.on('connection_destroyed', (connection) => events.push([ 'connection_destroyed', connection.id ]))
    pool.on('connection_aborted', (connection) => events.push([ 'connection_aborted', connection.id ]))
    pool.on('connection_acquired', (connection) => events.push([ 'connection_acquired', connection.id ]))
    pool.on('connection_released', (connection) => events.push([ 'connection_released', connection.id ]))
    return () => [ ...events ]
  }

  // TODO: DONE DO NOT TOUCH
  fdescribe('pool lifecycle', () => {
    it('should start a pool and stop it without keeping the initial connection', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleClients: 0,
      })

      const events = captureEvents(pool)

      try {
      // should allow to be started twice
        await pool.start()
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
        pool.stop()
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
        maximumIdleClients: 1,
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

      expect(events()).toEqual([])
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
        maximumIdleClients: 0,
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

    it('should start a pool with multiple connections', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 2,
        maximumPoolSize: 4,
        maximumIdleClients: 3,
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

  // TODO: DONE DO NOT TOUCH
  fdescribe('disconnections', () => {
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

  fdescribe('connection borrowing', () => {
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
        maximumIdleClients: 0,
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
        maximumIdleClients: 0,
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
  })

  // TODO: DONE DO NOT TOUCH
  fdescribe('connection recycling', () => {
    it('should not recycle a disconnected connection', async () => {
      const pool = new ConnectionPool(logger, {
        database: databaseName,
        minimumPoolSize: 0,
        maximumPoolSize: 1,
        maximumIdleClients: 0,
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
        maximumIdleClients: 0,
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
        maximumIdleClients: 1, // recycle happens *after* minimum levels check
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
        maximumIdleClients: 1, // recycle happens *after* minimum levels check
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

        await connection.query('BEGIN')
        await connection.query('CREATE TEMPORARY TABLE a (b int) ON COMMIT DROP')
        const result1 = await connection.query('SELECT pg_current_xact_id_if_assigned()')
        expect(result1.rows[0]?.[0], 'No transaction ID').toBeDefined()

        pool.release(connection)

        const connection2 = await pool.acquire()
        expect(connection2).toStrictlyEqual(connection)
        const result2 = await connection.query('SELECT pg_current_xact_id_if_assigned()')
        expect(result2.rows[0]?.[0], 'No rollback').not.toEqual(result1.rows[0]?.[0])

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

  it('should destroy a connection when the pool is stopped while connecting', async () => {
    const ids: (string | undefined)[] = []
    const calls: string[] = []

    const pool = new class extends ConnectionPool {
      protected _create(logger: Logger, options: string): Connection {
        const connection = new class extends Connection {
          async connect(): Promise<Connection> {
            throw new Error('This is expected')
          }

          destroy(): void {
            super.destroy()
            calls.push(`destroyed ${connection.id}`)
            // as soon as we destroy, restart the pool
            ;(pool as any)._started = true
          }
        }(logger, options)

        calls.push(`created ${connection.id}`)
        ids.push(connection.id)
        return connection
      }
    }(logger, {
      database: databaseName,
      minimumPoolSize: 1,
      maximumPoolSize: 1,
    })

    try {
      // this will be resolved
      const promise = pool.start().catch((error) => error)

      await sleep(50)

      expect([ ...calls ]).toEqual([
        `created ${ids[0]}`,
        `connecting ${ids[0]}`,
      ])

      // mark the pool as "unstarted" without actually stopping it
      ;(pool as any)._started = false

      const pool2 = await promise
      expect(pool2).toStrictlyEqual(pool)
      expect([ ...calls ]).toEqual([
        `created ${ids[0]}`,
        `connecting ${ids[0]}`,
        `connected ${ids[0]}`,
        `destroyed ${ids[0]}`,
        `created ${ids[1]}`,
        `connecting ${ids[1]}`,
        `connected ${ids[1]}`,
      ])
    } finally {
      (pool as any)._started = true
      pool.stop()
    }
  })

  it('should retry connecting when connection creation fails', async () => {
    let time = Date.now()
    let fail = 3
    const calls: [ string, number ][] = []

    const pool = new class extends ConnectionPool {
      protected _create(logger: Logger, options: string): Connection {
        if ((-- fail) > 0) {
          calls.push([ 'create error', Date.now() - time ])
          time = Date.now()
          throw new Error('Test error')
        } else {
          calls.push([ 'create success', Date.now() - time ])
          const connection = super._create(logger, options)
          time = Date.now()
          return connection
        }
      }
    }(logger, {
      database: databaseName,
      retryInterval: 0.1, // 100 ms,
    })

    try {
      await pool.start()

      expect([ ...calls ]).toEqual([
        [ 'create error', expect.toBeLessThanOrEqual(10) ],
        [ 'create error', expect.toBeGreaterThanOrEqual(95) ], // timing might be slightly off...
        [ 'create success', expect.toBeGreaterThanOrEqual(95) ],
      ])
    } finally {
      pool.stop()
    }
  })

  it('should retry connecting when connecting fails', async () => {
    let time = Date.now()
    let fail = 3
    const calls: [ string, number ][] = []

    const pool = new class extends ConnectionPool {
      protected _create(logger: Logger, options: string): Connection {
        return new class extends Connection {
          async connect(): Promise<Connection> {
            if ((-- fail) > 0) {
              calls.push([ 'connect error', Date.now() - time ])
              time = Date.now()
              throw new Error('Test error')
            } else {
              calls.push([ 'connect success', Date.now() - time ])
              const result = await super.connect()
              time = Date.now()
              return result
            }
          }
        }(logger, options)
      }
    }(logger, {
      database: databaseName,
      retryInterval: 0.1, // 100 ms,
    })

    try {
      await pool.start()

      expect([ ...calls ]).toEqual([
        [ 'connect error', expect.toBeLessThanOrEqual(10) ],
        [ 'connect error', expect.toBeGreaterThanOrEqual(100) ],
        [ 'connect success', expect.toBeGreaterThanOrEqual(100) ],
      ])
    } finally {
      pool.stop()
    }
  })

  it('should timeout when a connection can not be established on time', async () => {
    let delay = 0

    const pool = new class extends ConnectionPool {
      protected _create(logger: Logger, options: string): Connection {
        const connection = new Connection(logger, options)

        const connect = connection.connect
        connection.connect = async (): Promise<Connection> => {
          if (delay) await sleep(delay)
          return connect.call(connection)
        }

        return connection
      }
    }(logger, {
      database: databaseName,
      acquireTimeout: 0.05, // 50 ms
    })

    const events = captureEvents(pool)

    try {
      await pool.start()

      delay = 100
      const connection1 = await pool.acquire().catch((error) => error)
      const connection2 = await pool.acquire().catch((error) => error)

      expect(connection1).toBeInstanceOf(Connection) // already connected in start()
      expect(connection2).toBeError('Timeout of 50 ms reached acquiring connection')

      // the *request* to connect is still pending here (the connect method is
      // called by the pool, but as it's async, will get executed eventually.
      // if we don't wait for the pool to catch up, and log the creation error
      // (connection is already destroyed) our logger, piping to the build
      // will raise an uhandled exception and the process will fail... darn!
      await sleep(200)
    } finally {
      pool.stop()
    }

    expect(events()).toEqual([
      [ 'started' ],
      [ 'connection_created', expect.toBeA('string') ],
      [ 'connection_acquired', expect.toBeA('string') ],
      [ 'connection_created', expect.toBeA('string') ],
      [ 'stopped' ],
      [ 'connection_destroyed', expect.toBeA('string') ],
      [ 'connection_destroyed', expect.toBeA('string') ],
    ])
  })

  it('should timeout when a connection can not be validated on time', async () => {
    let delay = 0

    const pool = new class extends ConnectionPool {
      protected async _validate(connection: Connection): Promise<boolean> {
        void connection // treat this as valid
        await sleep(delay)
        return true
      }
    }(logger, {
      database: databaseName,
      acquireTimeout: 0.01, // 10 ms
    })

    try {
      await pool.start()

      delay = 100
      const connection = await pool.acquire().catch((error) => error) // delay, fails

      expect(connection).toBeError('Timeout of 10 ms reached acquiring connection')

      await sleep(200)
    } finally {
      pool.stop()
    }
  })

  it('should ignore a connection that can not be validated (disconnected remotely)', async () => {
    const pool = new ConnectionPool(logger, {
      database: databaseName,
      minimumPoolSize: 2,
      maximumPoolSize: 2,
    })

    try {
      await pool.start()

      await sleep(1000)

      const [ connection1, connection2 ] = (pool as any)._available
      expect(connection1).toBeInstanceOf(Connection)
      expect(connection2).toBeInstanceOf(Connection)

      // destroy libpq without triggering events
      ;(connection1 as any)._pq.finish()

      const connectionA = await pool.acquire()
      const connectionB = await pool.acquire()

      expect(connectionA).toStrictlyEqual(connection2)
      expect(connectionB).not.toStrictlyEqual(connection1)
      expect(connectionB).not.toStrictlyEqual(connection2)
    } finally {
      pool.stop()
    }
  })

  it('should ignore a connection that can not be validated (error thrown)', async () => {
    let fail: string | undefined = undefined
    const pool = new class extends ConnectionPool {
      protected _create(logger: Logger, options: string): Connection {
        return new class extends Connection {
          async query(text: string, params?: any[] | undefined): Promise<Result> {
            if (this.id === fail) throw new Error('Query failed for tests')
            return super.query(text, params)
          }
        }(logger, options)
      }
    }(logger, {
      database: databaseName,
      minimumPoolSize: 1,
      maximumPoolSize: 1,
    })

    try {
      await pool.start()

      const connection1 = await pool.acquire()
      pool.release(connection1)

      await sleep(100)

      fail = connection1.id

      const connection2 = await pool.acquire()
      expect(connection2).not.toStrictlyEqual(connection1)
    } finally {
      pool.stop()
    }
  })

  it('should ignore a connection that can not be recycled (disconnected remotely)', async () => {
    let close = false

    const pool = new class extends ConnectionPool {
      protected _recycle(connection: Connection): Promise<boolean> {
        if (close) (connection as any)._pq.finish()
        return super._recycle(connection)
      }
    }(logger, {
      database: databaseName,
      minimumPoolSize: 1,
      maximumPoolSize: 1,
    })

    try {
      await pool.start()

      await sleep(1000)

      const connection1 = await pool.acquire()
      close = true
      pool.release(connection1)

      const connection2 = await pool.acquire()
      expect(connection1).not.toStrictlyEqual(connection2)
    } finally {
      pool.stop()
    }
  })

  it('should ignore a connection that can not be recycled (error thrown)', async () => {
    let fail: string | undefined = undefined
    const pool = new class extends ConnectionPool {
      protected _create(logger: Logger, options: string): Connection {
        return new class extends Connection {
          async query(text: string, params?: any[] | undefined): Promise<Result> {
            if (this.id === fail) throw new Error('Query failed for tests')
            return super.query(text, params)
          }
        }(logger, options)
      }
    }(logger, {
      database: databaseName,
      minimumPoolSize: 1,
      maximumPoolSize: 1,
    })

    try {
      await pool.start()

      const connection1 = await pool.acquire()
      fail = connection1.id
      pool.release(connection1)

      await sleep(100)

      const connection2 = await pool.acquire()
      expect(connection2).not.toStrictlyEqual(connection1)
    } finally {
      pool.stop()
    }
  })

  it('should enforce a client borrowing limit', async () => {
    const pool = new ConnectionPool(logger, {
      database: databaseName,
      minimumPoolSize: 0,
      maximumPoolSize: 1,
      borrowTimeout: 0.1, // 100 ms
    })

    try {
      await pool.start()

      const connection = await pool.acquire()

      expect(connection.connected).toBeTrue()

      await sleep(200)

      expect(connection.connected).toBeFalse()
    } finally {
      pool.stop()
    }
  })

  it('should enforce a maximum idle clients limit', async () => {
    const pool = new ConnectionPool(logger, {
      database: databaseName,
      minimumPoolSize: 0,
      maximumPoolSize: 1,
      maximumIdleClients: 0,
    })

    try {
      await pool.start()

      const connection = await pool.acquire()
      pool.release(connection)

      await sleep(200)

      expect(connection.connected).toBeFalse()
    } finally {
      pool.stop()
    }
  })


  it('should roll back transactions on release', async () => {
    const pool = new ConnectionPool(logger, {
      database: databaseName,
      minimumPoolSize: 0,
      maximumPoolSize: 1,
    })

    try {
      await pool.start()

      const connection1 = await pool.acquire()

      await connection1.query('BEGIN')
      await connection1.query('CREATE TEMPORARY TABLE a (b int) ON COMMIT DROP')
      const result1 = await connection1.query('SELECT pg_current_xact_id_if_assigned()')
      expect(result1.rows[0]?.[0], 'No transaction ID').toBeDefined()

      pool.release(connection1)

      const connection2 = await pool.acquire()
      expect(connection2, 'Not the same connection').toStrictlyEqual(connection1)
      const result2 = await connection1.query('SELECT pg_current_xact_id_if_assigned()')
      expect(result2.rows[0]?.[0], 'No rollback').not.toEqual(result1.rows[0]?.[0])

      pool.release(connection2)
    } finally {
      pool.stop()
    }
  })

  fit('should acquire and release in series', async () => {
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
      log(`Total time ${time} ms, (${time / 1000} ms per connection}`)
    } finally {
      pool.stop()
    }
  })
})
