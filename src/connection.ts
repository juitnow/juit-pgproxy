import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

import LibPQ from 'libpq'

import { Queue } from './queue'

import type { Logger } from './logger'

/* ========================================================================== *
 * OPTIONS                                                                    *
 * ========================================================================== */

/** See https://www.postgresql.org/docs/9.3/libpq-connect.html#LIBPQ-PARAMKEYWORDS */
export interface ConnectionOptions {
  /** The database name. */
  dbname: string

  /** Name of host to connect to. */
  host?: string,

  /** Numeric IP address of host to connect to (IPv4 or IPv6). */
  hostaddr?: string,

  /** Port number to connect to at the server host. */
  port?: number

  /** PostgreSQL user name to connect as. */
  user?: string

  /** Password to be used if the server demands password authentication. */
  password?: string

  /** Maximum wait for connection, in seconds. */
  connect_timeout?: number

  /** Adds command-line options to send to the server at run-time. */
  options?: string

  /** Specifies a value for the `application_name` configuration parameter. */
  application_name?: string

  /** Specifies a fallback value for the `application_name` configuration parameter. */
  fallback_application_name?: string

  /** Controls whether client-side TCP keepalives are used. */
  keepalives?: boolean

  /** The number of seconds of inactivity after which TCP should send a keepalive message to the server. */
  keepalives_idle?: number

  /** The number of seconds after which a TCP keepalive message that is not acknowledged by the server should be retransmitted. */
  keepalives_interval?: number

  /** The number of TCP keepalives that can be lost before the client's connection to the server is considered dead. */
  keepalives_count?: number

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
  sslmode?:
  | 'disable'
  | 'allow'
  | 'prefer'
  | 'require'
  | 'verify-ca'
  | 'verify-full'

  /** If set to 1 (default), data sent over SSL connections will be compressed */
  sslcompression?: boolean

  /** The file name of the client SSL certificate */
  sslcert?: string

  /** The location for the secret key used for the client certificate. */
  sslkey?: string

  /** The name of a file containing SSL certificate authority (CA) certificate(s). */
  sslrootcert?: string

  /** The file name of the SSL certificate revocation list (CRL). */
  sslcrl?: string

  /** Kerberos service name to use when authenticating with Kerberos 5 or GSSAPI. */
  krbsrvname?: string

  /** GSS library to use for GSSAPI authentication. Only used on Windows. */
  gsslib?: 'gssapi'

  /* Service name to use for additional parameters. */
  service?: string

  // client_encoding -> always UTF8
}

const optionKeys = [
  'dbname', // always first!
  'application_name',
  'connect_timeout',
  'fallback_application_name',
  'gsslib',
  'host',
  'hostaddr',
  'keepalives',
  'keepalives_count',
  'keepalives_idle',
  'keepalives_interval',
  'krbsrvname',
  'options',
  'password',
  'port',
  'service',
  'sslcert',
  'sslcompression',
  'sslcrl',
  'sslkey',
  'sslmode',
  'sslrootcert',
  'user',
] as const

function quoteParamValue(value: string): string {
  value = value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
  return `'${value}'`
}

function convertOptions(options: ConnectionOptions): string {
  const params: string[] = []
  for (const key of optionKeys) {
    let value = options[key]
    if (value == null) continue
    if (typeof value === 'boolean') value = value ? '1' : '0'
    if (typeof value === 'number') value = value.toString()
    if (value.length === 0) continue
    params.push(`${key}=${quoteParamValue(value)}`)
  }
  return params.join(' ')
}

/* ========================================================================== *
 * RESULT                                                                     *
 * ========================================================================== */

/** Describes the result of a PostgreSQL query */
export interface Result {
  /** Command executed (normally `SELECT`, or `INSERT`, ...) */
  command: string
  /** Number of rows affected by this query (e.g. added rows in `INSERT`) */
  rowCount: number
  /** Fields description with `name` (column name) and `oid` (type) */
  fields: { name: string, oid: number }[]
  /** Result rows, as an array of unparsed `string` results from `libpq` */
  rows: (string | null)[][]
}

