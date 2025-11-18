import { PGClient } from '@juit/pgproxy-client'
// side-effect import to register the psql protocol
import '@juit/pgproxy-client-psql'

import { createdb, dropdb, extractSchema } from '../src'

describe('Schema Extractor', () => {
  let dbname: string

  beforeAll(async () => {
    dbname = await createdb()
    await using client = new PGClient(dbname)
    await using connection = await client.connect()

    await connection.query(`
      CREATE TYPE "user_type" AS ENUM ('company', 'individual');
      CREATE TABLE "users" (
        "id"     INT GENERATED ALWAYS AS IDENTITY,
        "name"   VARCHAR(64),
        "type"   user_type,
        "email"  VARCHAR(64) NOT NULL,
        "time"   TIMESTAMPTZ DEFAULT NOW(),
        "_hide"  VARCHAR(64)
      );
      CREATE TABLE "$hide" (
        "test"  VARCHAR(64)
      );
      COMMENT ON TABLE "users" IS '    ';
      CREATE SCHEMA "my'Schema";
      CREATE TABLE "my'Schema"."my'Table" (
        "my'Data"   BYTEA
      );
      COMMENT ON TABLE "my'Schema"."my'Table" IS '  A wicked table comment  ';
      COMMENT ON COLUMN "my'Schema"."my'Table"."my'Data" IS '  A wicked column comment  ';
    `)
  })

  afterAll(async () => {
    await dropdb(dbname)
  })

  it('should extract a schema definition', async () => {
    const schema = await extractSchema(dbname)

    expect(schema).toEqual({
      users: {
        id: { oid: 23, isGenerated: true, isNullable: false, hasDefault: false },
        name: { oid: 1043, isGenerated: false, isNullable: true, hasDefault: false },
        email: { oid: 1043, isGenerated: false, isNullable: false, hasDefault: false },
        time: { oid: 1184, isGenerated: false, isNullable: true, hasDefault: true },
        type: {
          oid: expect.toBeA('number'),
          isGenerated: false,
          isNullable: true,
          hasDefault: false,
          enumValues: expect.toMatchContents([ 'company', 'individual' ]),
        },
      },
    })
  })

  it('should extract a schema definition for a different schema name', async () => {
    const schema = await extractSchema(dbname, [ 'my\'Schema' ])
    // log.warn(schema)
    expect(schema).toEqual({
      'my\'Schema.my\'Table': {
        'my\'Data': {
          oid: 17,
          isGenerated: false,
          isNullable: true,
          hasDefault: false,
          description: 'A wicked column comment',
        },
      },
    })
  })

  it('should extract a schema definition for multiple schema names', async () => {
    const schema = await extractSchema(dbname, [ 'public', 'my\'Schema' ])
    // log.warn(schema)
    expect(schema).toEqual({
      'users': {
        id: { oid: 23, isGenerated: true, isNullable: false, hasDefault: false },
        name: { oid: 1043, isGenerated: false, isNullable: true, hasDefault: false },
        email: { oid: 1043, isGenerated: false, isNullable: false, hasDefault: false },
        time: { oid: 1184, isGenerated: false, isNullable: true, hasDefault: true },
        type: {
          oid: expect.toBeA('number'),
          isGenerated: false,
          isNullable: true,
          hasDefault: false,
          enumValues: expect.toMatchContents([ 'company', 'individual' ]),
        },
      },
      'my\'Schema.my\'Table': {
        'my\'Data': {
          oid: 17,
          isGenerated: false,
          isNullable: true,
          hasDefault: false,
          description: 'A wicked column comment',
        },
      },
    })
  })

  it('should extract a schema definition including hidden tables and columns', async () => {
    const schema = await extractSchema(dbname, [ 'public' ], true)
    log.warn(schema)
    expect(schema).toEqual({
      $hide: {
        test: { oid: 1043, isGenerated: false, isNullable: true, hasDefault: false },
      },
      users: {
        id: { oid: 23, isGenerated: true, isNullable: false, hasDefault: false },
        name: { oid: 1043, isGenerated: false, isNullable: true, hasDefault: false },
        email: { oid: 1043, isGenerated: false, isNullable: false, hasDefault: false },
        time: { oid: 1184, isGenerated: false, isNullable: true, hasDefault: true },
        type: {
          oid: expect.toBeA('number'),
          isGenerated: false,
          isNullable: true,
          hasDefault: false,
          enumValues: expect.toMatchContents([ 'company', 'individual' ]),
        },
        _hide: { oid: 1043, isGenerated: false, isNullable: true, hasDefault: false },
      },
    })
  })
})
