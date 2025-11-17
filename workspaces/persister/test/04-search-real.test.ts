import { createdb, dropdb, migrate } from '@juit/pgproxy-utils'
import { paths } from '@plugjs/build'
// side-effect import to register the psql protocol
import '@juit/pgproxy-client-psql'

import { Persister, Search } from '../src'

import type { SearchJoins } from '../src/search'
import type { TestSchema } from './test-schema'

describe('Search (Query Execution)', () => {
  const joins = {
    referenced: { table: 'joined', column: 'ref', refColumn: 'uuid', sortColumn: 'key' },
  } as const satisfies SearchJoins<TestSchema>

  let persister: Persister<TestSchema>
  let dbname: string
  let search: Search<TestSchema, 'main', typeof joins>

  beforeAll(async () => {
    dbname = await createdb()
    const migrations = paths.requireFilename(__fileurl, 'sql')
    await migrate(dbname, { migrations })
    persister = new Persister<TestSchema>(dbname)
    search = new Search(persister, 'main', joins, '_search')
  })

  afterAll(async () => {
    await persister.destroy()
    await dropdb(dbname)
  })

  it('should return all our result data', async () => {
    const result = await search.search({ limit: 100 })
    expect(result).toEqual({
      total: data.length,
      rows: expect.toMatchContents(data),
    })
  })

  it('should return the correct total even when offset is beyond the data length', async () => {
    const result = await search.search({ offset: 1000, limit: 100 })
    expect(result).toEqual({
      total: data.length,
      rows: [],
    })
  })

  it('should return a slice of the data properly sorted (ascending)', async () => {
    const result = await search.search({ limit: 2, sort: 'key' })
    expect(result).toEqual({
      total: data.length,
      rows: [ dataMap['a'], dataMap['b'] ],
    })

    const result2 = await search.search({ limit: 2, sort: 'number' })
    expect(result2).toEqual({
      total: data.length,
      rows: [ dataMap['x'], dataMap['w'] ],
    })
  })

  it('should return a slice of the data properly sorted (descending)', async () => {
    const result = await search.search({ limit: 2, sort: 'key', order: 'desc' })
    expect(result).toEqual({
      total: data.length,
      rows: [ dataMap['x'], dataMap['w'] ],
    })

    const result2 = await search.search({ limit: 2, sort: 'number', order: 'desc' })
    expect(result2).toEqual({
      total: data.length,
      rows: [ dataMap['a'], dataMap['b'] ],
    })
  })

  it('should return a slice of the data with an offset', async () => {
    const result = await search.search({ offset: 2, limit: 2, sort: 'key' })
    expect(result).toEqual({
      total: data.length,
      rows: [ dataMap['c'], dataMap['d'] ],
    })

    const result2 = await search.search({ offset: 4, limit: 2, sort: 'key' })
    expect(result2).toEqual({
      total: data.length,
      rows: [ dataMap['e'], dataMap['f'] ],
    })
  })

  it('should return a slice of the data properly sorted by referenced', async () => {
    const result = await search.search({ limit: 15, sort: 'referenced' })
    expect(result).toEqual({
      total: data.length,
      rows: [
        dataMap['l'],
        dataMap['k'],
        dataMap['j'],
        dataMap['i'],
        dataMap['h'],
        dataMap['g'],
        dataMap['f'],
        dataMap['e'],
        dataMap['d'],
        dataMap['c'],
        dataMap['b'],
        dataMap['a'],
        // we can't predict the order of nulls, just ensure they are present
        expect.toInclude({ ref: null, referenced: null }),
        expect.toInclude({ ref: null, referenced: null }),
        expect.toInclude({ ref: null, referenced: null }),
      ],
    })

    const result2 = await search.search({ limit: 15, sort: 'referenced', order: 'desc' })
    expect(result2).toEqual({
      total: data.length,
      rows: [
        dataMap['a'],
        dataMap['b'],
        dataMap['c'],
        dataMap['d'],
        dataMap['e'],
        dataMap['f'],
        dataMap['g'],
        dataMap['h'],
        dataMap['i'],
        dataMap['j'],
        dataMap['k'],
        dataMap['l'],
        // we can't predict the order of nulls, just ensure they are present
        expect.toInclude({ ref: null, referenced: null }),
        expect.toInclude({ ref: null, referenced: null }),
        expect.toInclude({ ref: null, referenced: null }),
      ],
    })
  })

  it('should return a slice of the data using a full text search prefix', async () => {
    const result = await search.search({ q: 'aaa' })
    expect(result).toEqual({
      total: 1,
      rows: [ dataMap['a'] ],
    })

    const result2 = await search.search({ q: 'aaaaaa OR bbbbbb' })
    expect(result2).toEqual({
      total: 2,
      // same weight, order is unpredictable
      rows: expect.toMatchContents([ dataMap['a'], dataMap['b'] ]),
    })

    const result3 = await search.search({ q: 'xxxxxx OR ffffff OR bbbbbb', sort: 'number', order: 'desc' })
    expect(result3).toEqual({
      total: 3,
      // forced order, reversed number means alphabetical by key
      rows: [ dataMap['b'], dataMap['f'], dataMap['x'] ],
    })
  })

  it('should correctly use the ">" operator', async () => {
    const result = await search.search({ filters: [ { name: 'number', op: '>', value: 1022 } ] })
    expect(result).toEqual({
      total: 2,
      rows: expect.toInclude([
        dataMap['a'],
        dataMap['b'],
      ]),
    })

    const result2 = await search.search({ filters: [ { name: 'number', op: '>', value: 1022n } ] })
    expect(result2).toEqual({
      total: 2,
      rows: expect.toInclude([
        dataMap['a'],
        dataMap['b'],
      ]),
    })
  })

  it('should correctly use the ">=" operator', async () => {
    const result = await search.search({ filters: [ { name: 'number', op: '>=', value: 1022 } ] })
    expect(result).toEqual({
      total: 3,
      rows: expect.toInclude([
        dataMap['a'],
        dataMap['b'],
        dataMap['c'],
      ]),
    })

    const result2 = await search.search({ filters: [ { name: 'number', op: '>=', value: 1022n } ] })
    expect(result2).toEqual({
      total: 3,
      rows: expect.toInclude([
        dataMap['a'],
        dataMap['b'],
        dataMap['c'],
      ]),
    })
  })

  it('should correctly use the "<" operator', async () => {
    const result = await search.search({ filters: [ { name: 'key', op: '<', value: 'CCCCCC' } ] })
    expect(result).toEqual({
      total: 2,
      rows: expect.toInclude([
        dataMap['a'],
        dataMap['b'],
      ]),
    })
  })

  it('should correctly use the "<=" operator', async () => {
    const result = await search.search({ filters: [ { name: 'key', op: '<=', value: 'CCCCCC' } ] })
    expect(result).toEqual({
      total: 3,
      rows: expect.toInclude([
        dataMap['a'],
        dataMap['b'],
        dataMap['c'],
      ]),
    })
  })

  it('should correctly use the "like" operator', async () => {
    const result = await search.search({ filters: [ { name: 'key', op: 'like', value: 'CCC%' } ] })
    expect(result).toEqual({
      total: 1,
      rows: [ dataMap['c'] ],
    })

    const result2 = await search.search({ filters: [ { name: 'key', op: 'like', value: 'ccc%' } ] })
    expect(result2).toEqual({
      total: 0,
      rows: [],
    })
  })

  it('should correctly use the "ilike" operator', async () => {
    const result = await search.search({ filters: [ { name: 'key', op: 'ilike', value: 'CCC%' } ] })
    expect(result).toEqual({
      total: 1,
      rows: [ dataMap['c'] ],
    })

    const result2 = await search.search({ filters: [ { name: 'key', op: 'ilike', value: 'ccc%' } ] })
    expect(result2).toEqual({
      total: 1,
      rows: [ dataMap['c'] ],
    })
  })

  it('should correctly use the "~" operator', async () => {
    const result = await search.search({ filters: [ { name: 'key', op: '~', value: 'CCC%' } ] })
    expect(result).toEqual({
      total: 1,
      rows: [ dataMap['c'] ],
    })

    const result2 = await search.search({ filters: [ { name: 'key', op: '~', value: 'ccc%' } ] })
    expect(result2).toEqual({
      total: 1,
      rows: [ dataMap['c'] ],
    })
  })

  it('should correctly use the "!=" operator', async () => {
    const result = await search.search({ limit: 5, filters: [ { name: 'key', op: '!=', value: 'CCCCCC' } ] })
    expect(result).toEqual({
      total: data.length - 1,
      rows: expect.toHaveLength(5),
    })

    const result2 = await search.search({ limit: 5, filters: [ { name: 'ref', op: '!=', value: null } ] })
    expect(result2).toEqual({
      total: data.length / 2,
      rows: expect.toHaveLength(5),
    })

    result2.rows.forEach((row) => expect(row.ref).toBeA('string'))
  })

  it('should correctly use the "==" operator', async () => {
    const result = await search.search({ filters: [ { name: 'key', op: '=', value: 'CCCCCC' } ] })
    expect(result).toEqual({
      total: 1,
      rows: [ dataMap['c'] ],
    })

    const result2 = await search.search({ limit: 5, filters: [ { name: 'ref', op: '=', value: null } ] })
    expect(result2).toEqual({
      total: data.length / 2,
      rows: expect.toHaveLength(5),
    })

    result2.rows.forEach((row) => expect(row.ref).toBeNull())
  })

  it('should correctly use the "in" operator', async () => {
    const result = await search.search({ filters: [ { name: 'key', op: 'in', value: [ 'AAAAAA', 'CCCCCC', 'xxxxxx' ] } ] })
    expect(result).toEqual({
      total: 3,
      rows: [ dataMap['a'], dataMap['c'], dataMap['x'] ],
    })
  })

  it('should correctly use the "not in" operator', async () => {
    const result2 = await search.search({ limit: 0, filters: [ { name: 'key', op: 'not in', value: [ 'AAAAAA', 'CCCCCC', 'xxxxxx' ] } ] })
    expect(result2).toEqual({
      total: data.length - 3,
      rows: expect.toHaveLength(data.length - 3),
    })

    result2.rows.forEach((row) => {
      expect(row.key).not.toEqual('AAAAAA')
      expect(row.key).not.toEqual('CCCCCC')
      expect(row.key).not.toEqual('xxxxxx')
    })
  })

  it('should correctly use the "@>" operator', async () => {
    const result = await search.search({ filters: [ { name: 'json', op: '@>', value: { here: 'K' } } ] })
    expect(result).toEqual({
      total: 1,
      rows: [ dataMap['k'] ],
    })

    const result2 = await search.search({ filters: [ { name: 'json', op: '@>', value: { here: 'K', there: 'B', foo: 123 } } ] })
    expect(result2).toEqual({
      total: 0,
      rows: [],
    })
  })

  it('should correctly use the "<@" operator', async () => {
    const result = await search.search({ filters: [ { name: 'json', op: '<@', value: { here: 'K' } } ] })
    expect(result).toEqual({
      total: 0,
      rows: [],
    })

    const result2 = await search.search({ filters: [ { name: 'json', op: '<@', value: { here: 'K', there: 'B', foo: 123 } } ] })
    expect(result2).toEqual({
      total: 1,
      rows: [ dataMap['k'] ],
    })
  })

  it('should correctly query a field in a jsonb column', async () => {
    const result = await search.search({ filters: [ { name: 'json', field: 'there', value: null } ] })
    expect(result).toEqual({
      total: data.length / 2,
      rows: expect.toHaveLength(data.length / 2),
    })

    result.rows.forEach((row) => expect(row.json.there).toBeNull())

    const result2 = await search.search({ filters: [ { name: 'json', field: 'there', op: '<', value: 'C' } ] })
    expect(result2).toEqual({
      total: 2,
      rows: expect.toInclude([ dataMap['k'], dataMap['l'] ]), // querying "there"
    })

    // Intentionally break typing to test non-string field access
    await expect(search.search({ filters: [ { name: 'json', op: '@>', field: 'array', value: [ 1 ] } ] } as any))
        .toBeRejectedWithError('Field "array" cannot be specified when using JSONB operator "@>" for column "json"')
  })

  it('should correctly combine filters with an extra condition', async () => {
    const result = await search.search({
      filters: [ { name: 'key', op: 'in', value: [ 'AAAAAA', 'CCCCCC', 'xxxxxx' ] } ],
    }, {
      where: '"number" < $1 AND "number" > $2',
      params: [ 1023, 1018 ],
    })
    expect(result).toEqual({
      total: 1,
      rows: [ dataMap['c'] ],
    })
  })

  it('should not remove the search column when not specified', async () => {
    const search = new Search(persister, 'main', joins)

    const result = await search.search({
      filters: [ { name: 'key', value: 'AAAAAA' } ],
    })
    expect(result).toEqual({
      total: 1,
      rows: [ { ...dataMap['a'], _search: expect.toBeA('string') } ],
    })
  })

  it('should not join extra tables when no joins are specified', async () => {
    const expected = structuredClone(dataMap['a'])
    delete expected.referenced

    const search = new Search(persister, 'main', '_search')
    const result = await search.search({
      filters: [ { name: 'key', value: 'AAAAAA' } ],
    })

    expect(result).toEqual({
      total: 1,
      rows: [ expected ],
    })

    const search2 = new Search(persister, 'main')
    const result2 = await search2.search({
      filters: [ { name: 'key', value: 'AAAAAA' } ],
    })

    expect(result2).toEqual({
      total: 1,
      rows: [ { ...expected, _search: expect.toBeA('string') } ],
    })
  })

  it('should correctly find the correct first result', async () => {
    const result = await search.find({
      filters: [ { name: 'key', op: 'in', value: [ 'BBBBBB', 'CCCCCC', 'DDDDDD' ] } ],
      sort: 'key',
      order: 'desc',
    })
    expect(result).toEqual(dataMap['d'])

    const result2 = await search.find({
      filters: [ { name: 'key', value: 'this does not exist' } ],
    })
    expect(result2).toBeUndefined()
  })
})

