import { ConnectionPool } from '../src/pool'
import { databaseName } from './00-setup.test'
import { TestLogger } from './logger'

describe('Connection Pool', () => {
  const logger = new TestLogger()

  it('should pool a connection', async () => {
    const pool = await new ConnectionPool('test', logger, {
      dbname: databaseName,
      minConnections: 0,
      maxConnections: 1,
    }).start()

    try {
      const c1 = await pool.acquire()
      await pool.releaseAsync(c1)

      const c2 = await pool.acquire()
      await pool.releaseAsync(c2)

      expect(c1).toStrictlyEqual(c2)
    } finally {
      await pool.stop()
    }
  })

  it('should destroy a connection', async () => {
    const pool = await new ConnectionPool('test', logger, {
      dbname: databaseName,
      minConnections: 0,
      maxConnections: 1,
    }).start()

    try {
      const c1 = await pool.acquire()
      await pool.destroy(c1)

      const c2 = await pool.acquire()
      await pool.releaseAsync(c2)

      expect(c1).not.toStrictlyEqual(c2)
    } finally {
      await pool.stop()
    }
  })

  it('should destroy idle connection', async () => {
    const pool = await new ConnectionPool('test', logger, {
      dbname: databaseName,
      minConnections: 0,
      maxConnections: 10,
      evictionRunIntervalMillis: 500,
      numTestsPerEvictionRun: 100,
      idleTimeoutMillis: 10,
    }).start()

    try {
      expect(pool.stats).toInclude({
        size: 0,
        borrowed: 0,
        available: 0,
      })

      const promises = new Array(10).fill(null).map(() => pool.acquire())
      const connections = await Promise.all(promises)

      expect(pool.stats).toInclude({
        size: 10,
        borrowed: 10,
        available: 0,
      })

      for (const c of connections) await pool.releaseAsync(c)

      expect(pool.stats).toInclude({
        size: 10,
        borrowed: 0,
        available: 10,
      })

      for (const c of connections) expect(c.connected).toBeTrue()

      await new Promise((r) => setTimeout(r, 1000))

      expect(pool.stats).toInclude({
        size: 0, // should be all evicted!
        borrowed: 0,
        available: 0,
      })

      for (const c of connections) expect(c.connected).toBeFalse()
    } finally {
      await pool.stop()
    }
  })

  it('should destroy connections on termination', async () => {
    const pool = await new ConnectionPool('test', logger, {
      dbname: databaseName,
      minConnections: 1,
      maxConnections: 1,
    }).start()

    let connection
    try {
      connection = await pool.acquire()

      // if we don't release, then "terminate" will timeout
      await pool.releaseAsync(connection)

      // must be connected before "terminate"
      expect(connection.connected).toStrictlyEqual(true)

      // after everything has been released, gracefully terminate
      await pool.stop()

      // must be disconnected after "terminate"
      expect(connection.connected).toStrictlyEqual(false)
    } finally {
      if (connection?.connected) connection.disconnect()
    }
  })

  it('should not recycle a failed connection (1)', async () => {
    const pool = await new ConnectionPool('test', logger, {
      dbname: databaseName,
      minConnections: 0,
      maxConnections: 1,
    }).start()

    try {
      const c1 = await pool.acquire()
      c1.disconnect()
      await pool.releaseAsync(c1)

      // tested on release, pool size should be zero
      expect(pool.stats.size).toStrictlyEqual(0)

      const c2 = await pool.acquire()
      await pool.releaseAsync(c2)

      expect(c1).not.toStrictlyEqual(c2)
    } finally {
      await pool.stop()
    }
  })

  it('should not recycle a failed connection (2)', async () => {
    const pool = await new ConnectionPool('test', logger, {
      dbname: databaseName,
      minConnections: 0,
      maxConnections: 1,
    }).start()

    try {
      const c1 = await pool.acquire()

      // disconnect but mark as "connected" for tests
      c1.disconnect()
      Object.defineProperty(c1, 'connected', { value: true })

      await pool.releaseAsync(c1)

      // tested on release, pool size should be zero
      expect(pool.stats.size).toStrictlyEqual(0)

      const c2 = await pool.acquire()
      await pool.releaseAsync(c2)

      expect(c1).not.toStrictlyEqual(c2)
    } finally {
      await pool.stop()
    }
  })

  it('should not recycle a failed connection (3)', async () => {
    const pool = await new ConnectionPool('test', logger, {
      dbname: databaseName,
      minConnections: 0,
      maxConnections: 1,
    }).start()

    try {
      const c1 = await pool.acquire()
      await pool.releaseAsync(c1)

      c1.disconnect() // disconnect after release!
      expect(pool.stats.size).toStrictlyEqual(1)

      const c2 = await pool.acquire()
      await pool.releaseAsync(c2)

      expect(c1).not.toStrictlyEqual(c2)
    } finally {
      await pool.stop()
    }
  })

  it('should not acquire when the pool is not started', async () => {
    await expect(new ConnectionPool('test', logger, {
      dbname: databaseName,
      minConnections: 1,
      maxConnections: 1,
    }).acquire()).toBeRejectedWithError('Connection pool "test" not running')
  })

  it('should not start when initial connection fails', async () => {
    await expect(new ConnectionPool('test', logger, {
      dbname: 'not-a-database',
      minConnections: 1,
      maxConnections: 1,
    }).start()).toBeRejectedWithError(/"not-a-database"/)
  })
})
