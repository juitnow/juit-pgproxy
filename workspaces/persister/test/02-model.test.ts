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
        '!QUERY',
        'INSERT INTO "mySchema"."myTable" DEFAULT VALUES RETURNING *',
        [],
      ] ])
    })

    it('should create with a single-key object', async () => {
      expect(await model.create({ foo: 'bar' })).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY',
        'INSERT INTO "mySchema"."myTable" ("foo") VALUES ($1) RETURNING *',
        [ 'bar' ],
      ] ])
    })

    it('should create with a multiple-keys object', async () => {
      expect(await model.create({ foo: 'bar', hello: new Date(0) })).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY',
        'INSERT INTO "mySchema"."myTable" ("foo","hello") VALUES ($1,$2) RETURNING *',
        [ 'bar', '1970-01-01T00:00:00.000+00:00' ],
      ] ])
    })

    it('should create with nulls and ignore undefined', async () => {
      expect(await model.create({ foo: null, hello: undefined })).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY',
        'INSERT INTO "mySchema"."myTable" ("foo") VALUES ($1) RETURNING *',
        [ null ],
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
        '!QUERY',
        'INSERT INTO "mySchema"."myTable" ("myKey","foo") VALUES ($1,$2) ON CONFLICT ("myKey") DO UPDATE SET "foo"=$3 RETURNING *',
        [ '123', 'bar', 'bar' ],
      ] ])
    })

    it('should upsert with a multiple-keys object', async () => {
      expect(await model.upsert({ myKey: 123, anotherKey: true }, { foo: 'bar', hello: 'world' })).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY',
        'INSERT INTO "mySchema"."myTable" ("myKey","anotherKey","foo","hello") VALUES ($1,$2,$3,$4) ON CONFLICT ("myKey","anotherKey") DO UPDATE SET "foo"=$5,"hello"=$6 RETURNING *',
        [ '123', 't', 'bar', 'world', 'bar', 'world' ],
      ] ])
    })

    it('should upsert with nulls and ignore undefined', async () => {
      expect(await model.upsert({ myKey: 123, anotherKey: null, undefinedKey: undefined }, { foo: null, hello: undefined })).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY',
        'INSERT INTO "mySchema"."myTable" ("myKey","anotherKey","foo") VALUES ($1,$2,$3) ON CONFLICT ("myKey","anotherKey") DO UPDATE SET "foo"=$4 RETURNING *',
        [ '123', null, null, null ],
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
        '!QUERY',
        'SELECT * FROM "mySchema"."myTable"',
        [],
      ] ])
    })

    it('should read objects with a single query parameter', async () => {
      expect(await model.read({ foo: 'bar' })).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY',
        'SELECT * FROM "mySchema"."myTable" WHERE "foo"=$1',
        [ 'bar' ],
      ] ])
    })

    it('should read objects with multiple query parameters', async () => {
      expect(await model.read({ foo: 'bar', hello: 123 })).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY',
        'SELECT * FROM "mySchema"."myTable" WHERE "foo"=$1 AND "hello"=$2',
        [ 'bar', '123' ],
      ] ])
    })

    it('should read objects with null query parameters and ingnore undefined', async () => {
      expect(await model.read({ foo: 'bar', hello: null, world: undefined })).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY',
        'SELECT * FROM "mySchema"."myTable" WHERE "foo"=$1 AND "hello" IS NULL',
        [ 'bar' ],
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
        '!ACQUIRE',
        [ '!CONNQUERY', 'SELECT * FROM "public"."anotherTable" WHERE "foo"=$1 OFFSET $2 LIMIT $3', [ 'bar', '123', '321' ] ],
        [ '!CONNQUERY', 'SELECT * FROM "public"."anotherTable" WHERE "foo"=$1 LIMIT $2', [ 'bar', '321' ] ],
        [ '!CONNQUERY', 'SELECT * FROM "public"."anotherTable" WHERE "foo"=$1 LIMIT $2', [ 'bar', '321' ] ],
        [ '!CONNQUERY', 'SELECT * FROM "public"."anotherTable" WHERE "foo"=$1 OFFSET $2', [ 'bar', '123' ] ],
        [ '!CONNQUERY', 'SELECT * FROM "public"."anotherTable" WHERE "foo"=$1 OFFSET $2', [ 'bar', '123' ] ],
        '!RELEASE',
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
        [ '!QUERY', 'SELECT * FROM "mySchema"."myTable" ORDER BY "sort1"', [] ],
        [ '!QUERY', 'SELECT * FROM "mySchema"."myTable" ORDER BY "sort1","sort2"', [] ],
        [ '!QUERY', 'SELECT * FROM "mySchema"."myTable" ORDER BY "sort1" ASC,"sort2" DESC', [] ],
        [ '!QUERY', 'SELECT * FROM "mySchema"."myTable" ORDER BY "SORT1" DESC,"SORT2" ASC', [] ],
        [ '!QUERY', 'SELECT * FROM "mySchema"."myTable" ORDER BY "foo bar baz"', [] ],
        // with query parameters
        [ '!QUERY', 'SELECT * FROM "mySchema"."myTable" WHERE "foo"=$1 ORDER BY "sort1"', [ 'bar' ] ],
        [ '!QUERY', 'SELECT * FROM "mySchema"."myTable" WHERE "foo"=$1 AND "hello"=$2 ORDER BY "sort1" ASC,"sort2" DESC', [ 'bar', '123' ] ],
      ])
    })
  })

  describe('find', () => {
    let model: Model<any>
    beforeAll(() => void (model = persister.in('mySchema.myTable')))

    it('should find the first objects', async () => {
      expect(await model.find()).toEqual(rows[0])

      expect(calls()).toEqual([ [
        '!QUERY', 'SELECT * FROM "mySchema"."myTable" LIMIT $1',
        [ '1' ],
      ] ])
    })
  })

  describe('update', () => {
    let model: Model<any>
    beforeAll(() => void (model = persister.in('mySchema.myTable')))

    it('should update an object with a patch', async () => {
      expect(await model.update({ query: 'myQuery' }, { patch: 'myPatch' })).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY',
        'UPDATE "mySchema"."myTable" SET "patch"=$1 WHERE "query"=$2 RETURNING *',
        [ 'myPatch', 'myQuery' ],
      ] ])
    })

    it('should update an object with multiple query parameters and patches', async () => {
      expect(await model.update({ query1: 'myQuery1', query2: 'myQuery2' }, { patch1: 'myPatch1', patch2: 'myPatch2' })).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY',
        'UPDATE "mySchema"."myTable" SET "patch1"=$1,"patch2"=$2 WHERE "query1"=$3 AND "query2"=$4 RETURNING *',
        [ 'myPatch1', 'myPatch2', 'myQuery1', 'myQuery2' ],
      ] ])
    })

    it('should update an object with nulls and ignore undefined', async () => {
      expect(await model.update({ query1: null, query2: undefined }, { patch1: null, patch2: undefined })).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY',
        'UPDATE "mySchema"."myTable" SET "patch1"=$1 WHERE "query1" IS NULL RETURNING *',
        [ null ],
      ] ])
    })

    it('should select instead of update with no patches', async () => {
      expect(await model.update({ query1: 'myQuery1', query2: 'myQuery2' }, {})).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY',
        'SELECT * FROM "mySchema"."myTable" WHERE "query1"=$1 AND "query2"=$2',
        [ 'myQuery1', 'myQuery2' ],
      ] ])
    })

    it('should select all rows when updating with no parameters', async () => {
      expect(await model.update({}, {})).toEqual(rows)

      expect(calls()).toEqual([ [
        '!QUERY',
        'SELECT * FROM "mySchema"."myTable"',
        [],
      ] ])
    })

    it('should NOT update all objects', async () => {
      await expect(model.update({}, { patch: 'myPatch' })).toBeRejectedWithError(/^Cowardly refusing to run UPDATE with empty query/)
      await expect(model.update({ foo: undefined }, { patch: 'myPatch' })).toBeRejectedWithError(/^Cowardly refusing to run UPDATE with empty query/)
      expect(calls()).toEqual([])
    })
  })

  describe('delete', () => {
    let model: Model<any>
    beforeAll(() => void (model = persister.in('mySchema.myTable')))

    it('should delete with a single query parameter', async () => {
      expect(await model.delete({ foo: 'bar' })).toStrictlyEqual(3)
      expect(calls()).toEqual([ [
        '!QUERY',
        'DELETE FROM "mySchema"."myTable" WHERE "foo"=$1 RETURNING *',
        [ 'bar' ],
      ] ])
    })

    it('should delete with multiple query parameter', async () => {
      expect(await model.delete({ foo: 'bar', hello: 123 })).toStrictlyEqual(3)
      expect(calls()).toEqual([ [
        '!QUERY',
        'DELETE FROM "mySchema"."myTable" WHERE "foo"=$1 AND "hello"=$2 RETURNING *',
        [ 'bar', '123' ],
      ] ])
    })

    it('should delete with nulls and ignore undefined', async () => {
      expect(await model.delete({ foo: null, hello: undefined })).toStrictlyEqual(3)
      expect(calls()).toEqual([ [
        '!QUERY',
        'DELETE FROM "mySchema"."myTable" WHERE "foo" IS NULL RETURNING *',
        [],
      ] ])
    })

    it('should NOT delete all objects', async () => {
      await expect(model.delete({})).toBeRejectedWithError(/^Cowardly refusing to run DELETE with empty query/)
      await expect(model.delete({ foo: undefined })).toBeRejectedWithError(/^Cowardly refusing to run DELETE with empty query/)
      expect(calls()).toEqual([])
    })
  })
})