/* ========================================================================== *
 * TEST DATA                                                                  *
 * ========================================================================== */

const data = [ {
  key: 'AAAAAA',
  ref: '2b9c4b69-b584-4c63-a6c3-28a7583c6233',
  date: new Date('2001-01-01T01:01:01.000Z'),
  json: { here: 'A', there: 'L' },
  uuid: 'b13bad8a-2b69-4614-82ab-5884ab380a4f',
  number: 1024,
  referenced: { key: 'L', date: null, uuid: '2b9c4b69-b584-4c63-a6c3-28a7583c6233' },
}, {
  key: 'BBBBBB',
  ref: 'a2229338-260c-4c9f-ac89-92c2bdc4d582',
  date: new Date('2002-02-02T02:02:02.000Z'),
  json: { here: 'B', there: 'K' },
  uuid: '0fc8a71e-0a46-4d15-b287-6338e10f9d33',
  number: 1023,
  referenced: { key: 'K', date: new Date('2006-06-06T06:06:06.000Z'), uuid: 'a2229338-260c-4c9f-ac89-92c2bdc4d582' },
}, {
  key: 'CCCCCC',
  ref: '97d26faf-c77b-4ae2-971c-2f6704d79258',
  date: new Date('2003-03-03T03:03:03.000Z'),
  json: { here: 'C', there: 'J' },
  uuid: '512e04aa-9820-41ee-9b3f-54960844e43e',
  number: 1022,
  referenced: { key: 'J', date: null, uuid: '97d26faf-c77b-4ae2-971c-2f6704d79258' },
}, {
  key: 'DDDDDD',
  ref: '6f709728-55db-447e-b17e-eab00dc72fc4',
  date: new Date('2004-04-04T04:04:04.000Z'),
  json: { here: 'D', there: 'I' },
  uuid: '753cdc51-2823-4036-ac57-f4832b4adb7d',
  number: 1021,
  referenced: { key: 'I', date: new Date('2005-05-05T05:05:05.000Z'), uuid: '6f709728-55db-447e-b17e-eab00dc72fc4' },
}, {
  key: 'EEEEEE',
  ref: 'd17577e4-5874-46ba-8ea8-062e765db9c0',
  date: new Date('2005-05-05T05:05:05.000Z'),
  json: { here: 'E', there: 'H' },
  uuid: '222df885-470a-4f1d-a2e3-a75d50a4d503',
  number: 1020,
  referenced: { key: 'H', date: null, uuid: 'd17577e4-5874-46ba-8ea8-062e765db9c0' },
}, {
  key: 'FFFFFF',
  ref: '3292abc3-6f66-4fe0-a4f2-f1c7c8427abd',
  date: new Date('2006-06-06T06:06:06.000Z'),
  json: { here: 'F', there: 'G' },
  uuid: 'fbbc36da-0fa9-4fc0-8659-6ffafd14ce9c',
  number: 1019,
  referenced: { key: 'G', date: new Date('2004-04-04T04:04:04.000Z'), uuid: '3292abc3-6f66-4fe0-a4f2-f1c7c8427abd' },
}, {
  key: 'GGGGGG',
  ref: 'b9f5b9b1-71d6-48c4-ab40-453b4005fc4c',
  date: new Date('2007-07-07T07:07:07.000Z'),
  json: { here: 'G', there: 'F' },
  uuid: '591e0f96-b6c8-4433-8b6d-877d7bafd6d0',
  number: 1018,
  referenced: { key: 'F', date: null, uuid: 'b9f5b9b1-71d6-48c4-ab40-453b4005fc4c' },
}, {
  key: 'HHHHHH',
  ref: '8046239b-3c96-4f25-b377-96122471442c',
  date: new Date('2008-08-08T08:08:08.000Z'),
  json: { here: 'H', there: 'E' },
  uuid: 'e5888b2c-5620-406f-8892-1205cf89e6a9',
  number: 1017,
  referenced: { key: 'E', date: new Date('2003-03-03T03:03:03.000Z'), uuid: '8046239b-3c96-4f25-b377-96122471442c' },
}, {
  key: 'IIIIII',
  ref: 'e7c1a331-18f8-4b0b-b4f4-0ca14ea9a0a1',
  date: new Date('2009-09-09T09:09:09.000Z'),
  json: { here: 'I', there: 'D' },
  uuid: '3a8bf731-e640-4b54-b539-99c5d95e1a1b',
  number: 1016,
  referenced: { key: 'D', date: null, uuid: 'e7c1a331-18f8-4b0b-b4f4-0ca14ea9a0a1' },
}, {
  key: 'JJJJJJ',
  ref: '4e4dc69b-a0ef-478f-a928-8e8fbddb5f58',
  date: new Date('2010-10-10T10:10:10.000Z'),
  json: { here: 'J', there: 'C' },
  uuid: '217c98ba-012a-4e59-8ec3-4c819b56ce99',
  number: 1015,
  referenced: { key: 'C', date: new Date('2002-02-02T02:02:02.000Z'), uuid: '4e4dc69b-a0ef-478f-a928-8e8fbddb5f58' },
}, {
  key: 'KKKKKK',
  ref: 'b24ddae4-5877-41ab-9472-0789606d4e4f',
  date: new Date('2011-11-11T11:11:11.000Z'),
  json: { here: 'K', there: 'B' },
  uuid: 'b461aba5-e413-4536-99f8-efbb740e20be',
  number: 1014,
  referenced: { key: 'B', date: null, uuid: 'b24ddae4-5877-41ab-9472-0789606d4e4f' },
}, {
  key: 'LLLLLL',
  ref: 'e1a19dbe-17e5-44a1-b3d6-bceb707e1131',
  date: new Date('2012-12-12T12:12:12.000Z'),
  json: { here: 'L', there: 'A' },
  uuid: 'ff2aae89-5297-4502-9df8-d4e54846898f',
  number: 1013,
  referenced: { key: 'A', date: new Date('2001-01-01T01:01:01.000Z'), uuid: 'e1a19dbe-17e5-44a1-b3d6-bceb707e1131' },
}, {
  key: 'mmmmmm',
  ref: null,
  date: new Date('2013-01-13T13:13:13.000Z'),
  json: { here: 'm', there: null },
  uuid: '03af3cb8-c110-4863-960f-061f677991b3',
  number: 1012,
  referenced: null,
}, {
  key: 'nnnnnn',
  ref: null,
  date: new Date('2014-02-14T14:14:14.000Z'),
  json: { here: 'n', there: null },
  uuid: '42738a2c-392d-494d-be40-b244671e2f6f',
  number: 1011,
  referenced: null,
}, {
  key: 'oooooo',
  ref: null,
  date: new Date('2015-03-15T15:15:15.000Z'),
  json: { here: 'o', there: null },
  uuid: '1daf89df-5796-4148-a650-c6dfe3bc642b',
  number: 1010,
  referenced: null,
}, {
  key: 'pppppp',
  ref: null,
  date: new Date('2016-04-16T16:16:16.000Z'),
  json: { here: 'p', there: null },
  uuid: '16e65c9a-2e69-4aed-bded-47ff8dc1776c',
  number: 1009,
  referenced: null,
}, {
  key: 'qqqqqq',
  ref: null,
  date: new Date('2017-05-17T17:17:17.000Z'),
  json: { here: 'q', there: null },
  uuid: '52965c03-211d-4618-959a-20276787a1b4',
  number: 1008,
  referenced: null,
}, {
  key: 'rrrrrr',
  ref: null,
  date: new Date('2018-06-18T18:18:18.000Z'),
  json: { here: 'r', there: null },
  uuid: 'ae4a2e0f-0039-4765-bd3e-33670e914a3e',
  number: 1007,
  referenced: null,
}, {
  key: 'ssssss',
  ref: null,
  date: new Date('2019-07-19T19:19:19.000Z'),
  json: { here: 's', there: null },
  uuid: '3014822a-d093-477c-aea8-cea8d405b80d',
  number: 1006,
  referenced: null,
}, {
  key: 'tttttt',
  ref: null,
  date: new Date('2020-08-20T20:20:20.000Z'),
  json: { here: 't', there: null },
  uuid: '47a117ed-302a-4245-a117-35d21dad2da6',
  number: 1005,
  referenced: null,
}, {
  key: 'uuuuuu',
  ref: null,
  date: new Date('2021-09-21T21:21:21.000Z'),
  json: { here: 'u', there: null },
  uuid: '7570411f-a9dc-426d-83fd-98e9077f981d',
  number: 1004,
  referenced: null,
}, {
  key: 'vvvvvv',
  ref: null,
  date: new Date('2021-10-21T21:21:21.000Z'),
  json: { here: 'v', there: null },
  uuid: '8ec67acd-b1c3-48c5-bdb0-db38ef58594a',
  number: 1003,
  referenced: null,
}, {
  key: 'wwwwww',
  ref: null,
  date: new Date('2021-11-21T21:21:21.000Z'),
  json: { here: 'w', there: null },
  uuid: '9101f3be-3f8c-4c3b-b4fd-f6c1348fe996',
  number: 1002,
  referenced: null,
}, {
  key: 'xxxxxx',
  ref: null,
  date: new Date('2021-12-21T21:21:21.000Z'),
  json: { here: 'x', there: null },
  uuid: '1231e580-4b55-4e71-9562-2a867b0f5f4e',
  number: 1001,
  referenced: null,
} ]

const dataMap = data.reduce((map, item) => {
  map[item.key.slice(0, 1).toLowerCase()] = item
  return map
}, {} as Record<string, any>)
