import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

import LibPQ from '@juit/libpq'

import { Emitter } from './events'
import { Queue } from './queue'

import type { Logger } from './index'

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

/** Mappings to convert our options into LibPQ's own keys */
const optionKeys = {
  address: 'hostaddr',
  applicationName: 'application_name',
  connectTimeout: 'connect_timeout',
  database: 'dbname',
  gssLibrary: 'gsslib',
  host: 'host',
  keepalives: 'keepalives',
  keepalivesCount: 'keepalives_count',
  keepalivesIdle: 'keepalives_idle',
  keepalivesInterval: 'keepalives_interval',
  kerberosServiceName: 'krbsrvname',
  password: 'password',
  port: 'port',
  sslCertFile: 'sslcert',
  sslCompression: 'sslcompression',
  sslCrlFile: 'sslcrl',
  sslKeyFile: 'sslkey',
  sslMode: 'sslmode',
  sslRootCertFile: 'sslrootcert',
  user: 'user',
} as const satisfies Record<keyof ConnectionOptions, string>

/** Quote a parameter value for options */
function quoteParamValue(value: string): string {
  value = value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
  return `'${value}'`
}

/** The {@link FinalizationRegistry} ensuring LibPQ gets finalized */
const finalizer = new FinalizationRegistry<LibPQ>( /* coverage ignore next */ (pq) => {
  pq.finish()
})

/* ========================================================================== *
 * TYPES                                                                      *
 * ========================================================================== */

/**
 * Connection options
 *
 * See https://www.postgresql.org/docs/9.3/libpq-connect.html#LIBPQ-PARAMKEYWORDS
 */
export interface ConnectionOptions {
  /** The database name. */
  database?: string

  /** Name of host to connect to. */
  host?: string,

  /** IPv4 or IPv6 numeric IP address of host to connect to. */
  address?: string,

  /** Port number to connect to at the server host. */
  port?: number

  /** PostgreSQL user name to connect as. */
  user?: string

  /** Password to be used if the server demands password authentication. */
  password?: string

  /** Maximum wait for connection, in seconds. */
  connectTimeout?: number

  /** The `application_name` as it will appear in `pg_stat_activity`. */
  applicationName?: string

  /** Controls whether client-side TCP keepalives are used. */
  keepalives?: boolean

  /** The number of seconds of inactivity after which TCP should send a keepalive message to the server. */
  keepalivesIdle?: number

  /** The number of seconds after which a TCP keepalive message that is not acknowledged by the server should be retransmitted. */
  keepalivesInterval?: number

  /** The number of TCP keepalives that can be lost before the client's connection to the server is considered dead. */
  keepalivesCount?: number

  /**
   * This option determines whether or with what priority a secure SSL TCP/IP
   * connection will be negotiated with the server. There are six modes:
   * * `disable`: only try a non-SSL connection
   * * `allow`: first try a non-SSL connection; if that fails, try an SSL connection
   * * `prefer` _(default)_: first try an SSL connection; if that fails, try a non-SSL connection
   * * `require`: only try an SSL connection. If a root CA file is present, verify the certificate in the same way as if verify-ca was specified
   * * `verify-ca`: only try an SSL connection, and verify that the server certificate is issued by a trusted certificate authority (CA)
   * * `verify-full`: only try an SSL connection, verify that the server certificate is issued by a trusted CA and that the server host name matches that in the certificate
   */
  sslMode?:
  | 'disable'
  | 'allow'
  | 'prefer'
  | 'require'
  | 'verify-ca'
  | 'verify-full'

  /** If set to `true` (default), data sent over SSL connections will be compressed */
  sslCompression?: boolean

  /** The file name of the client SSL certificate */
  sslCertFile?: string

  /** The location for the secret key used for the client certificate. */
  sslKeyFile?: string

  /** The name of a file containing SSL certificate authority (CA) certificate(s). */
  sslRootCertFile?: string

  /** The file name of the SSL certificate revocation list (CRL). */
  sslCrlFile?: string

