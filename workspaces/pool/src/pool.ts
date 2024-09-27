import assert from 'node:assert'

import { Connection, convertOptions } from './connection'
import { Emitter } from './events'

import type { ConnectionOptions } from './connection'
import type { Logger } from './index'

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

/** Parse a number from an environment variable, or return the default */
function parseEnvNumber(variable: string, defaultValue: number): number {
  const string = process.env[variable]
  if (string == null) return defaultValue
  const value = parseFloat(string)
  if (isNaN(value)) throw new Error(`Invalid value "${string}" for environment variable "${variable}"`)
  return value
}

/** Parse a boolean from an environment variable, or return the default */
function parseEnvBoolean(variable: string, defaultValue: boolean): boolean {
  const string = process.env[variable]
  if (string == null) return defaultValue
  const value = string.toLowerCase()
  if (value === 'false') return false
  if (value === 'true') return true
  throw new Error(`Invalid value "${string}" for environment variable "${variable}"`)
}

/** A deferred/unwrapped {@link Promise} handling connection requests */
class ConnectionRequest {
  private _resolve!: (connection: Connection) => void
  private _reject!: (error: Error) => void
  private _promise: Promise<Connection>
  private _timeout: NodeJS.Timeout
  private _pending: boolean = true

  /**
   * Create a new {@link ConnectionRequest} with a timeout, after which the
   * request will be automatically rejected.
   */
  constructor(timeout: number) {
    this._promise = new Promise((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })

    this._timeout = setTimeout(() => {
      this.reject(new Error(`Timeout of ${timeout} ms reached acquiring connection`))
    }, timeout).unref()
  }

  /** Return the {@link Promise} to the {@link Connection} */
  get promise(): Promise<Connection> {
    return this._promise
  }

  /** Determine whether this request is still pending or not */
  get pending(): boolean {
    return this._pending
  }

  /** Resolve this instance's {@link Promise} with a {@link Connection} */
  resolve(connection: Connection): void {
    clearTimeout(this._timeout)
    if (this._pending) this._resolve(connection)
    this._pending = false
  }

  /** Reject this instance's {@link Promise} with an {@link Error} */
  reject(error: Error): void {
    clearTimeout(this._timeout)
    if (this._pending) this._reject(error)
    this._pending = false
  }
}

/* ========================================================================== *
 * TYPES                                                                      *
 * ========================================================================== */

/** Configuration for our {@link ConnectionPool}. */
export interface ConnectionPoolConfig {
  /**
   * The minimum number of connections to keep in the pool
   *
   * * _default_: `0`
   * * _environment varaible_: `PGPOOLMINSIZE`
   */
  minimumPoolSize?: number
  /**
   * The maximum number of connections to keep in the pool
   *
   * * _default_: `20` more than `minimumPoolSize`
   * * _environment varaible_: `PGPOOLMAXSIZE`
   */
  maximumPoolSize?: number
  /**
   * The maximum number of idle connections that can be sitting in the pool.
   *
   * * _default_: the average between `minimumPoolSize` and `maximumPoolSize`
   * * _environment varaible_: `PGPOOLIDLECONN`
   */
  maximumIdleConnections?: number
  /**
   * The number of seconds after which an `acquire()` call will fail
   *
   * * _default_: `30` sec.
   * * _environment varaible_: `PGPOOLACQUIRETIMEOUT`
   */
  acquireTimeout?: number
  /**
   * The maximum number of seconds a connection can be borrowed for
   *
   * * _default_: `120` sec.
   * * _environment varaible_: `PGPOOLBORROWTIMEOUT`
   */
  borrowTimeout?: number
  /**
   * The number of seconds to wait after the creation of a connection failed
   *
   * * _default_: `5` sec.
   * * _environment varaible_: `PGPOOLRETRYINTERVAL`
   */
  retryInterval?: number
  /**
   * Whether to validate connections on borrow or not
   *
   * * _default_: `true`.
   * * _environment varaible_: `PGPOOLVALIDATEONBORROW`
   */
  validateOnBorrow?: boolean
}

