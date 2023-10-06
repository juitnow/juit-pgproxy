import { Persister } from '@juit/pgproxy-persister'

import { createdb, dropdb, generateSchema } from '../src'

describe('Schema Extractor', async () => {
  const dbname = await createdb()

  beforeAll(async () => {
    const persister = new Persister(dbname)
    try {
      await persister.connect(async (connection) => {
        await connection.query(`
          CREATE TYPE "user_type" AS ENUM ('company', 'individual');
          CREATE TABLE "users" (
            "id"     SERIAL PRIMARY KEY,
            "name"   VARCHAR(64),
            "type"   user_type,
            "email"  VARCHAR(64) NOT NULL,
            "time"   TIMESTAMPTZ DEFAULT NOW()
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
    } finally {
      await persister.destroy()
    }
  })

  afterAll(async () => {
    await dropdb(dbname)
  })

  it('should generate a schema definition', async () => {
    const schema = await generateSchema(dbname)
    // log.warn(schema)
    expect(schema).toEqual({
      users: {
        id: { oid: 23, isNullable: false, hasDefault: true },
        name: { oid: 1043, isNullable: true, hasDefault: false },
        email: { oid: 1043, isNullable: false, hasDefault: false },
        time: { oid: 1184, isNullable: true, hasDefault: true },
        type: {
          oid: expect.toBeA('number'),
          isNullable: true,
          hasDefault: false,
          enumValues: expect.toMatchContents([ 'company', 'individual' ]),
        },
      },
    })
  })

  it('should generate a schema definition for a different schema name', async () => {
    const schema = await generateSchema(dbname, [ 'my\'Schema' ])
    // log.warn(schema)
    expect(schema).toEqual({
      'my\'Schema.my\'Table': {
        'my\'Data': {
          oid: 17,
          isNullable: true,
          hasDefault: false,
          description: 'A wicked column comment',
        },
      },
    })
  })

  it('should generate a schema definition for multiple schema names', async () => {
    const schema = await generateSchema(dbname, [ 'public', 'my\'Schema' ])
    // log.warn(schema)
    expect(schema).toEqual({
      'users': {
        id: { oid: 23, isNullable: false, hasDefault: true },
        name: { oid: 1043, isNullable: true, hasDefault: false },
        email: { oid: 1043, isNullable: false, hasDefault: false },
        time: { oid: 1184, isNullable: true, hasDefault: true },
        type: {
          oid: expect.toBeA('number'),
          isNullable: true,
          hasDefault: false,
          enumValues: expect.toMatchContents([ 'company', 'individual' ]),
        },
      },
      'my\'Schema.my\'Table': {
        'my\'Data': {
          oid: 17,
          isNullable: true,
          hasDefault: false,
          description: 'A wicked column comment',
        },
      },
    })
  })

  // it('should serialize a schema definition', async () => {
  //   const schema = await generateSchema(dbname, [ 'public', 'my\'Schema' ])
  //   const source = serializeSchema(schema, 'mySchema')

  //   log.notice(source.trim().split('\n').map((s) => `${$gry('|')} ${s}`).join('\n'))

  //   expect(source.split('\n')).toEqual([
  //     'import { Persister } from \'@juit/pgproxy-persister\'',
  //     '',
  //     'import type { Schema } from \'@juit/pgproxy-persister\'',
  //     '',
  //     'export const mySchema = {',
  //     '  /** A wicked table comment */',
  //     '  \'my\\\'Schema.my\\\'Table\': {',
  //     '    /** A wicked column comment */',
  //     '    \'my\\\'Data\': { oid: 17, isNullable: true, hasDefault: false },',
  //     '  },',
  //     '  \'users\': {',
  //     '    \'id\': { oid: 23, isNullable: false, hasDefault: true },',
  //     '    \'name\': { oid: 1043, isNullable: true, hasDefault: false },',
  //     '    \'email\': { oid: 1043, isNullable: false, hasDefault: false },',
  //     '    \'time\': { oid: 1184, isNullable: true, hasDefault: true },',
  //     '  },',
  //     '} as const satisfies Schema',
  //     '',
  //     'export const MySchemaPersister = Persister.with(mySchema)',
  //     '', // final newline!
  //   ])
  // })
})
