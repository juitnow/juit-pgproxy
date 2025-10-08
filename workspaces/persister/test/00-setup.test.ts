import { registerProvider } from '@juit/pgproxy-client'

import { Persister } from '../src/index'

import type { PGProvider, PGProviderConnection, PGProviderResult } from '@juit/pgproxy-client'

let _calls: any[] = []

const result: PGProviderResult = {
  command: 'MOCK',
  rowCount: 3,
  fields: [
    [ 'foo', 1043 ], // varchar
    [ 'bar', 23 ], // int4
    [ 'baz', 16 ], // bool
  ],
  rows: [
    [ 'first', '1234', 't' ],
    [ 'second', null, 'f' ],
    [ 'third', '1234', null ],
  ],
}

registerProvider('mock', class MockProvider implements PGProvider {
  constructor(url: URL) {
    _calls.push(`!CREATE ${url.href}`)
  }

  async acquire(): Promise<PGProviderConnection> {
    _calls.push('!ACQUIRE')

    return new class implements PGProviderConnection {
      async query(...args: any[]): Promise<PGProviderResult> {
        _calls.push([ '!CONNQUERY', ...args ])
        return result
      }
    }
  }

  async release(): Promise<void> {
    _calls.push('!RELEASE')
  }

  async destroy(): Promise<void> {
    _calls.push('!DESTROY')
  }

  async query(...args: any[]): Promise<PGProviderResult> {
    _calls.push([ '!QUERY', ...args ])
    return result
  }
})

beforeEach(() => void (_calls = []))

export const persister = new Persister('mock:///')

export function calls(): any[] {
  return _calls
}