/** Constructor options for our {@link ConnectionPool} */
export interface ConnectionPoolOptions extends ConnectionPoolConfig, ConnectionOptions {
  /* Nothing else */
}

/** Statistical informations about a {@link ConnectionPool} */
export interface ConnectionPoolStats {
  /** The number of {@link Connection}s currently available in the pool */
  available: number,
  /** The number of {@link Connection}s currently borrowed out by the pool */
  borrowed: number,
  /** The number of {@link Connection}s currently connecting */
  connecting: number,
  /** The total number of {@link Connection}s managed by the pool */
  total: number,
}

/** Connection callback for events */
type ConnectionEvictor = (forced?: true) => unknown

/** Events generated by our {@link ConnectionPool} */
interface ConnectionPoolEvents {
  started: () => unknown,
  stopped: () => unknown,
  error: (error: any) => unknown,

  /** Emitted after the connection has been created, connected and adopted */
  connection_created: (connection: Connection) => unknown,
  /** Emitted after the connection has been evicted and destroyed */
  connection_destroyed: (connection: Connection) => unknown,
  /** Emitted when a created connection can not be connected */
  connection_aborted: (connection: Connection) => unknown,
  /** Emitted when a connection has been acquired */
  connection_acquired: (connection: Connection) => unknown,
  /** Emitted when a connection has been released */
  connection_released: (connection: Connection) => unknown,
}

/* ========================================================================== *
 * CONNECTION POOL                                                            *
 * ========================================================================== */

export class ConnectionPool extends Emitter<ConnectionPoolEvents> {
  /** Borrowed connections mapped to their borrow timeout */
  private readonly _borrowed = new Map<Connection, NodeJS.Timeout>()
  /** Array of all _available_ connections (that is, not borrowed out) */
  private readonly _available: Connection[] = []
  /** Array of all pending {@link ConnectionRequest}s */
  private readonly _pending: ConnectionRequest[] = []
  /** All connections mapped to their evictor callback handler */
  private readonly _connections = new Map<Connection, ConnectionEvictor>()
  /** A {@link WeakMap} of connections already evicted by this pool */
  private readonly _evicted = new WeakSet<Connection>()

  /** The minimum number of connections to keep in the pool */
  private readonly _minimumPoolSize: number
  /** The maximum number of connections to keep in the pool */
  private readonly _maximumPoolSize: number
  /** The maximum number of idle connections that can be sitting in the pool */
  private readonly _maximumIdleConnections: number
  /** The number of *milliseconds* after which an `acquire()` call will fail */
  private readonly _acquireTimeoutMs: number
  /** The maximum number of *milliseconds* a connection can be borrowed for */
  private readonly _borrowTimeoutMs: number
  /** The number of *milliseconds* to wait after the creation of a connection failed */
  private readonly _retryIntervalMs: number
  /** Whether to validate connections on borrow or not */
  private readonly _validateOnBorrow: boolean
  /** The {@link ConnectionOptions} converted into a string for `LibPQ` */
  private readonly _connectionOptions: string

  /** Indicator on whether this {@link ConnectionPool} was started or not */
  private _started: boolean = false
  /** Indicator on whether this {@link ConnectionPool} is starting or not */
  private _starting: boolean = false

