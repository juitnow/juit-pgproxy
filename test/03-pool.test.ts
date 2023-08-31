import { Connection } from '../src/connection'
import { ConnectionPool } from '../src/pool'
import { databaseName } from './00-setup.test'
import { TestLogger } from './logger'

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
    let id: string | undefined = undefined
    const calls: string[] = []

    const pool = new class extends ConnectionPool {
      protected _create(logger: Logger, options: string): Connection {
        const connection = new Connection(logger, options)
        id = connection.id

        const connect = connection.connect
        connection.connect = async (): Promise<Connection> => {
          calls.push(`connecting ${connection.id}`)
          await new Promise((resolve) => setTimeout(resolve, 20))
          const result = await connect.call(connection)
          calls.push(`connected ${connection.id}`)
          return result
        }

        const destroy = connection.destroy
        connection.destroy = (): void => {
          destroy.call(connection)
          calls.push(`destroyed ${connection.id}`)
        }

        calls.push(`created ${connection.id}`)
        return connection
      }
    }(logger, {
      database: databaseName,
    })

    try {
      let error: any = undefined
      pool.start().catch((e) => error = e)

      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(calls).toEqual([
        `created ${id}`,
        `connecting ${id}`,
      ])

      await pool.stop()

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toEqual([
        `created ${id}`,
        `connecting ${id}`,
        `destroyed ${id}`,
      ])

      expect(error).toBeError('Connection pool stopped')
    } finally {
      await pool.stop()
    }
  })

  it('should retry connecting when it connecting fails', async () => {
    let time = Date.now()
    let fail = 3
    const calls: [ string, number ][] = []

    const pool = new class extends ConnectionPool {
      protected _create(logger: Logger, options: string): Connection {
        const connection = new Connection(logger, options)

        const connect = connection.connect
        connection.connect = async (): Promise<Connection> => {
          if ((-- fail) > 0) {
            calls.push([ 'connect error', Date.now() - time ])
            time = Date.now()
            throw new Error('Test error')
          } else {
            calls.push([ 'connect success', Date.now() - time ])
            const result = await connect.call(connection)
            time = Date.now()

            return result
          }
        }

        return connection
      }
    }(logger, {
      database: databaseName,
      createRetryInterval: 0.1, // 100 ms,
    })

    try {
      await pool.start()

      expect(calls).toEqual([
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
      acquireTimeout: 0.01, // 10 ms
    })

    try {
      await pool.start()

      delay = 100
      const connection1 = await pool.acquire().catch((error) => error)
      const connection2 = await pool.acquire().catch((error) => error)

      expect(connection1).toBeInstanceOf(Connection) // already connected in start()
      expect(connection2).toBeError('Timeout of 10 ms reached acquiring connection')
    } finally {
      await pool.stop()
    }
  })

  it('should timeout when a connection can not be validated on time', async () => {
    let delay = 20

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

  it('should ignore a connection that can not be validated', async () => {
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
})