/* ========================================================================== *
 * CONNECTION                                                                 *
 * ========================================================================== */

/** Our *minimalistic* PostgreSQL connection wrapping `libpq`. */
export class Connection {
  /** The unique ID of this connection */
  public id: string

  /** Queue for serializing queries to the database */
  private _queue: Queue = new Queue()
  /** Option string to use when calling `connect` */
  private _options: string
  /** Our {@link Logger}  */
  private _logger: Logger
  /** Current instance of `libpq` */
  private _pq?: LibPQ

  /** Create a connection with the specified options */
  constructor(poolName: string, logger: Logger, options: ConnectionOptions) {
    this.id = `${poolName}:${randomUUID()}`
    this._options = convertOptions(options)
    this._logger = logger

    logger.debug(`Connection "${this.id}" created`, options)
  }

  /** Check whether this {@link Connection} is connected or not */
  get connected(): boolean {
    return !! this._pq
  }

  /** Return the version of the server we're connected to */
  get serverVersion(): string {
    assert(this._pq?.connected, 'Not connected')
    const version = this._pq.serverVersion()
    return `${Math.floor(version / 10000)}.${version % 10000}`
  }

  /** Connect this {@link Connection} (fails if connected already) */
  async connect(): Promise<Connection> {
    this._logger.debug(`Connection "${this.id}" connecting`)
    assert(! this._pq?.connected, 'Already connected')

    // Promisify LibPQ's own `connect` function
    const promise = new Promise<LibPQ>((resolve, reject) => {
      // Create a new `libpq` instance
      const pq = new LibPQ()

      // Asynchronously attempt to connect
      pq.connect(this._options, (error) => {
        // On error, simply finish (regardless) and fail cleaning up the error
        if (error) {
          this._logger.debug(`Unable to connect connection "${this.id}"`, error)

          pq.finish()
          const message = error.message.trim() || 'Unknown connection error'
          return reject(new Error(message))
        }

        // Ensure that our connection is setup as non-blocking, fail otherwise
        if (! pq.setNonBlocking(true)) {
          pq.finish()
          return reject(new Error('Unable to set connection as non-blocking'))
        }

        // Done!
        this._logger.debug(`Connection "${this.id}" connected`)
        return resolve(pq)
      })
    })

    // Rewrap the promise into an async/await to fix error stack traces
    try {
      this._pq = await promise
      return this
    } catch (error: any) {
      if (error instanceof Error) Error.captureStackTrace(error)
      throw error
    }
  }

  /** Disconnect this {@link Connection} (noop if not connected) */
  disconnect(): void {
    if (! this._pq) return

    const pq = this._pq
    this._pq = undefined
    pq.finish()

    this._logger.debug(`Connection "${this.id}" disconnected`)
  }

  /** Execute a (possibly parameterised) query with this {@link Connection} */
  async query(text: string, params?: any[]): Promise<Result> {
    // Enqueue a new query, and return a Promise to its result
    const promise = this._queue.enqueue(() => {
      assert(this._pq?.connected, 'Not connected')

      // Create a new "Query" handling all I/O and run it, wrapping the call
      // in an async/await to properly contextualize error stack traces
      return new Query(this._pq).run(text, params)
    })

    try {
      return await promise
    } catch (error: any) {
      if (error instanceof Error) Error.captureStackTrace(error)
      throw error
    } finally {
      // Forget the connection if the query terminated it
      if (! this._pq?.connected) this._pq = undefined
    }
  }

  /** Cancel (if possible) the currently running query */
  cancel(): void {
    assert(this._pq?.connected, 'Not connected')

    // Remember, PQcancel creates a temporary connection to issue the cancel
    // so it doesn't affect the current query (must still be read in full!)
    const cancel = this._pq?.cancel()
    if (cancel === true) return

    // coverage ignore next
    throw new Error(cancel || 'Unknown error canceling')
  }

  /** Validate this connection */
  async validate(): Promise<boolean> {
    if (! this.connected) return false
    // coverage ignore catch
    try {
      const result = await this.query('SELECT now()')
      return result.rowCount === 1
    } catch (error) {
      this._logger.error(`Error validating connection "${this.id}"`, error)
      return false
    }
  }
}

