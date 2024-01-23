import { Registry } from '@juit/pgproxy-types'

import { restoreEnv } from '../../../support/utils'
import { Persister } from '../src'
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

  it('should connect and query the connection instance', async () => {
    const result = Symbol()

    const actual = await persister.connect(async (connection) => {
      calls().push('!CONNECTED')
      await connection.query('STATEMENT 1 >$1~$2<', [ 'ARGS 1', new Date(0) ])
      await connection.query('STATEMENT 2 >$1~$2<', [ 12345, false ])
      await connection.query('STATEMENT 3', undefined)
      await connection.query('STATEMENT 4', [])
      await connection.query('STATEMENT 5')
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
      await connection.begin()
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
})
