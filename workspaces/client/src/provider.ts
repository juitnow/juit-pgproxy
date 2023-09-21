import { assert } from './assert'


/* ========================================================================== *
 * EXPORTED TYPES                                                             *
 * ========================================================================== */

/** Describes the result of a query from a {@link PGProvider} */
export interface PGConnectionResult {
  /** The SQL command that generated this result (`SELECT`, `INSERT`, ...) */
  command: string
  /** Number of rows affected by this query (e.g. added rows in `INSERT`) */
  rowCount: number
  /** Fields description with `name` (column name) and `oid` (type) */
  fields: [ name: string, oid: number ][]
  /** Result rows, as an array of unparsed `string` results from `libpq` */
  rows: (string | null)[][]
}

export interface PGConnection {
  query(text: string, params: (string | null)[]): Promise<PGConnectionResult>
}

export interface PGProviderConstructor<Connection extends PGConnection> {
  new (url: URL): PGProvider<Connection>
}

export interface PGProvider<Connection extends PGConnection> extends PGConnection {
  acquire(): Promise<Connection>
  release(connection: Connection): Promise<void>
  destroy(): Promise<void>
}

/* ========================================================================== *
 * ABSTRACT PROVIDER IMPLEMENTATION                                           *
 * ========================================================================== */

export abstract class AbstractPGProvider<Connection extends PGConnection>
implements PGProvider<Connection> {
  abstract acquire(): Promise<Connection>
  abstract release(connection: PGConnection): Promise<void>

  async query(text: string, params: string[]): Promise<PGConnectionResult> {
    const connection = await this.acquire()
    try {
      return await connection.query(text, params)
    } finally {
      await this.release(connection)
    }
  }

  async destroy(): Promise<void> {
    // nothing to do here...
  }
}

/* ========================================================================== *
 * PROVIDERS REGISTRATION                                                     *
 * ========================================================================== */

/** All known providers, mapped by protocol */
const providers = new Map<string, PGProviderConstructor<PGConnection>>()

/** Register a provider, associating it with the specified protocol */
export function registerProvider(
    protocol: string,
    constructor: PGProviderConstructor<PGConnection>,
): void {
  protocol = `${protocol}:` // URL always has protocol with _colon_
  assert(! providers.has(protocol), `Connection provider for "${protocol}..." already registered`)
  providers.set(protocol, constructor)
  providers.set(protocol, constructor)
}

/** Create a new {@link PGProvider} instance for the specified URL */
export function createProvider(url: URL): PGProvider<PGConnection> {
  const Provider = providers.get(url.protocol)
  assert(Provider, `No connection provider registered for "${url.protocol}..."`)
  return new Provider(url)
}