  /** Kerberos service name to use when authenticating with Kerberos 5 or GSSAPI. */
  kerberosServiceName?: string

  /** GSS library to use for GSSAPI authentication. Only used on Windows. */
  gssLibrary?: 'gssapi'
}

/** Describes the result of a PostgreSQL query */
export interface ConnectionQueryResult {
  /** Command executed (normally `SELECT`, or `INSERT`, ...) */
  command: string
  /** Number of rows affected by this query (e.g. added rows in `INSERT`) */
  rowCount: number
  /** Fields description with `name` (column name) and `oid` (type) */
  fields: [ name: string, oid: number ][]
  /** Result rows, as an array of unparsed `string` results from `libpq` */
  rows: (string | null)[][]
}

/** The type identifying  */
export type ConnectionQueryParams = (string | number | bigint | null)[]

/** Events generated by our {@link Connection} */
interface ConnectionEvents {
  error: (error: Error) => unknown
  connected: () => unknown
  destroyed: () => unknown
}

/* ========================================================================== *
 * CONNECTION OPTIONS                                                         *
 * ========================================================================== */

/** Convert our options into a string suitable for LibPQ */
export function convertOptions(options: ConnectionOptions): string {
  const params: string[] = []
  for (const [ option, value ] of Object.entries(options)) {
    if (value == null) continue

    const key = optionKeys[option as keyof ConnectionOptions]
    if (! key) continue

    const string =
      typeof value === 'boolean' ? value ? '1' : '0' :
      typeof value === 'number' ? value.toString() :
      typeof value === 'string' ? value :
      /* coverage ignore next */
      assert.fail(`Invalid type for option ${option}`)

    if (string.length === 0) continue

    params.push(`${key}=${quoteParamValue(string)}`)
  }
  return params.join(' ')
}

/* ========================================================================== *
 * CONNECTION                                                                 *
 * ========================================================================== */

/** Our *minimalistic* PostgreSQL connection wrapping `libpq`. */
export class Connection extends Emitter<ConnectionEvents> {
  /** The unique ID of this connection */
  public id: string

  /** Queue for serializing queries to the database */
  private readonly _queue: Queue = new Queue()
  /** Option string to use when calling `connect` */
  private readonly _options: string

  /** Current instance of `libpq` */
  private _pq: LibPQ
  /** A flag indicating that `destroy()` has been invoked... */
  private _destroyed: boolean = false

  /** Create a connection with the specified `LibPQ` parameters string */
  constructor(logger: Logger, params?: string)
  /** Create a connection with the specified configuration options */
  constructor(logger: Logger, options?: ConnectionOptions)
  /* Overloaded constructor */
  constructor(logger: Logger, options: string | ConnectionOptions = {}) {
    super(logger)

    this.id = randomUUID()
    this._logger = logger
    const params = typeof options === 'string' ? options : convertOptions(options)
    this._options = `fallback_application_name='pool:${this.id}' ${params}`

    this._pq = new LibPQ()
    finalizer.register(this, this._pq, this._pq)

    this.on('error', () => {
      finalizer.unregister(this._pq)
      this._pq.finish()
      this._destroyed = true
    })

    logger.debug(`Connection "${this.id}" created`)
  }

  /* ===== GETTERS ========================================================== */

  /** Check whether this {@link Connection} is connected or not */
  get connected(): boolean {
    return !! this._pq.connected
  }

  /** Check whether this {@link Connection} is destroyed or not */
  get destroyed(): boolean {
    return this._destroyed
  }

  /** Return the version of the server we're connected to */
  get serverVersion(): string {
    assert(this._pq.connected, 'Not connected')
    const version = this._pq.serverVersion()
    return `${Math.floor(version / 10000)}.${version % 10000}`
  }

  /* ===== PUBLIC =========================================================== */

