import { randomUUID } from 'node:crypto'


import { PGOIDs } from '@juit/pgproxy-types'

import { PGClient, registerProvider } from '../src/index'

import type { PGConnection, PGConnectionResult, PGProvider } from '../src/index'

describe('Client', () => {
  const protocol = `test-${randomUUID()}`
  const url = new URL(`${protocol}://test-host:1234/test-path`)

  let result: PGConnectionResult | undefined = undefined
  let calls: string[] = []

  beforeAll(() => {
    class TestProvider implements PGProvider {
      private _acquire = 0
      private _release = 0

      constructor(url: URL) {
        calls.push(`CONSTRUCT: ${url.href}`)
      }

      query(text: string, params: string[]): Promise<PGConnectionResult> {
        calls.push(`QUERY: ${text} [${params.join(',')}]`)
        if (! result) throw new Error('No result for query')
        return Promise.resolve(result)
      }

      acquire(): Promise<PGConnection> {
        const id = ++ this._acquire
        calls.push(`ACQUIRE: ${id}`)

        const connection: PGConnection = {
          query(text: string, params: string[]): Promise<PGConnectionResult> {
            calls.push(`QUERY ${id}: ${text} [${params.join(',')}]`)
            if (! result) throw new Error('No result for query')
            return Promise.resolve(result)
          },
        }

        return Promise.resolve(connection)
      }

      release(connection: PGConnection): Promise<void> {
        expect(connection).toStrictlyEqual(connection)
        calls.push(`RELEASE: ${++ this._release}`)
        return Promise.resolve()
      }
    }

    registerProvider(protocol, TestProvider)
  })

  beforeEach(() => {
    result = undefined
    calls = []
  })

  it('should wrap a provider with a client', async () => {
    const client = new PGClient(url)

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
      rowCount: 0,
      tuples: [],
      rows: [],
    })

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'QUERY: the sql []',
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

  it('should release a connection in case of consumer error', async () => {
    const client = new PGClient(url.href)

    await expect(client.connect(() => {
      throw new Error('Foo, this is a test!')
    })).toBeRejectedWithError('Foo, this is a test!')

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'RELEASE: 1',
    ])
  })

  it('should construct a client without an url', async () => {
    const pgurl = process.env.PGURL
    try {
      process.env.PGURL = url.href
      expect(() => new PGClient()).not.toThrow()
      expect(calls).toEqual([ `CONSTRUCT: ${url.href}` ])

      delete process.env.PGURL
      calls = []

      expect(() => new PGClient()).toThrowError('No URL for connection (forgot the PGURL variable?)')
      expect(calls).toEqual([])
    } finally {
      process.env.PGURL = pgurl
    }
  })
})
