import { randomUUID } from 'node:crypto'


import { PGOIDs, Registry } from '@juit/pgproxy-types'

import { restoreEnv } from '../../../support/utils'
import { AbstractPGProvider, PGClient, registerProvider, SQL } from '../src/index'

import type { PGProviderConnection, PGProviderResult } from '../src/index'

describe('Client', () => {
  const protocol = `test-${randomUUID()}`
  const url = new URL(`${protocol}://test-host:1234/test-path`)

  let result: PGProviderResult | undefined = undefined
  let calls: string[] = []

  class TestProvider extends AbstractPGProvider {
    private _disposeTimeout: number | undefined
    private _acquire = 0
    private _release = 0

    constructor(url: URL) {
      calls.push(`CONSTRUCT: ${url.href}`)
      super(url)

      // to test async disposal, if specified, we add a delay to `destroy()`
      this._disposeTimeout = parseInt(url.searchParams.get('disposeTimeout') || 'NaN') || undefined
    }

    query(text: string, params: (string | null)[] = []): Promise<PGProviderResult> {
      calls.push(`QUERY: ${text} [${params.join(',')}]`)
      if (! result) throw new Error('No result for query')
      return Promise.resolve(result)
    }

    acquire(): Promise<PGProviderConnection> {
      const id = ++ this._acquire
      calls.push(`ACQUIRE: ${id}`)

      const connection: PGProviderConnection = {
        query(text: string, params: (string | null)[] = []): Promise<PGProviderResult> {
          calls.push(`QUERY ${id}: ${text} [${params.join(',')}]`)

          // transaction commands are always successful
          if (params.length === 0) {
            switch (text) {
              case 'BEGIN':
              case 'COMMIT':
              case 'ROLLBACK':
                return Promise.resolve({
                  command: text,
                  rowCount: 0,
                  fields: [],
                  tuples: [],
                  rows: [],
                })
            }
          }

          if (! result) throw new Error('No result for query')
          return Promise.resolve(result)
        },
      }

      return Promise.resolve(connection)
    }

    release(connection: PGProviderConnection): Promise<void> {
      expect(connection).toStrictlyEqual(connection)
      calls.push(`RELEASE: ${++ this._release}`)
      return Promise.resolve()
    }

    destroy(): Promise<void> {
      if (! this._disposeTimeout) {
        calls.push('DESTROY')
        return Promise.resolve()
      }

      return new Promise((resolve) => {
        setTimeout(() => {
          calls.push('DESTROY')
          resolve()
        }, this._disposeTimeout)
      })
    }
  }

  beforeAll(() => {
    registerProvider(protocol, TestProvider)
  })

  beforeEach(() => {
    result = undefined
    calls = []
  })

  it('should create a client with a URL', async () => {
    const client = new PGClient(url)

    expect(client.url).toEqual(url)
    expect(client.url).not.toStrictlyEqual(url) // defensive copy
    expect(client.registry).toBeInstanceOf(Registry)

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
    ])

    await expect(client.query('the sql', [ 'foo', null, 'bar', undefined ]))
        .toBeRejectedWithError('No result for query')

    await client.destroy()

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'QUERY: the sql [foo,,bar,]',
      'DESTROY',
    ])
  })

  it('should create a client with a Provider', async () => {
    const client = new PGClient(new TestProvider(url))

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
    ])

    await expect(client.query('the sql', [ 'foo', null, 'bar', undefined ]))
        .toBeRejectedWithError('No result for query')

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'QUERY: the sql [foo,,bar,]',
    ])
  })

  it('should should sanitize credentials in exposed URLs', async () => {
    const client = new PGClient(`${protocol}://user:password@host:1234/dbname`)
    expect(client.url.href).toEqual(`${protocol}://host:1234/dbname`)
  })

  it('should create a client with some options', async () => {
    process.env.PGUSER = 'env-user'
    process.env.PGPASSWORD = 'env-password'

    try {
      const client1 = new PGClient({
        protocol: protocol,
      })

      const client2 = new PGClient({
        protocol: protocol,
        username: 'user',
        password: 'password',
        host: 'host',
        port: 1234,
        database: 'dbname',
        parameters: {
          string: 'foo',
          number: 123,
          boolean: true,
        },
      })


      expect(client1.url.href).toEqual(`${protocol}://localhost/`)
      expect(client2.url.href).toEqual(`${protocol}://host:1234/dbname?string=foo&number=123&boolean=true`)
      expect(calls).toEqual([
        `CONSTRUCT: ${protocol}://env-user:env-password@localhost/`,
        `CONSTRUCT: ${protocol}://user:password@host:1234/dbname?string=foo&number=123&boolean=true`,
      ])
    } finally {
      delete process.env.PGUSER
      delete process.env.PGPASSWORD
    }
  })

  it('should query with undefined parameters', async () => {
    const client = new PGClient(url)

    result = {
      command: 'TEST',
      rowCount: 0, // leave as _zero_ to check that it's not from `rows.length`
      fields: [ [ 'foo', PGOIDs.int8 ] ],
      rows: [ [ '1234567890' ], [ null ] ],
    }

    const r0 = await client.query('the sql')

    expect(r0).toEqual({
      command: 'TEST',
      rowCount: 0,
      fields: [ { name: 'foo', oid: PGOIDs.int8 } ],
      tuples: [ [ 1234567890n ], [ null ] ],
      rows: [ { foo: 1234567890n }, { foo: null } ],
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'QUERY: the sql []',
    ])
  })

  it('should query with undefined parameters (object mode)', async () => {
    const client = new PGClient(url)

    result = {
      command: 'TEST',
      rowCount: 0, // leave as _zero_ to check that it's not from `rows.length`
      fields: [ [ 'foo', PGOIDs.int8 ] ],
      rows: [ [ '1234567890' ], [ null ] ],
    }

    const r0 = await client.query({ query: 'the sql' })

    expect(r0).toEqual({
      command: 'TEST',
      rowCount: 0,
      fields: [ { name: 'foo', oid: PGOIDs.int8 } ],
      tuples: [ [ 1234567890n ], [ null ] ],
      rows: [ { foo: 1234567890n }, { foo: null } ],
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'QUERY: the sql []',
    ])
  })

  it('should query with zero parameters', async () => {
    const client = new PGClient(url)

    result = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    const r0 = await client.query('the sql', [])

    expect(r0).toEqual({
      command: 'TEST',
      fields: [],
      rowCount: 0,
      tuples: [],
      rows: [],
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'QUERY: the sql []',
    ])
  })

  it('should query with zero parameters (object mode)', async () => {
    const client = new PGClient(url)

    result = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    const r0 = await client.query({ query: 'the sql', params: [] })

    expect(r0).toEqual({
      command: 'TEST',
      fields: [],
      rowCount: 0,
      tuples: [],
      rows: [],
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'QUERY: the sql []',
    ])
  })

  it('should query with some parameters', async () => {
    const client = new PGClient(url)

    result = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    const r0 = await client.query('the sql', [ 'the param', 2, false ])

    expect(r0).toEqual({
      command: 'TEST',
      fields: [],
      rowCount: 0,
      tuples: [],
      rows: [],
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'QUERY: the sql [the param,2,f]',
    ])
  })

  it('should query with some parameters (object mode)', async () => {
    const client = new PGClient(url)

    result = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    const r0 = await client.query({ query: 'the sql', params: [ 'the param', 2, false ] })

    expect(r0).toEqual({
      command: 'TEST',
      fields: [],
      rowCount: 0,
      tuples: [],
      rows: [],
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'QUERY: the sql [the param,2,f]',
    ])
  })

  it('should query with template strings', async () => {
    const client = new PGClient(url)

    result = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    const r0 = await client.query(SQL `the sql ${'the param'} and ${2} then ${false}`)

    expect(r0).toEqual({
      command: 'TEST',
      fields: [],
      rowCount: 0,
      tuples: [],
      rows: [],
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'QUERY: the sql $1 and $2 then $3 [the param,2,f]',
    ])
  })

  it('should connect with undefined parameters', async () => {
    const client = new PGClient(url)

    result = {
      command: 'TEST',
      rowCount: 0, // leave as _zero_ to check that it's not from `rows.length`
      fields: [ [ 'foo', PGOIDs.int8 ] ],
      rows: [ [ '1234567890' ], [ null ] ],
    }

    const r0 = await client.connect((conn) => conn.query('the sql'))

    expect(r0).toEqual({
      command: 'TEST',
      rowCount: 0,
      fields: [ { name: 'foo', oid: PGOIDs.int8 } ],
      tuples: [ [ 1234567890n ], [ null ] ],
      rows: [ { foo: 1234567890n }, { foo: null } ],
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY 1: the sql []',
      'RELEASE: 1',
    ])
  })

  it('should connect with zero parameters', async () => {
    const client = new PGClient(url.href)

    result = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    const r0 = await client.connect((conn) => conn.query('the sql', []))

    expect(r0).toEqual({
      command: 'TEST',
      rowCount: 0,
      fields: [],
      tuples: [],
      rows: [],
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY 1: the sql []',
      'RELEASE: 1',
    ])
  })

  it('should issue transaction statements', async () => {
    const client = new PGClient(url.href)

    await client.connect(async (conn) => {
      expect(await conn.begin()).toBeTrue()
      expect(await conn.begin()).toBeFalse()
      await conn.commit()
      await conn.rollback()
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY 1: BEGIN []',
      'QUERY 1: COMMIT []',
      'QUERY 1: ROLLBACK []',
      'RELEASE: 1',
    ])
  })

  it('should commit transactions with some sql', async () => {
    const client = new PGClient(url.href)

    result = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    await client.connect(async (conn): Promise<void> => {
      await conn.begin()
      await conn.query('the sql')
      await conn.commit()
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY 1: BEGIN []',
      'QUERY 1: the sql []',
      'QUERY 1: COMMIT []',
      'RELEASE: 1',
    ])
  })

  it('should commit transactions with some sql (object mode)', async () => {
    const client = new PGClient(url.href)

    result = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    await client.connect(async (conn): Promise<void> => {
      await conn.begin()
      await conn.query({ query: 'the sql' })
      await conn.commit()
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY 1: BEGIN []',
      'QUERY 1: the sql []',
      'QUERY 1: COMMIT []',
      'RELEASE: 1',
    ])
  })

  it('should rollback open transactions automatically', async () => {
    const client = new PGClient(url.href)

    result = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    await client.connect(async (conn) => {
      await conn.begin()
      await conn.query('the sql')
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY 1: BEGIN []',
      'QUERY 1: the sql []',
      'QUERY 1: ROLLBACK []',
      'RELEASE: 1',
    ])
  })

  it('should release a connection in case of query error', async () => {
    const client = new PGClient(url.href)

    await expect(client.connect((conn) => conn.query('the sql', [])))
        .toBeRejectedWithError('No result for query')

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY 1: the sql []',
      'RELEASE: 1',
    ])
  })

  it('should rollback transactions and release a connection in case of query error', async () => {
    const client = new PGClient(url.href)

    await expect(client.connect(async (conn) => {
      await conn.begin()
      await conn.query('the sql', [])
    })).toBeRejectedWithError('No result for query')

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY 1: BEGIN []',
      'QUERY 1: the sql []',
      'QUERY 1: ROLLBACK []',
      'RELEASE: 1',
    ])
  })

  it('should release a connection in case of consumer error', async () => {
    const client = new PGClient(url.href)

    await expect(client.connect(async () => {
      throw new Error('Foo, this is a test!')
    })).toBeRejectedWithError('Foo, this is a test!')

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'RELEASE: 1',
    ])
  })

  it('should rollback a transaction and release a connection in case of consumer error', async () => {
    const client = new PGClient(url.href)

    await expect(client.connect(async (conn) => {
      await conn.begin()
      throw new Error('Foo, this is a test!')
    })).toBeRejectedWithError('Foo, this is a test!')

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY 1: BEGIN []',
      'QUERY 1: ROLLBACK []',
      'RELEASE: 1',
    ])
  })

  it('should construct a client without an url', async () => {
    const pgurl = process.env.PGURL
    const pguser = process.env.PGUSER
    const pgpassword = process.env.PGPASSWORD
    try {
      const noAuthUrl = new URL(url.href)
      noAuthUrl.username = ''
      noAuthUrl.password = ''

      process.env.PGURL = noAuthUrl.href
      delete process.env.PGUSER
      delete process.env.PGPASSWORD

      expect(() => new PGClient()).not.toThrow()
      expect(calls).toEqual([ `CONSTRUCT: ${noAuthUrl.href}` ])

      calls = []

      process.env.PGUSER = 'my:user'
      process.env.PGPASSWORD = 'my:password'

      expect(() => new PGClient()).not.toThrow()

      const authUrl = new URL(noAuthUrl.href)
      authUrl.username = encodeURIComponent('my:user')
      authUrl.password = encodeURIComponent('my:password')

      expect(calls).toEqual([ `CONSTRUCT: ${authUrl.href}` ])
      expect(calls[0]).toMatch(/\/\/my%3Auser:my%3Apassword@/)

      delete process.env.PGURL
      calls = []

      expect(() => new PGClient()).toThrowError('No URL to connect to (PGURL environment variable missing?)')
      expect(calls).toEqual([])
    } finally {
      restoreEnv('PGURL', pgurl)
      restoreEnv('PGUSER', pguser)
      restoreEnv('PGPASSWORD', pgpassword)
    }
  })

  it('should work with async disposal', async () => {
    const delay = 500 // delay (in ms) that `destroy()` takes to complete
    const time = Date.now() // measure time before...

    // our block, with automatic disposal at the end
    {
      await using client = new PGClient(url + `?disposeTimeout=${delay}`)
      void client // avoid eslint warning
    }

    // check calls, ensuring that `DESTROY` was called
    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}?disposeTimeout=${delay}`,
      'DESTROY',
    ])

    // measure time after disposal and check that it took at least `delay` ms
    expect(Date.now()).toBeGreaterThanOrEqual(time + delay)
  })

  it('should produce async disposable connections', async () => {
    result = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    // our blocks, with automatic disposal at the end
    {
      await using client = new PGClient(url)
      for (let n = 0; n < 2; n ++) {
        await using conn = await client.connect()
        await conn.query(`SELECT ${n + 1}`)
      }
    }

    // check calls, ensuring that `DESTROY` was called
    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY 1: SELECT 1 []',
      'RELEASE: 1',
      'ACQUIRE: 2',
      'QUERY 2: SELECT 2 []',
      'RELEASE: 2',
      'DESTROY',
    ])
  })
})
