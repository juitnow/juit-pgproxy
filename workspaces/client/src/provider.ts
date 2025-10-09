import { assert } from './assert'


/* ========================================================================== *
 * EXPORTED TYPES                                                             *
 * ========================================================================== */

/** Describes the result of a query from a {@link PGProvider} */
export interface PGProviderResult {
  /** The SQL command that generated this result (`SELECT`, `INSERT`, ...) */
  command: string
  /** Number of rows affected by this query (e.g. added rows in `INSERT`) */
  rowCount: number
  /** Fields description with `name` (column name) and `oid` (type) */
  fields: [ name: string, oid: number ][]
  /** Result rows, as an array of unparsed `string` results from `libpq` */
  rows: (string | null)[][]
}

export interface PGProviderConnection {
  query(text: string, params?: (string | null)[]): Promise<PGProviderResult>
}

export interface PGProviderConstructor<Connection extends PGProviderConnection = PGProviderConnection> {
  new (url: URL): PGProvider<Connection>
}

export interface PGProvider<Connection extends PGProviderConnection = PGProviderConnection> extends PGProviderConnection {
  /** The URL used to create this provider, devoid of any credentials */
  readonly url: Readonly<URL>

  acquire(): Promise<Connection>
  release(connection: Connection): Promise<void>
  destroy(): Promise<void>
}

/* ========================================================================== *
 * ABSTRACT PROVIDER IMPLEMENTATION                                           *
 * ========================================================================== */

/** Hide away URLs, without `#private` fields modifying our signatures */
const providerUrls = new WeakMap<AbstractPGProvider, URL>()

export abstract class AbstractPGProvider<Connection extends PGProviderConnection = PGProviderConnection>
implements PGProvider<Connection> {
  constructor(url: URL | string) {
    providerUrls.set(this, new URL(url)) // Defensive copy
  }

  get url(): Readonly<URL> {
    const url = providerUrls.get(this)
    assert(url, 'Internal error: missing provider URL')
    const sanitizedUrl = new URL(url)
    sanitizedUrl.username = ''
    sanitizedUrl.password = ''
    return sanitizedUrl
  }

  abstract acquire(): Promise<Connection>
  abstract release(connection: PGProviderConnection): Promise<void>

  async query(text: string, params: (string | null)[] = []): Promise<PGProviderResult> {
    const connection = await this.acquire()
    try {
      return await connection.query(text, params)
    } finally {
      await this.release(connection)
    }
  }

  async destroy(): Promise<void> {
    /* Nothing to do here... */
  }
}


/* ========================================================================== *
 * PROVIDERS REGISTRATION                                                     *
 * ========================================================================== */

/** All known providers, mapped by protocol */
const providers = new Map<string, PGProviderConstructor>()

/** Register a provider, associating it with the specified protocol */
export function registerProvider(
    protocol: string,
    constructor: PGProviderConstructor,
): void {
  protocol = `${protocol}:` // URL always has protocol with _colon_
  assert(! providers.has(protocol), `Connection provider for "${protocol}..." already registered`)
  providers.set(protocol, constructor)
  providers.set(protocol, constructor)
}

/** Create a new {@link PGProvider} instance for the specified URL */
export function createProvider(url: URL): PGProvider {
  const Provider = providers.get(url.protocol)
  assert(Provider, `No connection provider registered for "${url.protocol}..."`)
  return new Provider(url)
}
