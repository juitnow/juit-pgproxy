import { createdb, dropdb, migrate } from '@juit/pgproxy-utils'
import { paths } from '@plugjs/build'
// side-effect import to register the psql protocol
import '@juit/pgproxy-client-psql'

import { Persister, Search } from '../src'


import type { SearchJoins } from '../src/search'
import type { TestSchema } from './test-schema'

describe('Search (Query Execution)', () => {
  const joins = {
    referenced: { column: 'ref', refTable: 'joined', refColumn: 'uuid', sortColumn: 'key' },
  } as const satisfies SearchJoins<TestSchema>

  let data: any[]
  let dataMap: Record<string, any> = {}
  let persister: Persister<TestSchema>
  let dbname: string
  let search: Search<TestSchema, 'main', typeof joins>

  beforeAll(async () => {
    dbname = await createdb()
    const migrations = paths.requireFilename(__fileurl, 'sql')
    await migrate(dbname, { migrations })

    persister = new Persister<TestSchema>(dbname)

    // Read up our test data
    const mainData = await persister.in('main').read()
    const joinedData = await persister.in('joined').read()

    data = mainData.map((row) => {
      const clone = structuredClone(row)
      const referenced = joinedData.find((joined) => joined.uuid === row.ref) || null
      if (referenced?.json?.date) referenced.json.date = new Date(referenced.json.date)
      delete (clone as any)._search // won't appear in types, as it's underscored
      return { ...clone, referenced }
    })

    dataMap = data.reduce((dataMap, item) => {
      dataMap[item.key.slice(0, 1).toLowerCase()] = item
      return dataMap
    }, {} as Record<string, any>)

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
    const result = await search.search({ offset: 1000, limit: 100, sort: 'key' })
    expect(result).toEqual({
      total: data.length,
      rows: [],
    })

    const result2 = await search.search({ offset: 1000, limit: 100, sort: 'key', q: 'aaa' })
    expect(result2).toEqual({
      total: 1,
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

  it('should report the cause of query execution errors', async () => {
    const search = new Search(persister, 'main')

    await expect(search.search({ filters: [ { name: 'nonexistent', value: 'test' } ] } as any))
        .toBeRejected((assert) => {
          const message = assert.toBeError().value.message
          expect(message).toMatch(/Error executing search query:.*nonexistent*/)
          assert.toHaveProperty('cause', expect.toBeA('object').toEqual({
            sql: expect.toBeA('string'),
            params: expect.toBeA('array'),
            error: expect.toBeError(message.substring(30)),
          }))
        })
  })
})
