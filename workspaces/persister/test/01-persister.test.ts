import { Registry } from '@juit/pgproxy-types'

import { restoreEnv } from '../../../support/utils'
import { Persister, SQL } from '../src'
import { calls, persister } from './00-setup.test'

describe('Persister', () => {
  it('should create and destroy a persister', async () => {
    const pgurl = process.env.PGURL
    const pguser = process.env.PGUSER
    const pgpassword = process.env.PGPASSWORD
    try {
      process.env.PGURL = 'mock://environment'
      delete process.env.PGUSER
      delete process.env.PGPASSWORD

      const p1 = new Persister()
      await p1.destroy()

      const p2 = new Persister('mock://string')
      await p2.destroy()

      const p3 = new Persister(new URL('mock://url'))
      await p3.destroy()

      expect(calls()).toEqual([
        '!CREATE mock://environment', '!DESTROY',
        '!CREATE mock://string', '!DESTROY',
        '!CREATE mock://url', '!DESTROY',
      ])

      expect(p1.registry).toBeInstanceOf(Registry)
      expect(p2.registry).toBeInstanceOf(Registry)
      expect(p3.registry).toBeInstanceOf(Registry)
    } finally {
      restoreEnv('PGURL', pgurl)
      restoreEnv('PGUSER', pguser)
      restoreEnv('PGPASSWORD', pgpassword)
    }
  })

  it('should create a persister with options', async () => {
    const persister = new Persister({ protocol: 'mock' })
    expect(persister.url.href).toEqual('mock://localhost/')
  })

  it('should query the persister instance', async () => {
    await persister.query('STATEMENT 1 >$1~$2<', [ 'ARGS 1', new Date(0) ])
    await persister.query('STATEMENT 2 >$1~$2<', [ 12345, false ])
    await persister.query('STATEMENT 3', undefined)
    await persister.query('STATEMENT 4', [])
    await persister.query('STATEMENT 5')

    expect(calls()).toEqual([
      [ '!QUERY', 'STATEMENT 1 >$1~$2<', [ 'ARGS 1', '1970-01-01T00:00:00.000+00:00' ] ],
      [ '!QUERY', 'STATEMENT 2 >$1~$2<', [ '12345', 'f' ] ],
      [ '!QUERY', 'STATEMENT 3', [] ],
      [ '!QUERY', 'STATEMENT 4', [] ],
      [ '!QUERY', 'STATEMENT 5', [] ],
    ])
  })

  it('should query the persister instance (object mode)', async () => {
    await persister.query({ query: 'STATEMENT 1 >$1~$2<', params: [ 'ARGS 1', new Date(0) ] })
    await persister.query({ query: 'STATEMENT 2 >$1~$2<', params: [ 12345, false ] })
    await persister.query({ query: 'STATEMENT 3', params: undefined })
    await persister.query({ query: 'STATEMENT 4', params: [] })
    await persister.query({ query: 'STATEMENT 5' })
    await persister.query(SQL `STATEMENT 6 ${'the param'}`)

    expect(calls()).toEqual([
      [ '!QUERY', 'STATEMENT 1 >$1~$2<', [ 'ARGS 1', '1970-01-01T00:00:00.000+00:00' ] ],
      [ '!QUERY', 'STATEMENT 2 >$1~$2<', [ '12345', 'f' ] ],
      [ '!QUERY', 'STATEMENT 3', [] ],
      [ '!QUERY', 'STATEMENT 4', [] ],
      [ '!QUERY', 'STATEMENT 5', [] ],
      [ '!QUERY', 'STATEMENT 6 $1', [ 'the param' ] ],
    ])
  })

  it('should connect and query the connection instance', async () => {
    const result = Symbol()

    const actual = await persister.connect(async (connection) => {
      calls().push('!CONNECTED')
      await connection.query('STATEMENT 1 >$1~$2<', [ 'ARGS 1', new Date(0) ])
      await connection.query('STATEMENT 2 >$1~$2<', [ 12345, false ])
      await connection.query('STATEMENT 3', undefined)
      await connection.query('STATEMENT 4', [])
      await connection.query('STATEMENT 5')
      await connection.query(SQL `STATEMENT 6 ${'the param'}`)
      return result
    })

    expect(calls()).toEqual([
      '!ACQUIRE',
      '!CONNECTED',
      [ '!CONNQUERY', 'STATEMENT 1 >$1~$2<', [ 'ARGS 1', '1970-01-01T00:00:00.000+00:00' ] ],
      [ '!CONNQUERY', 'STATEMENT 2 >$1~$2<', [ '12345', 'f' ] ],
      [ '!CONNQUERY', 'STATEMENT 3', [] ],
      [ '!CONNQUERY', 'STATEMENT 4', [] ],
      [ '!CONNQUERY', 'STATEMENT 5', [] ],
      [ '!CONNQUERY', 'STATEMENT 6 $1', [ 'the param' ] ],
      '!RELEASE',
    ])

    expect(actual).toStrictlyEqual(result)
  })

  it('should connect and query the connection instance (object mode)', async () => {
    const result = Symbol()

    const actual = await persister.connect(async (connection) => {
      calls().push('!CONNECTED')
      await connection.query({ query: 'STATEMENT 1 >$1~$2<', params: [ 'ARGS 1', new Date(0) ] })
      await connection.query({ query: 'STATEMENT 2 >$1~$2<', params: [ 12345, false ] })
      await connection.query({ query: 'STATEMENT 3', params: undefined })
      await connection.query({ query: 'STATEMENT 4', params: [] })
      await connection.query({ query: 'STATEMENT 5' })
      return result
    })

    expect(calls()).toEqual([
      '!ACQUIRE',
      '!CONNECTED',
      [ '!CONNQUERY', 'STATEMENT 1 >$1~$2<', [ 'ARGS 1', '1970-01-01T00:00:00.000+00:00' ] ],
      [ '!CONNQUERY', 'STATEMENT 2 >$1~$2<', [ '12345', 'f' ] ],
      [ '!CONNQUERY', 'STATEMENT 3', [] ],
      [ '!CONNQUERY', 'STATEMENT 4', [] ],
      [ '!CONNQUERY', 'STATEMENT 5', [] ],
      '!RELEASE',
    ])

    expect(actual).toStrictlyEqual(result)
  })

  it('should properly handle transaction statements', async () => {
    await persister.connect(async (connection) => {
      expect(await connection.begin()).toBeTrue()
      expect(await connection.begin()).toBeFalse()
      await connection.commit()
      await connection.rollback()
    })

    expect(calls()).toEqual([
      '!ACQUIRE',
      [ '!CONNQUERY', 'BEGIN' ],
      [ '!CONNQUERY', 'COMMIT' ],
      [ '!CONNQUERY', 'ROLLBACK' ],
      '!RELEASE',
    ])
  })

  it('should return the proper value from "connect"', async () => {
    const result = Symbol()

    const p1 = persister.connect(() => result) // synchronous
    const p2 = persister.connect(async () => result) // async
    const p3 = persister.connect(() => Promise.resolve(result)) // promised

    expect(p1).toBeA('promise')
    expect(p2).toBeA('promise')
    expect(p3).toBeA('promise')

    expect(await p1).toStrictlyEqual(result)
    expect(await p2).toStrictlyEqual(result)
    expect(await p3).toStrictlyEqual(result)
  })

  it('should trap exceptions from "connect', async () => {
    const error = new Error()

    const p1 = persister.connect(() => {
      throw error
    }) // synchronous
    const p2 = persister.connect(async () => {
      throw error
    }) // async
    const p3 = persister.connect(() => Promise.reject(error)) // promised

    expect(p1).toBeA('promise')
    expect(p2).toBeA('promise')
    expect(p3).toBeA('promise')

    expect(p1).toBeRejectedWith(error)
    expect(p2).toBeRejectedWith(error)
    expect(p3).toBeRejectedWith(error)
  })

  it('should ping the database', async () => {
    await persister.ping()

    expect(calls()).toEqual([ [ '!QUERY', 'SELECT now()', [] ] ])
  })

  it('should work with async disposal', async () => {
    // our block, with automatic disposal at the end
    {
      await using persister = new Persister('mock://string')
      void persister // avoid eslint warning
    }

    // check calls, ensuring that `DESTROY` was called
    expect(calls()).toEqual([
      '!CREATE mock://string',
      '!DESTROY',
    ])
  })

  it('should produce async disposable connections', async () => {
    // our blocks, with automatic disposal at the end
    {
      await using persister = new Persister('mock://string')
      for (let n = 0; n < 2; n ++) {
        await using conn = await persister.connect()
        await conn.query(`SELECT ${n + 1}`)
      }
    }

    // check calls, ensuring that `DESTROY` was called
    expect(calls()).toEqual([
      '!CREATE mock://string',
      '!ACQUIRE',
      [ '!CONNQUERY', 'SELECT 1', [] ],
      '!RELEASE',
      '!ACQUIRE',
      [ '!CONNQUERY', 'SELECT 2', [] ],
      '!RELEASE',
      '!DESTROY',
    ])
  })
})
