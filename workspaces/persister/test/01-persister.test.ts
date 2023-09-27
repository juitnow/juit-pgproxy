import { PGClient } from '@juit/pgproxy-client'
import { Registry } from '@juit/pgproxy-types'

import { Persister } from '../src'
import { calls, persister } from './00-setup.test'


describe('Persister', () => {
  it('should create and destroy a persister', async () => {
    const oldEnv = process.env.PGURL
    try {
      process.env.PGURL = 'mock://environment'
      const p1 = new Persister()
      expect(p1.schema).toEqual({})
      await p1.destroy()

      const p2 = new Persister('mock://string')
      expect(p2.schema).toEqual({})
      await p2.destroy()

      const p3 = new Persister(new URL('mock://url'))
      expect(p3.schema).toEqual({})
      await p3.destroy()

      const p4 = new Persister(new PGClient('mock://client'))
      expect(p4.schema).toEqual({})
      await p4.destroy()

      // now with a schema

      process.env.PGURL = 'mock://environment+schema'
      const p5 = new Persister({ environment: {} })
      expect(p5.schema).toEqual({ environment: {} })
      await p5.destroy()

      const p6 = new Persister('mock://string+schema', { string: {} })
      expect(p6.schema).toEqual({ string: {} })
      await p6.destroy()

      const p7 = new Persister(new URL('mock://url+schema'), { url: {} })
      expect(p7.schema).toEqual({ url: {} })
      await p7.destroy()

      const p8 = new Persister(new PGClient('mock://client+schema'), { client: {} })
      expect(p8.schema).toEqual({ client: {} })
      await p8.destroy()

      expect(calls()).toEqual([
        '!CREATE[1] mock://environment', '!DESTROY[1]',
        '!CREATE[2] mock://string', '!DESTROY[2]',
        '!CREATE[3] mock://url', '!DESTROY[3]',
        '!CREATE[4] mock://client', '!DESTROY[4]',
        '!CREATE[5] mock://environment+schema', '!DESTROY[5]',
        '!CREATE[6] mock://string+schema', '!DESTROY[6]',
        '!CREATE[7] mock://url+schema', '!DESTROY[7]',
        '!CREATE[8] mock://client+schema', '!DESTROY[8]',
      ])

      expect(p1.registry).toBeInstanceOf(Registry)
      expect(p2.registry).toBeInstanceOf(Registry)
      expect(p3.registry).toBeInstanceOf(Registry)
      expect(p4.registry).toBeInstanceOf(Registry)
      expect(p5.registry).toBeInstanceOf(Registry)
      expect(p6.registry).toBeInstanceOf(Registry)
      expect(p7.registry).toBeInstanceOf(Registry)
      expect(p8.registry).toBeInstanceOf(Registry)
    } finally {
      if (oldEnv) process.env.PGURL = oldEnv
      else delete process.env.PGURL
    }
  })

  it('should query the persister instance', async () => {
    await persister.query('STATEMENT 1 >$1~$2<', [ 'ARGS 1', new Date(0) ])
    await persister.query('STATEMENT 2 >$1~$2<', [ 12345, false ])
    await persister.query('STATEMENT 3', undefined)
    await persister.query('STATEMENT 4', [])
    await persister.query('STATEMENT 5')

    expect(calls()).toEqual([
      [ '!QUERY[0]', 'STATEMENT 1 >$1~$2<', [ 'ARGS 1', '1970-01-01T00:00:00.000+00:00' ] ],
      [ '!QUERY[0]', 'STATEMENT 2 >$1~$2<', [ '12345', 'f' ] ],
      [ '!QUERY[0]', 'STATEMENT 3', [] ],
      [ '!QUERY[0]', 'STATEMENT 4', [] ],
      [ '!QUERY[0]', 'STATEMENT 5', [] ],
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
      '!ACQUIRE[0]',
      '!CONNECTED',
      [ '!CONNQUERY[0]', 'STATEMENT 1 >$1~$2<', [ 'ARGS 1', '1970-01-01T00:00:00.000+00:00' ] ],
      [ '!CONNQUERY[0]', 'STATEMENT 2 >$1~$2<', [ '12345', 'f' ] ],
      [ '!CONNQUERY[0]', 'STATEMENT 3', [] ],
      [ '!CONNQUERY[0]', 'STATEMENT 4', [] ],
      [ '!CONNQUERY[0]', 'STATEMENT 5', [] ],
      '!RELEASE[0]',
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
      '!ACQUIRE[0]',
      [ '!CONNQUERY[0]', 'BEGIN', [] ],
      [ '!CONNQUERY[0]', 'COMMIT', [] ],
      [ '!CONNQUERY[0]', 'ROLLBACK', [] ],
      '!RELEASE[0]',
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
})