  /** Create a new {@link ConnectionPool} */
  constructor(logger: Logger, options?: ConnectionPoolOptions)
  constructor(logger: Logger, options: ConnectionPoolOptions = {}) {
    super(logger)

    const {
      minimumPoolSize = parseEnvNumber('PGPOOLMINSIZE', 0),
      maximumPoolSize = parseEnvNumber('PGPOOLMAXSIZE', minimumPoolSize + 20),
      maximumIdleConnections = parseEnvNumber('PGPOOLIDLECONN', (maximumPoolSize + minimumPoolSize) / 2),
      acquireTimeout = parseEnvNumber('PGPOOLACQUIRETIMEOUT', 30),
      borrowTimeout = parseEnvNumber('PGPOOLBORROWTIMEOUT', 120),
      retryInterval = parseEnvNumber('PGPOOLRETRYINTERVAL', 5),
      validateOnBorrow = parseEnvBoolean('PGPOOLVALIDATEONBORROW', true),
      ...connectionOptions
    } = options

    this._minimumPoolSize = Math.round(minimumPoolSize)
    this._maximumPoolSize = Math.round(maximumPoolSize)
    this._maximumIdleConnections = Math.ceil(maximumIdleConnections)
    this._acquireTimeoutMs = Math.round(acquireTimeout * 1000)
    this._borrowTimeoutMs = Math.round(borrowTimeout * 1000)
    this._retryIntervalMs = Math.round(retryInterval * 1000)
    this._validateOnBorrow = validateOnBorrow

    assert(this._minimumPoolSize >= 0, `Invalid minimum pool size: ${this._minimumPoolSize}`)
    assert(this._maximumPoolSize >= 1, `Invalid maximum pool size: ${this._maximumPoolSize}`)
    assert(this._maximumIdleConnections >= 0, `Invalid maximum idle connections: ${this._maximumIdleConnections}`)
    assert(this._acquireTimeoutMs > 0, `Invalid acquire timeout: ${this._acquireTimeoutMs} ms`)
    assert(this._borrowTimeoutMs > 0, `Invalid borrow timeout: ${this._borrowTimeoutMs} ms`)
    assert(this._retryIntervalMs > 0, `Invalid retry interval: ${this._retryIntervalMs} ms`)

    assert(this._minimumPoolSize <= this._maximumPoolSize,
        `The minimum pool size ${this._minimumPoolSize} must less or equal to the maximum pool size ${this._maximumPoolSize}`)
    assert(this._minimumPoolSize <= this._maximumIdleConnections,
        `The minimum pool size ${this._minimumPoolSize} must less or equal to the maximum number of idle connections ${this._maximumIdleConnections}`)
    assert(this._maximumIdleConnections <= this._maximumPoolSize,
        `The maximum number of idle connections ${this._maximumIdleConnections} must less or equal to the maximum pool size ${this._maximumPoolSize}`)

    this._connectionOptions = convertOptions(connectionOptions)
    this._logger = logger
  }

  /** Statistical informations about a {@link ConnectionPool} */
  get stats(): ConnectionPoolStats {
    const available = this._available.length
    const borrowed = this._borrowed.size
    const total = this._connections.size
    const connecting = total - (available + borrowed)
    return { available, borrowed, connecting, total }
  }

  /** Returns a flag indicating whether this pool is running or not */
  get running(): boolean {
    return this._started || this._starting
  }

  /** Returns the running configuration of this instance */
  get configuration(): Required<ConnectionPoolConfig> {
    return {
      minimumPoolSize: this._minimumPoolSize,
      maximumPoolSize: this._maximumPoolSize,
      maximumIdleConnections: this._maximumIdleConnections,
      acquireTimeout: this._acquireTimeoutMs / 1000,
      borrowTimeout: this._borrowTimeoutMs / 1000,
      retryInterval: this._retryIntervalMs / 1000,
      validateOnBorrow: this._validateOnBorrow,
    }
  }

  /* ===== CONNECTION MANAGEMENT ============================================ */

  /* These methods are protected, as they can be overridden to provide more
   * specialized versions of connections */

  /** Create a connection */
  protected _create(logger: Logger, params: string): Connection {
    return new Connection(logger, params)
  }

  /** Validate a connection by issuing a super-simple statement */
  protected async _validate(connection: Connection): Promise<boolean> {
    if (! connection.connected) return false
    if (! this._validateOnBorrow) return true

    const start = process.hrtime.bigint()
    try {
      this._logger.debug(`Validating connection "${connection.id}"`)
      const result = await connection.query('SELECT now()')
      return result.rowCount === 1
    } catch (error: any) {
      this._logger.error(`Error validating connection "${connection.id}":`, error)
      return false
    } finally {
      const time = process.hrtime.bigint() - start
      const ms = Math.floor(Number(time) / 10000) / 100
      this._logger.debug(`Connection "${connection.id}" validated in ${ms} ms`)
    }
  }

