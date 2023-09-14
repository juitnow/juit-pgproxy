import { userInfo } from 'node:os'

import { AbstractPGProvider, PGClient, registerProvider } from '@juit/pgproxy-client'
import { ConnectionPool } from '@juit/pgproxy-pool'

import type { PGConnection } from '@juit/pgproxy-client'
import type { Connection, ConnectionPoolOptions } from '@juit/pgproxy-pool'

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

export class PGProviderPSQL extends AbstractPGProvider {
  private _pool: ConnectionPool

  constructor(url?: URL | string) {
    const options: ConnectionPoolOptions = { database: userInfo().username }

    if (! url) {
      options.database = process.env.PGDATABASE || options.database
    } else {
      if (typeof url === 'string') url = new URL(url)

      if (url.protocol !== 'psql:') throw new Error(`Unsupported protocol "${url.protocol}"`)

      if (url.username) options.user = url.username
      if (url.password) options.password = url.password
      if (url.hostname) options.host = url.hostname
      if (url.port) options.port = Number(url.port)
      if (url.pathname !== '/') options.database = url.pathname.substring(1)

      setupPoolOptions(url, options)
    }

    super()
    this._pool = new ConnectionPool(console, options)
  }

  async acquire(): Promise<PGConnection> {
    return await this._pool.acquire()
  }

  async release(connection: PGConnection): Promise<void> {
    this._pool.release(connection as Connection)
  }
}

export class PGClientPSQL extends PGClient {
  constructor(url?: URL | string) {
    super(new PGProviderPSQL(url))
  }
}

registerProvider('psql', PGProviderPSQL)
