import { PGOIDs, Registry } from '@juit/pgproxy-types'

import { PGResult } from '../src/index'

describe('Result', () => {
  it('should wrap a connection result', () => {
    const registry = new Registry()

    const result = new PGResult({
      command: 'TEST',
      rowCount: 3,
      fields: [
        [ 's', 1 ], //        unknown OID => string
        [ 'b', PGOIDs.bool ], //     bool => boolean
        [ 'n', PGOIDs.float8 ], // float8 => number
        [ 'i', PGOIDs.int8 ], //     int8 => bigint
      ],
      rows: [
        [ 'foo', 't', '123.456', '123456' ],
        [ 'bar', 'f', '654.321', '654321' ],
        [ null, undefined, null, undefined ] as any, // no undefined!
      ],
    }, registry)

    expect(result).toEqual({
      command: 'TEST',
      rowCount: 3,
      fields: [
        { name: 's', oid: 1 }, //        unknown OID => string
        { name: 'b', oid: PGOIDs.bool }, //     bool => boolean
        { name: 'n', oid: PGOIDs.float8 }, // float8 => number
        { name: 'i', oid: PGOIDs.int8 }, //     int8 => bigint
      ],
      rows: [
        { s: 'foo', b: true, n: 123.456, i: 123456n },
        { s: 'bar', b: false, n: 654.321, i: 654321n },
        { s: null, b: null, n: null, i: null },
      ],
      tuples: [
        [ 'foo', true, 123.456, 123456n ],
        [ 'bar', false, 654.321, 654321n ],
        [ null, null, null, null ],
      ],
    })
  })
})