/* ========================================================================== *
 * QUERY                                                                      *
 * ========================================================================== */

/** Internal implementation of a query, sending and awaiting a result */
class Query {
  constructor(private _pq: LibPQ) {}

  /** Run a query, sending it and flushing it, then reading results */
  run(text: string, params: any[] = []): Promise<Result> {
    return new Promise<Result>((resolve, reject) => {
      // Send the query to the server and check it was sent
      const sent = params.length > 0 ?
        this._pq.sendQueryParams(text, params) :
        this._pq.sendQuery(text)

      if (! sent) throw this._fail('sendQuery', 'Unable to send query')

      // Make sure the query is flushed all the way without errors
      this._flushQuery((error) => {
        if (error) return reject(error)

        // Prepare the callback to be executed when the connection is readable
        const readableCallback = (): void => this._read(onResult)

        // Prepare the callback to be executed when results are fully read
        const onResult = (error?: Error): void => {
          // Regardless on whether there was an error, stop reading...
          this._pq.stopReader()
          this._pq.off('readable', readableCallback)

          // If there was an error, simply reject our result
          if (error) {
            this._pq.clear()
            return reject(error)
          }

          // If successful, prepare the result and resolve
          const result = this._createResult()
          this._pq.clear()
          resolve(result)
        }

        // Start the reading loop,
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
    return error
  }

  /* === INTERNALS ========================================================== */

  private _error?: Error

  private _flushQuery(cb: (error?: Error) => void): void {
    const result = this._pq.flush()

    // No errors, continue
    if (result === 0) return cb() // 0 is "success"

    // Error flushing the query
    if (result === -1) cb(this._fail('flush', 'Unable to flush query'))

    // Not flushed yet, wait and retry
    this._pq.writable(/* coverage ignore next */ () => this._flushQuery(cb))
  }

  private _read(onResult: (error?: Error) => void): void {
    // read waiting data from the socket
    if (! this._pq.consumeInput()) {
      return onResult(this._fail('consumeInput', 'Unable to consume input'))
    }

    // check if there is still outstanding data, if so, wait for it all to come in
    if (this._pq.isBusy()) /* coverage ignore next */ return

    // load our result object
    while (this._pq.getResult()) {
      // check the status of the result
      const status = this._pq.resultStatus()
      switch (status) {
        case 'PGRES_FATAL_ERROR':
          this._error = new Error(this._pq.resultErrorMessage().trim())
          break

        case 'PGRES_TUPLES_OK':
        case 'PGRES_COMMAND_OK':
        case 'PGRES_EMPTY_QUERY':
          break

        default:
          return onResult(this._fail('resultStatus', `Unrecognized status ${status}`))
      }

      // if reading multiple results, sometimes the following results might
      // cause a blocking read. in this scenario yield back off the reader
      // until libpq is readable
      if (this._pq.isBusy()) /* coverage ignore next */ return
    }

    // All done, invoke our callback for completion!
    onResult(this._error)
  }

  /* === RESULT ============================================================= */

  /** Create a {@link Result} from the data currently held by `libpq` */
  private _createResult(): Result {
    const command = this._pq.cmdStatus().split(' ')[0]!
    const rowCount = parseInt(this._pq.cmdTuples())

    const fields: Result['fields'] = []
    const rows: Result['rows'] = []

    const nfields = this._pq.nfields()
    const ntuples = this._pq.ntuples()

    // Looad up all the fields (name & type) from the query results
    for (let i = 0; i < nfields; i++) {
      fields.push({
        name: this._pq.fname(i),
        oid: this._pq.ftype(i),
      })
    }

    // Load up all the results, row-by-row, column-by-column
    for (let i = 0; i < ntuples; i++) {
      const row: (string | null)[] = []
      for (let j = 0; j < nfields; j++) {
        const value = this._pq.getvalue(i, j)
        row.push((value === '') && (this._pq.getisnull(i, j)) ? null : value)
      }
      rows.push(row)
    }

    // All done
    return { command, rowCount, fields, rows }
  }
}