  /** Connect this {@link Connection} (fails if connected already) */
  async connect(): Promise<Connection> {
    assert(! this._pq.connected, `Connection "${this.id}" already connected`)
    assert(! this._destroyed, `Connection "${this.id}" already destroyed`)

    this._logger.debug(`Connection "${this.id}" connecting`)

    /* Turn LibPQ's own `connect` function into a promise */
    const promise = new Promise<boolean>((resolve, reject) => {
      this._pq.connect(this._options, (error) => {
        /* On error, simply finish (regardless) and fail cleaning up the error */
        if (error) {
          return reject(new Error(error.message.trim() || 'Unknown connection error'))
        }

        /* Ensure that our connection is setup as non-blocking, fail otherwise */
        if (! this._pq.setNonBlocking(true)) {
          return reject(new Error(`Unable to set connection "${this.id}" as non-blocking`))
        }

        /* Done, return LibPQ's connected status */
        return resolve(this._pq.connected)
      })
    })

    /* Rewrap the promise into an async/await to fix error stack traces */
    try {
      const connected = await promise

      if (this._destroyed) throw new Error(`Connection "${this.id}" aborted`)
      if (! connected) throw new Error(`Connection "${this.id}" not connected`)

      this._logger.info(`Connection "${this.id}" connected (server version ${this.serverVersion})`)
      this._emit('connected')
      return this
    } catch (error: any) {
      if (error instanceof Error) Error.captureStackTrace(error)

      finalizer.unregister(this._pq)
      this._pq.finish()
      this._destroyed = true

      this._emit('error', error)
      throw error
    }
  }

  /** Destroy this {@link Connection} releasing all related resources */
  destroy(): void {
    if (this._destroyed) return

    finalizer.unregister(this._pq)
    this._pq.finish()
    this._destroyed = true

    this._emit('destroyed')
  }

  /** ===== QUERY INTERFACE ================================================= */

  /** Execute a (possibly parameterised) query with this {@link Connection} */
  async query(text: string, params?: ConnectionQueryParams): Promise<ConnectionQueryResult> {
    /* Enqueue a new query, and return a Promise to its result */
    const promise = this._queue.enqueue(() => {
      assert(this._pq.connected, `Connection "${this.id}" not connected`)

      /* Create a new "Query" handling all I/O and run it, wrapping the call
       * in an async/await to properly contextualize error stack traces */
      return new Query(this._pq, this._logger)
          .on('error', (error) => this._emit('error', error))
          .run(text, params)
    })

    try {
      return await promise
    } catch (error: any) {
      if (error instanceof Error) Error.captureStackTrace(error)
      throw error
    } finally {
      /* Forget the connection if the query terminated it */
      if (! this._pq.connected) this.destroy()
    }
  }

  /** Cancel (if possible) the currently running query */
  cancel(): void {
    assert(this._pq.connected, `Connection "${this.id}" not connected`)

    /* Remember, PQcancel creates a temporary connection to issue the cancel
     * so it doesn't affect the current query (must still be read in full!) */
    const cancel = this._pq.cancel()
    if (cancel === true) return

    /* coverage ignore next */
    throw new Error(cancel || 'Unknown error canceling')
  }
}

/* ========================================================================== *
 * QUERY INTERFACE                                                            *
 * ========================================================================== */

/** Internal implementation of a query, sending and awaiting a result */
class Query extends Emitter {
  constructor(private _pq: LibPQ, logger: Logger) {
    super(logger)
  }

