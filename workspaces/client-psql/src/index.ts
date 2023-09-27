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
  private _pool: ConnectionPool

  constructor(url?: URL | string) {
    super()

    if (! url) {
      this._pool = new ConnectionPool(PSQLClient.logger)
    } else {
      if (typeof url === 'string') url = new URL(url)
      assert(url.protocol === 'psql:', `Unsupported protocol "${url.protocol}"`)

      const options: ConnectionPoolOptions = {}
      if (url.username) options.user = url.username
      if (url.password) options.password = url.password
      if (url.hostname) options.host = url.hostname
      if (url.port) options.port = Number(url.port)
      if (url.pathname !== '/') options.database = url.pathname.substring(1)

      setupPoolOptions(url, options)
      this._pool = new ConnectionPool(PSQLClient.logger, options)
    }
  }

  async acquire(): Promise<Connection> {
    if (! this._pool.running) await this._pool.start()
    return this._pool.acquire()
  }

  async release(connection: Connection): Promise<void> {
    await this._pool.release(connection)
  }

  async destroy(): Promise<void> {
    await this._pool.stop()
  }
}

export class PSQLClient extends PGClient {
  constructor(url?: URL | string) {
    super(new PSQLProvider(url))
  }

  /* coverage ignore next */
  static logger: Logger = {
    debug: () => void 0,
    info: () => void 0,
    warn: () => void 0,
    error: () => void 0,
  }
}

registerProvider('psql', PSQLProvider)