  /** Recycle a connection rolling back any running transaction */
  protected async _recycle(connection: Connection): Promise<boolean> {
    if (! connection.connected) return false

    try {
      const result = await connection.query('SELECT pg_current_xact_id_if_assigned() IS NOT NULL')
      if (result.rows[0]?.[0] === 't') {
        this._logger.warn(`Rolling back transaction recycling connection "${connection.id}"`)
        await connection.query('ROLLBACK')
      }
      return true
    } catch (error: any) {
      this._logger.error(`Error recycling connection "${connection.id}":`, error)
      return false
    }
  }

  /* ===== CONNECTION / POOL INTERACTION ==================================== */

  /** Adopt a connection tying it to our events */
  private _adopt(connection: Connection): Connection {
    /* Dispose of the connection when the pool is stopped */
    const destroyer = (): void => {
      connection.off('destroyed', evictor)
      this._evict(connection)
    }
    this.once('stopped', destroyer)

    /* Evict the connection when the connection is destroyed */
    const evictor = (forced?: true): void => {
      this.off('stopped', destroyer)

      /* Here "force" is true when called from "_evict" below... in this case
         we only want to de-register the destroyer, without ending in a loop */
      if (forced) return

      this._evict(connection)
      this._runCreateLoop()
    }
    connection.once('destroyed', evictor)

    /* Remember this connection, always... */
    this._connections.set(connection, evictor)
    return connection
  }

  /** Destroy a connection, it will be wiped from this pool */
  private _evict(connection: Connection, aborted = false): void {
    const evictor = this._connections.get(connection)
    if (! evictor) {
      this._logger.warn(`Attempting to evict non adopted connection ${connection.id}`)
      return
    }

    /* Make sure we don't re-invoke ourselves */
    this._connections.delete(connection)
    connection.off('destroyed', evictor)

    /* Make sure that we deregister from the pool "stopped" event */
    evictor(true)

    /* coverage ignore catch */
    try {
      this._logger.debug(`Destroying connection "${connection.id}"`)

      /* Wipe an borrowing details if the connection is borrowed */
      clearTimeout(this._borrowed.get(connection))
      this._borrowed.delete(connection)

      /* Remove from the available pool, if found there */
      const index = this._available.indexOf(connection)
      if (index >= 0) this._available.splice(index)

      /* If we know this connection, force disconnection */
      connection.destroy()
      this._emit(aborted ? 'connection_aborted' : 'connection_destroyed', connection)
    } catch {
      this._logger.error(`Error destroying connection "${connection.id}"`)
    } finally {
      this._evicted.add(connection)
    }
  }

  /* ===== RUN LOOPS ======================================================== */

  /**
   * Run the create connection loop.
   *
   * This loop simply creates connections, connects them, sets up the various
   * event handler (on disconnect) and simply adds them to the available array.
   */
  private _runCreateLoop(): void {
    /* coverage ignore if */
    if (! this._started) return

    Promise.resolve().then(async () => {
      while (this._started) {
        /* Do we need to (or should we) create a new connection? We don't want
         * to run in a while loop, as if "connect" fails, we want to delay the
         * retrial of the amount specified in the pool construction options */
        const connections = this._connections.size
        const available = this._available.length
        const pending = this._pending.length

        if ((available && (connections >= this._minimumPoolSize)) || // enough available for minimum pool size
            ((! pending) && (available >= this._maximumIdleConnections)) || // enough maximum idle connections
            (connections >= this._maximumPoolSize)) { // never go over the number of maximum pool size
          break
        }

        /* ===== STEP 1: create a connection ================================== */

        let connection: Connection
        try {
          connection = this._create(this._logger, this._connectionOptions)
          this._adopt(connection)
        } catch (error) {
          const retry = `retrying in ${this._retryIntervalMs} ms`
          this._logger.error(`Error creating pooled connection, ${retry}:`, error)

          /* Run the create loop, again, but only our retry interval has elapsed */
          await new Promise((resolve) => setTimeout(resolve, this._retryIntervalMs))
          continue
        }

        /* ===== STEP 2: connect the connection =============================== */

        try {
          await connection.connect()
        } catch (error) {
          const retry = `retrying in ${this._retryIntervalMs} ms`
          this._logger.error(`Error connecting "${connection.id}", ${retry}:`, error)
          this._evict(connection, true)

          /* Run the create loop, again, but only our retry interval has elapsed */
          await new Promise((resolve) => setTimeout(resolve, this._retryIntervalMs))
          continue
        }

        /* coverage ignore else // The pool might have been stopped while, but
         * in this case, the `connect()` method above will throw saying that
         * the connection has been aborted and eviction will run in the `catch`
         * statement above... This `if` / `else` is here as a fail-safe... */
        if (this._started) this._available.push(connection)
        else this._evict(connection, true)

        /* Run our borrow loops and assign connnections to pending requests */
        this._runBorrowLoop()

        /* We have created a connection in this pool */
        this._emit('connection_created', connection)
      }
    }).catch(/* coverage ignore next */ (error) => {
      const retry = `retrying in ${this._retryIntervalMs} ms`
      this._logger.error(`Error in create loop, ${retry}:`, error)
      setTimeout(() => this._runCreateLoop(), this._retryIntervalMs)
    })
  }

