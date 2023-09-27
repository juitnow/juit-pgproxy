import { registerProvider } from '@juit/pgproxy-client'

import { Persister } from '../src/index'

import type { PGConnection, PGConnectionResult, PGProvider } from '@juit/pgproxy-client'

let _count: number = -1
let _calls: any[] = []

const result: PGConnectionResult = {
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

registerProvider('mock', class MockProvider implements PGProvider<PGConnection> {
  constructor(url: URL, private readonly _index = ++ _count) {
    _calls.push(`!CREATE[${this._index}] ${url.href}`)
  }

  async acquire(): Promise<PGConnection> {
    _calls.push(`!ACQUIRE[${this._index}]`)

    const _index = this._index
    return new class implements PGConnection {
      async query(...args: any[]): Promise<PGConnectionResult> {
        _calls.push([ `!CONNQUERY[${_index}]`, ...args ])
        return result
      }
    }
  }

  async release(): Promise<void> {
    _calls.push(`!RELEASE[${this._index}]`)
  }

  async destroy(): Promise<void> {
    _calls.push(`!DESTROY[${this._index}]`)
  }

  async query(...args: any[]): Promise<PGConnectionResult> {
    _calls.push([ `!QUERY[${this._index}]`, ...args ])
    return result
  }
})

beforeEach(() => {
  _count = 0
  _calls = []
})

export const persister = new Persister('mock:///')

export function calls(): any[] {
  return _calls
}
