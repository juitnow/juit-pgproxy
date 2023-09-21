/* eslint-disable no-console */
import { WHATWGClient } from '../../src'

function log(message: any): void {
  `${message}`.split('\n').forEach((line) => console.log(line))
}

function assert(value: unknown, message?: string): asserts value {
  if (! value) throw new Error(message || 'Assertion failed')
}

export const testQuery: ExportedHandler<{ PGURL?: string }> = {
  async test(_, env): Promise<void> {
    try {
      if (! env.PGURL) throw new Error('No URL configured')
      const client = new WHATWGClient(env.PGURL)
      const result = await client.query('SELECT now()')

      assert(result.command === 'SELECT', `Wrong command: ${result.command}`)
      assert(result.rowCount === 1, `Wrong rowCount: ${result.rowCount}`)
      assert(result.rows?.length === 1, `Wrong rows length: ${result.rows?.length}`)
      assert(result.rows?.[0]?.['now'] instanceof Date, `Wrong row: ${result.rows?.[0]?.['now']}`)
      assert(result.tuples?.length === 1, `Wrong tuples length: ${result.tuples?.length}`)
      assert(result.tuples?.[0]?.[0] instanceof Date, `Wrong tuple: ${result.tuples?.[0]?.[0]}`)
    } catch (error: any) {
      log(error ? (error.stack || error) : 'Uknown error')
    }
  },
}

export const testConnection: ExportedHandler<{ PGURL?: string }> = {
  async test(_, env): Promise<void> {
    try {
      if (! env.PGURL) throw new Error('No URL configured')
      const client = new WHATWGClient(env.PGURL)
      await client.connect(async (connection) => {
        const result = await connection.query('SELECT now()')

        assert(result.command === 'SELECT', `Wrong command: ${result.command}`)
        assert(result.rowCount === 1, `Wrong rowCount: ${result.rowCount}`)
        assert(result.rows?.length === 1, `Wrong rows length: ${result.rows?.length}`)
        assert(result.rows?.[0]?.['now'] instanceof Date, `Wrong row: ${result.rows?.[0]?.['now']}`)
        assert(result.tuples?.length === 1, `Wrong tuples length: ${result.tuples?.length}`)
        assert(result.tuples?.[0]?.[0] instanceof Date, `Wrong tuple: ${result.tuples?.[0]?.[0]}`)
      })
    } catch (error: any) {
      log(error ? (error.stack || error) : 'Uknown error')
    }
  },
}