  /**
   * Run the borrow connection loop.
   *
   * This loop looks at all the pending connection requests, and fullfills them
   * with a connection from the available array. If no connections are available
   * then it simply triggers the create loop.
   */
  private _runBorrowLoop(): void {
    /* coverage ignore if */
    if (! this._started) return

    Promise.resolve().then(async () =>{
      let request: ConnectionRequest | undefined
      while (this._started && (request = this._pending.splice(0, 1)[0])) {
        /* Check if a connection is available, if not, run the create loop */
        const connection = this._available.splice(0, 1)[0]
        if (! connection) {
          if (request.pending) this._pending.unshift(request)
          return this._runCreateLoop()
        }

        /* This request might not be pending, it might have timed out */
        if (! request.pending) {
          if (this._available.length >= this._maximumIdleConnections) {
            this._evict(connection)
          } else {
            this._available.push(connection)
          }
          continue
        }


        /* If a connection is available, it should be validated on borrow */
        const valid = await this._validate(connection)

        /* The pool might have been stopped while validating, simply return
         * and let the "stopped" event handler do its job */
        if (! this._started) {
          request.reject(new Error(`Pool stopped while validatin connection ${connection.id}`))
          return
        }

        /* The connection was not valid, disconnect it and try again */
        if (! valid) {
          /* Any pending request goes back at the beginning of the queue */
          if (request.pending) this._pending.unshift(request)
          this._evict(connection) // will trigger the "disconnected" event
          continue
        }

        /* While validating, the request might have been timed out */
        if (! request.pending) {
          /* If the request is not pending anymore, just release this
           * connection. This might trigger an extra validation/recycle,
           * but it's definitely better than throwing this away */
          this.release(connection)
          continue
        }

        /* The connection is valid, and the request is pending. Borrow out
         * this connection to fullfill the request, after setting up our
         * borrowing timeout */
        const timeout = setTimeout(() => {
          this._logger.error(`Connection "${connection.id}" borrowed for too long`)
          this._evict(connection)
        }, this._borrowTimeoutMs).unref()

        /* Remember this timeout in our borrow list */
        this._borrowed.set(connection, timeout)

        /* Lift-off! */
        this._emit('connection_acquired', connection)
        request.resolve(connection)
      }
    }).catch(/* coverage ignore next */ (error) => {
      const retry = `retrying in ${this._retryIntervalMs} ms`
      this._logger.error(`Error in borrow loop, ${retry}:`, error)
      setTimeout(() => this._runBorrowLoop(), this._retryIntervalMs)
    })
  }

  /* ===== CONNECTION LIFECYCLE ============================================= */

  /** Acquire a {@link Connection} from this {@link ConnectionPool} */
  acquire(): Promise<Connection> {
    /* Defer this promise when the connection pool is still starting */
    if (this._starting) {
      return new Promise<Connection>((resolve, reject) => {
        this.once('started', () => process.nextTick(() => this.acquire().then(resolve)))
        this.once('error', (error) => reject(error))
      })
    }
    assert(this._started, 'Connection pool not started')

    /* Add a new entry to our pending connection requests and run the loop */
    const deferred = new ConnectionRequest(this._acquireTimeoutMs)
    this._pending.push(deferred)
    this._runBorrowLoop()

    /* Return the deferred connection's promise */
    return deferred.promise
  }

