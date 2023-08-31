import { Connection } from '../src/connection'
import { ConnectionPool } from '../src/pool'
import { databaseName } from './00-setup.test'
import { TestLogger } from './logger'

import type { Result } from '../src/connection'
import type { Logger } from '../src/logger'

fdescribe('Connection Pool', () => {
  const logger = new TestLogger()

  function captureEvents(pool: ConnectionPool): [ string, ...any[] ][] {
    const events: [ string, ...any[] ][] = []
    pool.on('started', () => events.push([ 'started' ]))
    pool.on('stopped', () => events.push([ 'stopped' ]))
    pool.on('connection_created', (connection) => events.push([ 'connection_created', connection.id ]))
    pool.on('connection_destroyed', (connection) => events.push([ 'connection_destroyed', connection.id ]))
    pool.on('connection_acquired', (connection) => events.push([ 'connection_acquired', connection.id ]))
    pool.on('connection_released', (connection) => events.push([ 'connection_released', connection.id ]))
    return events
  }

  it('should create and start a pool with a single connections', async () => {
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

      // acquire _more_ connections
      const promise1 = pool.acquire()
      const promise2 = pool.acquire()
      const promise3 = pool.acquire()

      // release it back to the pool
      pool.release(connection)
      pool.release(await promise1)
      pool.release(await promise2)
      pool.release(await promise3)

      // let the connection be released before stopping below
      await new Promise((r) => setTimeout(r, 200))
    } finally {
      // should allow to be stopped twice
      await pool.stop()
      await pool.stop()
    }

    // let the `stopped` event handlers catch up and destroy connections...
    await new Promise((r) => setTimeout(r, 200))

    expect(events).toEqual([
      // before starting we acquire
      [ 'connection_created', id ],
      [ 'connection_acquired', id ],
      // start
      [ 'started' ],
      // release the connection used in start()
      [ 'connection_released', id ],
      // acquire and then release the connection
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

  it('should create and start a pool with multiple connections', async () => {
    const pool = new ConnectionPool(logger, {
      database: databaseName,
      minimumPoolSize: 2,
      maximumPoolSize: 4,
      maximumIdleClients: 3,
    })

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
      await new Promise((r) => setTimeout(r, 200))

      expect(pool.stats).toEqual({
        available: 2,
        borrowed: 0,
        connecting: 0,
        total: 2,
      })
    } finally {
      await pool.stop()
    }
  })

  it('should remove an available connection when destroyed', async () => {
    const pool = new ConnectionPool(logger, {
      database: databaseName,
      minimumPoolSize: 1,
      maximumPoolSize: 1,
    })

    try {
      await pool.start()

      // the first connection (used for testing) is given back to the pool
      // using the normal "release" method... it will take a bit (validation)
      // in order for it to be back in the available lis
      await new Promise((r) => setTimeout(r, 200))

      const connection = (pool as any)._available[0] as Connection
      expect(connection).toBeDefined()

      // check that the connection is in the available list, not borrowed
      expect((pool as any)._connections.has(connection)).toBeTrue()
      expect((pool as any)._borrowed.has(connection)).toBeFalse()
      expect((pool as any)._available.indexOf(connection)).toBeGreaterThanOrEqual(0)

      // destroy connection and let the handlers catch up
      connection.destroy()
      await new Promise((resolve) => setTimeout(resolve, 100))

      // not in the available, nor in the borrowed lists
      expect((pool as any)._connections.has(connection)).toBeFalse()
      expect((pool as any)._borrowed.has(connection)).toBeFalse()
      expect((pool as any)._available.indexOf(connection)).toStrictlyEqual(-1)
    } finally {
      await pool.stop()
    }
  })

  it('should remove a borrowed connection when destroyed', async () => {
    const pool = new ConnectionPool(logger, {
      database: databaseName,
      minimumPoolSize: 1,
      maximumPoolSize: 1,
    })

    try {
      await pool.start()

      const connection = await pool.acquire()

      expect((pool as any)._connections.has(connection)).toBeTrue()
      expect((pool as any)._borrowed.has(connection)).toBeTrue()
      expect((pool as any)._available.indexOf(connection)).toStrictlyEqual(-1)

      connection.destroy()

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect((pool as any)._connections.has(connection)).toBeFalse()
      expect((pool as any)._borrowed.has(connection)).toBeFalse()
      expect((pool as any)._available.indexOf(connection)).toStrictlyEqual(-1)
    } finally {
      await pool.stop()
    }
  })

  it('should destroy a connection when the pool is stopped while connecting', async () => {
    const ids: (string | undefined)[] = []
    const calls: string[] = []

    const pool = new class extends ConnectionPool {
      protected _create(logger: Logger, options: string): Connection {
        const connection = new class extends Connection {
          async connect(): Promise<Connection> {
            calls.push(`connecting ${connection.id}`)
            await new Promise((resolve) => setTimeout(resolve, 100))
            const result = await super.connect()
            calls.push(`connected ${connection.id}`)
            return result
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

      await new Promise((resolve) => setTimeout(resolve, 50))

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
      await pool.stop()
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
      createRetryInterval: 0.1, // 100 ms,
    })

    try {
      await pool.start()

      expect([ ...calls ]).toEqual([
        [ 'create error', expect.toBeLessThanOrEqual(10) ],
        [ 'create error', expect.toBeGreaterThanOrEqual(100) ],
        [ 'create success', expect.toBeGreaterThanOrEqual(100) ],
      ])
    } finally {
      await pool.stop()
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
      createRetryInterval: 0.1, // 100 ms,
    })

    try {
      await pool.start()

      expect([ ...calls ]).toEqual([
        [ 'connect error', expect.toBeLessThanOrEqual(10) ],
        [ 'connect error', expect.toBeGreaterThanOrEqual(100) ],
        [ 'connect success', expect.toBeGreaterThanOrEqual(100) ],
      ])
    } finally {
      await pool.stop()
    }
  })

  it('should timeout when a connection can not be established on time', async () => {
    let delay = 0

    const pool = new class extends ConnectionPool {
      protected _create(logger: Logger, options: string): Connection {
        const connection = new Connection(logger, options)

        const connect = connection.connect
        connection.connect = async (): Promise<Connection> => {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
          return connect.call(connection)
        }

        return connection
      }
    }(logger, {
      database: databaseName,
      acquireTimeout: 0.05, // 50 ms
    })

    try {
      await pool.start()

      delay = 100
      const connection1 = await pool.acquire().catch((error) => error)
      const connection2 = await pool.acquire().catch((error) => error)

      expect(connection1).toBeInstanceOf(Connection) // already connected in start()
      expect(connection2).toBeError('Timeout of 50 ms reached acquiring connection')
    } finally {
      await pool.stop()
    }
  })

  it('should timeout when a connection can not be validated on time', async () => {
    let delay = 0

    const pool = new class extends ConnectionPool {
      protected async _validate(connection: Connection): Promise<boolean> {
        void connection // treat this as valid
        await new Promise((resolve) => setTimeout(resolve, delay))
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

      await new Promise((resolve) => setTimeout(resolve, 200))
    } finally {
      await pool.stop()
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

      await new Promise((r) => setTimeout(r, 1000))

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
      await pool.stop()
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

      await new Promise((resolve) => setTimeout(resolve, 100))

      fail = connection1.id

      const connection2 = await pool.acquire()
      expect(connection2).not.toStrictlyEqual(connection1)
    } finally {
      await pool.stop()
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

      await new Promise((r) => setTimeout(r, 1000))

      const connection1 = await pool.acquire()
      close = true
      pool.release(connection1)

      const connection2 = await pool.acquire()
      expect(connection1).not.toStrictlyEqual(connection2)
    } finally {
      await pool.stop()
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

      await new Promise((resolve) => setTimeout(resolve, 100))

      const connection2 = await pool.acquire()
      expect(connection2).not.toStrictlyEqual(connection1)
    } finally {
      await pool.stop()
    }
  })

  it('should enforce a borrowing limit', async () => {
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

      await new Promise((r) => setTimeout(r, 200))

      expect(connection.connected).toBeFalse()
    } finally {
      await pool.stop()
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
      await pool.stop()
    }
  })

  it('should acquire and release in series', async () => {
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
      await pool.stop()
    }
  })
})
