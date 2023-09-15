import { userInfo } from 'node:os'

import { AbstractPGProvider, PGClient, assert, registerProvider } from '@juit/pgproxy-client'
import { ConnectionPool } from '@juit/pgproxy-pool'

import type { Connection, ConnectionPoolOptions, Logger } from '@juit/pgproxy-pool'

function setupPoolOption(
    url: URL,
    options: ConnectionPoolOptions,
    option:
    | 'minimumPoolSize'
    | 'maximumPoolSize'
    | 'maximumIdleConnections'
    | 'acquireTimeout'
    | 'borrowTimeout'
    | 'retryInterval',
): void {
  if (url.searchParams.has(option)) {
    options[option] = Number(url.searchParams.get(option))
  }
}

function setupPoolOptions(url: URL, options: ConnectionPoolOptions): void {
  setupPoolOption(url, options, 'minimumPoolSize')
  setupPoolOption(url, options, 'maximumPoolSize')
  setupPoolOption(url, options, 'maximumIdleConnections')
  setupPoolOption(url, options, 'acquireTimeout')
  setupPoolOption(url, options, 'borrowTimeout')
  setupPoolOption(url, options, 'retryInterval')
}

export class PSQLProvider extends AbstractPGProvider<Connection> {
  static logger: Logger | undefined

  private _options: ConnectionPoolOptions
  private _pool: Promise<ConnectionPool>


  constructor(url?: URL | string) {
    super()

    this._options = { database: userInfo().username }

    if (! url) {
      this._options.database = process.env.PGDATABASE || this._options.database
    } else {
      if (typeof url === 'string') url = new URL(url)
      assert(url.protocol === 'psql:', `Unsupported protocol "${url.protocol}"`)

      if (url.username) this._options.user = url.username
      if (url.password) this._options.password = url.password
      if (url.hostname) this._options.host = url.hostname
      if (url.port) this._options.port = Number(url.port)
      if (url.pathname !== '/') this._options.database = url.pathname.substring(1)

      setupPoolOptions(url, this._options)
    }

    /* coverage ignore next */
    const logger = PSQLProvider.logger || console
    this._pool = new ConnectionPool(logger, this._options).start()
  }

  async acquire(): Promise<Connection> {
    return await this._pool.then((pool) => pool.acquire())
  }

  async release(connection: Connection): Promise<void> {
    await this._pool.then((pool) => pool.release(connection))
  }

  async destroy(): Promise<void> {
    await this._pool.then((pool) => pool.stop())
  }
}

export class PSQLClient extends PGClient {
  constructor(url?: URL | string) {
    super(new PSQLProvider(url))
  }
}

registerProvider('psql', PSQLProvider)