  /** Release a {@link Connection} back to this {@link ConnectionPool} */
  release(connection: Connection): void {
    /* Check if this pool has once held the connection */
    if (this._evicted.has(connection)) return

    /* Ensure this is _our_ connection */
    assert(this._connections.has(connection), `Connection "${connection.id}" not owned by this pool`)

    Promise.resolve().then(async () => {
      this._logger.debug(`Releasing connection "${connection.id}"`)

      /* Clear up any borrow timeout, and remove from borrowed */
      clearTimeout(this._borrowed.get(connection))

      /* If the connection is not connected, discard it */
      if (! connection.connected) {
        this._logger.info(`Disconnected connection "${connection.id}" discarded`)
        this._evict(connection)

      /* If we have enough available connections, discard it */
      } else if (this._available.length >= this._maximumIdleConnections) {
        this._logger.info(`Extra connection "${connection.id}" discarded`)
        this._evict(connection)

      /* If the connection is not valid, discard it */
      } else if (! await this._recycle(connection)) {
        this._logger.info(`Non-validated connection "${connection.id}" discarded`)
        this._evict(connection)

      /* If the connection is valid, try to recycle it */
      } else {
        this._logger.debug(`Connection "${connection.id}" released`)
        this._borrowed.delete(connection) // delete from the borrow list
        this._available.push(connection) // add to the available list
        this._emit('connection_released', connection)
      }

    /* Any error might come from trying to validate/recycle the connection */
    }).catch((error) => {
      this._logger.error(`Error releasing connection "${connection.id}":`, error)
      this._evict(connection)

    /* Regardless of whatever happened, always run our borrow loop */
    }).finally(() => this._runBorrowLoop())
  }

  /* ===== POOL LIFECYCLE =================================================== */

  /** Start this {@link ConnectionPool} validating an initial connection */
  async start(): Promise<this> {
    if (this._started || this._starting) return this

    this._logger.debug('Starting connection pool')
    this._starting = true

    try {
      /* Create the initial connection */
      const connection = this._create(this._logger, this._connectionOptions)
      await connection.connect()

      /* Connect and alidate the initial connection */
      const valid = await this._validate(connection)
      assert(valid, `Unable to validate initial connection "${connection.id}"`)
      this._logger.debug(`Initial connection "${connection.id}" validated`)

      /* We have a valid connection: adopt it and mark ourselves as started,
       * before sending out events to our listeners */
      this._adopt(connection)
      this._started = true

      this._emit('started')
      this._emit('connection_created', connection)

      /* If we can keep idle connections, remember the initial one */
      if (this._maximumIdleConnections > 0) {
        this._available.push(connection)
      } else {
        this._evict(connection)
      }

      /* Run our create loop to create all needed (minimum) connections */
      this._runCreateLoop()
      return this
    } catch (error) {
      this._emit('error', error)
      throw error
    } finally {
      this._starting = false
    }
  }

  /** Stop this {@link ConnectionPool} and disconnect all connections. */
  stop(): void {
    if (! this._started) return
    this._started = false

    const connections = `${this._connections.size} connections`
    const requests = `${this._pending.length} pending requests`
    this._logger.info(`Stopping connection pool with ${connections} and ${requests}`)

    /* Reject any pending acquisition */
    for (const pending of this._pending) {
      pending.reject(new Error('Connection pool stopped'))
    }

    /* Clean up our internal lists */
    this._available.splice(0, Number.MAX_SAFE_INTEGER)
    this._borrowed.clear()

    /* Let the "stopped" event handler close up all connections. Note that this
     * is _synchronous_. We register an evictor on "stopped" which directly
     * invokes this pool's "_destroy()"... Errors will simply be logged */
    try {
      this._emit('stopped')
    } finally {
      this._connections.clear()
    }
  }
}
