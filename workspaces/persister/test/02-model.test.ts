import { calls, persister } from './00-setup.test'

import type { Model } from '../src/index'

describe('Model', () => {
  const rows = [
    { foo: 'first', bar: 1234, baz: true },
    { foo: 'second', bar: null, baz: false },
    { foo: 'third', bar: 1234, baz: null },
  ] as const

  it('should expose a model', async () => {
    expect(persister.in('foo')).toBeDefined()
    expect(await persister.connect((connection) => {
      expect(connection.in('foo')).toBeDefined()
      return true
    })).toBeTrue()
  })

  it('should construct with various schemas', async () => {
    expect(persister.in('foobar')).toInclude({
      _schema: 'public',
      _table: 'foobar',
    })

    expect(persister.in('public.foobar')).toInclude({
      _schema: 'public',
      _table: 'foobar',
    })

    expect(persister.in('.foobar')).toInclude({
      _schema: 'public',
      _table: 'foobar',
    })

    expect(persister.in('myschema.foobar')).toInclude({
      _schema: 'myschema',
      _table: 'foobar',
    })

    expect(() => persister.in(''))
        .toThrowError('Invalid table name ""')
    expect(() => persister.in('.'))
        .toThrowError('Invalid table name "."')
    expect(() => persister.in('..'))
        .toThrowError('Invalid table name ".."')
    expect(() => persister.in('myschema.foobar.baz'))
        .toThrowError('Invalid table name "myschema.foobar.baz"')
  })

  /* ======================================================================== */

  describe('create', () => {
    let model: Model<any>
    beforeAll(() => void (model = persister.in('mySchema.myTable')))

    it('should create with defaults', async () => {
      expect(await model.create({})).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY[0]',
        'INSERT INTO "mySchema"."myTable" DEFAULT VALUES RETURNING *',
        [],
      ] ])
    })

    it('should create with a single-key object', async () => {
      expect(await model.create({ foo: 'bar' })).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY[0]',
        'INSERT INTO "mySchema"."myTable" ("foo") VALUES ($1) RETURNING *',
        [ 'bar' ],
      ] ])
    })

    it('should create with a multiple-keys object', async () => {
      expect(await model.create({ foo: 'bar', hello: new Date(0) })).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY[0]',
        'INSERT INTO "mySchema"."myTable" ("foo","hello") VALUES ($1,$2) RETURNING *',
        [ 'bar', '1970-01-01T00:00:00.000+00:00' ],
      ] ])
    })
  })

  /* ======================================================================== */

  describe('upsert', () => {
    let model: Model<any>
    beforeAll(() => void (model = persister.in('mySchema.myTable')))

    it('should not upsert without conflict keys or data', async () => {
      await expect(model.upsert({}, {}))
          .toBeRejectedWithError(/^Called UPSERT with no conflict keys/)
      await expect(model.upsert({ a: 1 }, {}))
          .toBeRejectedWithError(/^Called UPSERT with no updateable data/)
    })

    it('should upsert with a single-key object', async () => {
      expect(await model.upsert({ myKey: 123 }, { foo: 'bar' })).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY[0]',
        'INSERT INTO "mySchema"."myTable" ("myKey","foo") VALUES ($1,$2) ON CONFLICT ("myKey") DO UPDATE SET "foo"=$3 RETURNING *',
        [ '123', 'bar', 'bar' ],
      ] ])
    })

    it('should upsert with a multiple-keys object', async () => {
      expect(await model.upsert({ myKey: 123, anotherKey: true }, { foo: 'bar', hello: 'world' })).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY[0]',
        'INSERT INTO "mySchema"."myTable" ("myKey","anotherKey","foo","hello") VALUES ($1,$2,$3,$4) ON CONFLICT ("myKey","anotherKey") DO UPDATE SET "foo"=$5,"hello"=$6 RETURNING *',
        [ '123', 't', 'bar', 'world', 'bar', 'world' ],
      ] ])
    })
  })

  /* ======================================================================== */

  describe('read', () => {
    let model: Model<any>
    beforeAll(() => void (model = persister.in('mySchema.myTable')))

    it('should read all objects', async () => {
      expect(await model.read()).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY[0]',
        'SELECT * FROM "mySchema"."myTable"',
        [],
      ] ])
    })

    it('should read objects with a single query parameter', async () => {
      expect(await model.read({ foo: 'bar' })).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY[0]',
        'SELECT * FROM "mySchema"."myTable" WHERE "foo"=$1',
        [ 'bar' ],
      ] ])
    })

    it('should read objects with multiple query parameters', async () => {
      expect(await model.read({ foo: 'bar', hello: 123 })).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY[0]',
        'SELECT * FROM "mySchema"."myTable" WHERE "foo"=$1 AND "hello"=$2',
        [ 'bar', '123' ],
      ] ])
    })

    it('should read objects with offset and limit', async () => {
      await persister.connect(async (connection) => {
        const anotherModel = connection.in('anotherTable')

        expect(await anotherModel.read({ foo: 'bar' }, [], 123, 321)).toEqual(rows)
        expect(await anotherModel.read({ foo: 'bar' }, [], 0, 321)).toEqual(rows)
        expect(await anotherModel.read({ foo: 'bar' }, [], undefined, 321)).toEqual(rows)
        expect(await anotherModel.read({ foo: 'bar' }, [], 123, 0)).toEqual(rows)
        expect(await anotherModel.read({ foo: 'bar' }, [], 123)).toEqual(rows)
      })

      expect(calls()).toEqual([
        '!ACQUIRE[0]',
        [ '!CONNQUERY[0]', 'SELECT * FROM "public"."anotherTable" WHERE "foo"=$1 OFFSET $2 LIMIT $3', [ 'bar', '123', '321' ] ],
        [ '!CONNQUERY[0]', 'SELECT * FROM "public"."anotherTable" WHERE "foo"=$1 LIMIT $2', [ 'bar', '321' ] ],
        [ '!CONNQUERY[0]', 'SELECT * FROM "public"."anotherTable" WHERE "foo"=$1 LIMIT $2', [ 'bar', '321' ] ],
        [ '!CONNQUERY[0]', 'SELECT * FROM "public"."anotherTable" WHERE "foo"=$1 OFFSET $2', [ 'bar', '123' ] ],
        [ '!CONNQUERY[0]', 'SELECT * FROM "public"."anotherTable" WHERE "foo"=$1 OFFSET $2', [ 'bar', '123' ] ],
        '!RELEASE[0]',
      ])
    })

    it('should read and sort', async () => {
      expect(await model.read({}, 'sort1')).toEqual(rows)
      expect(await model.read({}, [ 'sort1', 'sort2' ])).toEqual(rows)
      expect(await model.read({}, [ 'sort1 ASC', 'sort2 DESC' ])).toEqual(rows)
      expect(await model.read({}, [ 'SORT1 desc', 'SORT2 asc' ])).toEqual(rows)
      expect(await model.read({}, 'foo bar baz')).toEqual(rows)
      // with query parameters
      expect(await model.read({ foo: 'bar' }, 'sort1')).toEqual(rows)
      expect(await model.read({ foo: 'bar', hello: 123 }, [ 'sort1 ASC', 'sort2 DESC' ])).toEqual(rows)

      expect(calls()).toEqual([
        [ '!QUERY[0]', 'SELECT * FROM "mySchema"."myTable" ORDER BY "sort1"', [] ],
        [ '!QUERY[0]', 'SELECT * FROM "mySchema"."myTable" ORDER BY "sort1","sort2"', [] ],
        [ '!QUERY[0]', 'SELECT * FROM "mySchema"."myTable" ORDER BY "sort1" ASC,"sort2" DESC', [] ],
        [ '!QUERY[0]', 'SELECT * FROM "mySchema"."myTable" ORDER BY "SORT1" DESC,"SORT2" ASC', [] ],
        [ '!QUERY[0]', 'SELECT * FROM "mySchema"."myTable" ORDER BY "foo bar baz"', [] ],
        // with query parameters
        [ '!QUERY[0]', 'SELECT * FROM "mySchema"."myTable" WHERE "foo"=$1 ORDER BY "sort1"', [ 'bar' ] ],
        [ '!QUERY[0]', 'SELECT * FROM "mySchema"."myTable" WHERE "foo"=$1 AND "hello"=$2 ORDER BY "sort1" ASC,"sort2" DESC', [ 'bar', '123' ] ],
      ])
    })
  })

  describe('find', () => {
    let model: Model<any>
    beforeAll(() => void (model = persister.in('mySchema.myTable')))

    it('should find the first objects', async () => {
      expect(await model.find()).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY[0]', 'SELECT * FROM "mySchema"."myTable" LIMIT $1',
        [ '1' ],
      ] ])
    })
  })
})
