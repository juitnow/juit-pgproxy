import { Connection } from '../src/connection'
import { ConnectionPool } from '../src/pool3'
import { databaseName } from './00-setup.test'
import { TestLogger } from './logger'

import type { ConnectionOptions } from '../src/connection'
import type { Logger } from '../src/logger'

describe('Connection Pool', () => {
  const logger = new TestLogger()

  it('should create and start a pool', async () => {
    const pool = new ConnectionPool('test1', logger, {
      database: databaseName,
      minimumPoolSize: 2,
      maximumPoolSize: 4,
      maximumIdleClients: 3,
    })

    try {
      expect(pool.stats).toEqual({
        available: 0,
        borrowed: 0,
        total: 0,
      })

      await pool.start()
      // should allow to be started twice
      await pool.start()

      // creation happens in a run loop, it might take time for all connections
      // to be fille up to the minimum pool size... wait a bit!
      await new Promise((r) => setTimeout(r, 200))

      expect(pool.stats).toEqual({
        available: 2,
        borrowed: 0,
        total: 2,
      })
    } finally {
      pool.stop()
    }
  })

  it('should remove an available connection when disconnected from outside', async () => {
    const pool = await new ConnectionPool('test2', logger, {
      database: databaseName,
      minimumPoolSize: 1,
      maximumPoolSize: 1,
    }).start()

    try {
      // the first connection (used for testing) is given back to the pool
      // using the normal "release" method... it will take a bit (validation)
      // in order for it to be back in the available lis
      await new Promise((r) => setTimeout(r, 200))

      const connection = (pool as any)._available[0] as Connection
      expect(connection).toBeDefined()

      // check that the connection is in the available list, not borrowed
      expect((pool as any)._borrowed.has(connection)).toBeFalse()
      expect((pool as any)._available.indexOf(connection)).toBeGreaterThanOrEqual(0)

      // disconnect and let the handlers catch up
      connection.disconnect()
      await new Promise((resolve) => setTimeout(resolve, 10))

      // not in the available, nor in the borrowed lists
      expect((pool as any)._borrowed.has(connection)).toBeFalse()
      expect((pool as any)._available.indexOf(connection)).toStrictlyEqual(-1)
    } finally {
      pool.stop()
    }
  })

  it('should remove a borrowed connection when disconnected', async () => {
    const pool = await new ConnectionPool('test', logger, {
      database: databaseName,
      minimumPoolSize: 1,
      maximumPoolSize: 1,
    }).start()

    try {
      const connection = await pool.acquire()

      expect((pool as any)._borrowed.has(connection)).toBeTrue()
      expect((pool as any)._available.indexOf(connection)).toStrictlyEqual(-1)

      connection.disconnect()

      await new Promise((resolve) => setTimeout(resolve, 5))

      expect((pool as any)._borrowed.has(connection)).toBeFalse()
      expect((pool as any)._available.indexOf(connection)).toStrictlyEqual(-1)
    } finally {
      pool.stop()
    }
  })

  it('should disconnect a connection when the pool is destroyed while connecting', async () => {
    const calls: string[] = []

    const pool = await new class extends ConnectionPool {
      protected _create(name: string, logger: Logger, options: ConnectionOptions): Connection {
        const connection = new Connection(name, logger, options)

        const connect = connection.connect
        connection.connect = async (): Promise<Connection> => {
          calls.push(`connecting ${connection.id}`)
          await new Promise((resolve) => setTimeout(resolve, 20))
          const result = await connect.call(connection)
          calls.push(`connected ${connection.id}`)
          return result
        }

        const disconnect = connection.disconnect
        connection.disconnect = (): void => {
          disconnect.call(connection)
          calls.push(`disconnected ${connection.id}`)
        }

        calls.push(`created ${connection.id}`)
        return connection
      }
    }('test', logger, {
      database: databaseName,
    })

    try {
      let error: any = undefined
      pool.start().catch((e) => error = e)

      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(calls).toEqual([ 'created', 'connecting' ])

      pool.stop()

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toEqual([ 'created', 'connecting', 'disconnected', 'connected', 'disconnected' ])

      expect(error).toBeError('Connection pool "test" destroyed')
    } finally {
      pool.stop()
    }
  })

  it('should retry connecting when it first fails', async () => {
    let time = Date.now()
    let fail = 3
    const calls: [ string, number ][] = []

    const pool = await new class extends ConnectionPool {
      protected _create(name: string, logger: Logger, options: ConnectionOptions): Connection {
        const connection = new Connection(name, logger, options)

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
    }('test', logger, {
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

      log(calls)
    } finally {
      pool.stop()
    }
  })


  it('should timeout when a connection can not be established on time', async () => {
    let delay = false

    const pool = await new class extends ConnectionPool {
      protected _create(name: string, logger: Logger, options: ConnectionOptions): Connection {
        const connection = new Connection(name, logger, options)

        const connect = connection.connect
        connection.connect = async (): Promise<Connection> => {
          const wait = delay ? 100 : 0
          delay = ! delay

          await new Promise((resolve) => setTimeout(resolve, wait))
          return connect.call(connection)
        }

        return connection
      }
    }('test', logger, {
      database: databaseName,
      acquireTimeout: 0.01, // 10 ms
    }).start()

    try {
      const connection1 = await pool.acquire().catch((error) => error)
      const connection2 = await pool.acquire().catch((error) => error)
      const connection3 = await pool.acquire().catch((error) => error)

      expect(connection1).toBeInstanceOf(Connection)
      expect(connection2).toBeError('Timeout of 10 ms reached acquiring connection')
      expect(connection3).toBeInstanceOf(Connection)
    } finally {
      pool.stop()
    }
  })

  it('should timeout when a connection can not be validated on time', async () => {
    let delay = false

    const pool = await new class extends ConnectionPool {
      protected async _validate(connection: Connection): Promise<boolean> {
        log.warn('VALIDATING', connection.id)
        void connection // treat this as valid
        const wait = delay ? 100 : 0
        delay = ! delay

        await new Promise((resolve) => setTimeout(resolve, wait))
        return true
      }
    }('test', logger, {
      database: databaseName,
      acquireTimeout: 0.01, // 10 ms
    }).start() // no delay, works!

    try {
      const connection1 = await pool.acquire().catch((error) => error) // delay, fails
      const connection2 = await pool.acquire().catch((error) => error) // no delay, works

      expect(connection1).toBeError('Timeout of 10 ms reached acquiring connection')
      expect(connection2).toBeInstanceOf(Connection)

      await new Promise((resolve) => setTimeout(resolve, 200))
    } finally {
      pool.stop()
    }
  })

  it('should ignore a connection that can not be validated', async () => {
    const pool = new ConnectionPool('test', logger, {
      database: databaseName,
      minimumPoolSize: 2,
      maximumPoolSize: 4,
      maximumIdleClients: 3,
    })

    try {
      await pool.start()

      await new Promise((r) => setTimeout(r, 1000))

      const [ connection1, connection2 ] = (pool as any)._available
      expect(connection1).toBeInstanceOf(Connection)
      expect(connection2).toBeInstanceOf(Connection)

      // disconnect the socket without triggering events
      ;(connection1 as any)._pq.finish()

      expect(connection1.connected).toBeTrue()
      expect(connection2.connected).toBeTrue()

      const connection = await pool.acquire()

      expect(connection).toStrictlyEqual(connection2)
    } finally {
      pool.stop()
    }
  })

  it('should enforce a borrowing limit', async () => {
    const pool = await new ConnectionPool('test', logger, {
      database: databaseName,
      minimumPoolSize: 0,
      maximumPoolSize: 1,
      borrowTimeout: 0.1, // 100 ms
    }).start()

    try {
      const connection = await pool.acquire()

      expect(connection.connected).toBeTrue()

      await new Promise((r) => setTimeout(r, 200))

      expect(connection.connected).toBeFalse()
    } finally {
      pool.stop()
    }
  })
})