  /** Run a query, sending it and flushing it, then reading results */
  run(text: string, params: ConnectionQueryParams = []): Promise<ConnectionQueryResult> {
    return new Promise<ConnectionQueryResult>((resolve, reject) => {
      /* Send the query to the server and check it was sent */
      const sent = params.length > 0 ?
        this._pq.sendQueryParams(text, params as any[]) :
        this._pq.sendQuery(text)

      if (! sent) throw this._fail('sendQuery', 'Unable to send query')

      /* Make sure the query is flushed all the way without errors */
      this._flushQuery((error) => {
        if (error) return reject(error)

        /* Prepare the callback to be executed when the connection is readable */
        const readableCallback = (): void => this._read(onResult)

        /* Prepare the callback to be executed when results are fully read */
        const onResult = (error?: Error): void => {
          /* Regardless on whether there was an error, stop reading... */
          this._pq.stopReader()
          this._pq.off('readable', readableCallback)

          /* If there was an error, simply reject our result */
          if (error) {
            this._pq.clear()
            return reject(error)
          }

          /* If successful, prepare the result and resolve */
          const result = this._createResult()
          this._pq.clear()
          resolve(result)
        }

        /* Start the reading loop, */
        this._pq.on('readable', readableCallback)
        this._pq.startReader()
      })
    })
  }

  /* === ERRORS ============================================================= */

  private _fail(syscall: string, message: string): Error {
    const text = (this._pq.errorMessage() || '').trim() || message
    const error = Object.assign(new Error(`${text} (${syscall})`), { syscall })
    this._pq.finish()

    this._emit('error', error)
    return error
  }

  /* === INTERNALS ========================================================== */

  private _error?: Error

  private _flushQuery(cb: (error?: Error) => void): void {
    const result = this._pq.flush()

    /* No errors, continue */
    if (result === 0) return cb() // 0 is "success"

    /* Error flushing the query */
    if (result === -1) cb(this._fail('flush', 'Unable to flush query'))

    /* Not flushed yet, wait and retry */
    this._pq.writable(/* coverage ignore next */ () => this._flushQuery(cb))
  }

  private _read(onResult: (error?: Error) => void): void {
    /* Read waiting data from the socket */
    if (! this._pq.consumeInput()) {
      return onResult(this._fail('consumeInput', 'Unable to consume input'))
    }

    /* Check if there is still outstanding data, if so, wait for it all to come in */
    if (this._pq.isBusy()) /* coverage ignore next */ return

    /* Load our result object */
    while (this._pq.getResult()) {
      /* Check the status of the result */
      const status = this._pq.resultStatus()
      switch (status) {
        case 'PGRES_FATAL_ERROR':
          this._error = new Error(`SQL Fatal Error: ${this._pq.resultErrorMessage().trim()}`)
          break

        case 'PGRES_TUPLES_OK':
        case 'PGRES_COMMAND_OK':
        case 'PGRES_EMPTY_QUERY':
          break

        default:
          return onResult(this._fail('resultStatus', `Unrecognized status ${status}`))
      }

      /* If reading multiple results, sometimes the following results might
       * cause a blocking read. in this scenario yield back off the reader
       * until libpq is readable */
      if (this._pq.isBusy()) /* coverage ignore next */ return
    }

    /* All done, invoke our callback for completion! */
    onResult(this._error)
  }

  /* === RESULT ============================================================= */

  /** Create a {@link ConnectionQueryResult} from the data currently held by `libpq` */
  private _createResult(): ConnectionQueryResult {
    const command = this._pq.cmdStatus().split(' ')[0]!
    const rowCount = parseInt(this._pq.cmdTuples() || '0')

    const nfields = this._pq.nfields()
    const ntuples = this._pq.ntuples()

    const fields: ConnectionQueryResult['fields'] = new Array(nfields)
    const rows: ConnectionQueryResult['rows'] = new Array(ntuples)

    /* Looad up all the fields (name & type) from the query results */
    for (let i = 0; i < nfields; i++) {
      fields[i] = [ this._pq.fname(i), this._pq.ftype(i) ]
    }

    /* Load up all the results, row-by-row, column-by-column */
    for (let i = 0; i < ntuples; i++) {
      const row: (string | null)[] = rows[i] = new Array(nfields)
      for (let j = 0; j < nfields; j++) {
        const value = this._pq.getvalue(i, j)
        row[j] = (value === '') && (this._pq.getisnull(i, j)) ? null : value
      }
    }

    /* All done */
    return { command, rowCount, fields, rows }
  }
}
