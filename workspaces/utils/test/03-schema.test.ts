import { Persister } from '@juit/pgproxy-persister'
import { $gry } from '@plugjs/build'

import { createdb, dropdb, generateSchema, serializeSchema } from '../src'

describe('Schema Extractor', async () => {
  const dbname = await createdb()

  beforeAll(async () => {
    const persister = new Persister(dbname)
    try {
      await persister.connect(async (connection) => {
        await connection.query(`
          CREATE TABLE "users" (
            "id"     SERIAL PRIMARY KEY,
            "name"   VARCHAR(64),
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
    expect(schema).toEqual({
      users: {
        id: { isNullable: false, hasDefault: true, oid: 23 },
        name: { isNullable: true, hasDefault: false, oid: 1043 },
        email: { isNullable: false, hasDefault: false, oid: 1043 },
        time: { isNullable: true, hasDefault: true, oid: 1184 },
      },
    })
  })

  it('should generate a schema definition for a different schema name', async () => {
    const schema = await generateSchema(dbname, [ 'my\'Schema' ])
    expect(schema).toEqual({
      'my\'Schema.my\'Table': {
        'my\'Data': { isNullable: true, hasDefault: false, oid: 17 },
      },
    })
  })

  it('should generate a schema definition for multiple schema names', async () => {
    const schema = await generateSchema(dbname, [ 'public', 'my\'Schema' ])
    expect(schema).toEqual({
      'users': {
        'id': { isNullable: false, hasDefault: true, oid: 23 },
        'name': { isNullable: true, hasDefault: false, oid: 1043 },
        'email': { isNullable: false, hasDefault: false, oid: 1043 },
        'time': { isNullable: true, hasDefault: true, oid: 1184 },
      },
      'my\'Schema.my\'Table': {
        'my\'Data': { isNullable: true, hasDefault: false, oid: 17 },
      },
    })
  })

  it('should serialize a schema definition', async () => {
    const schema = await generateSchema(dbname, [ 'public', 'my\'Schema' ])
    const source = serializeSchema(schema, 'mySchema')

    log.notice(source.trim().split('\n').map((s) => `${$gry('|')} ${s}`).join('\n'))

    expect(source.split('\n')).toEqual([
      'import { Persister } from \'@juit/pgproxy-persister\'',
      '',
      'import type { Schema } from \'@juit/pgproxy-persister\'',
      '',
      'export const mySchema = {',
      '  /** A wicked table comment */',
      '  \'my\\\'Schema.my\\\'Table\': {',
      '    /** A wicked column comment */',
      '    \'my\\\'Data\': { oid: 17, isNullable: true, hasDefault: false },',
      '  },',
      '  \'users\': {',
      '    \'id\': { oid: 23, isNullable: false, hasDefault: true },',
      '    \'name\': { oid: 1043, isNullable: true, hasDefault: false },',
      '    \'email\': { oid: 1043, isNullable: false, hasDefault: false },',
      '    \'time\': { oid: 1184, isNullable: true, hasDefault: true },',
      '  },',
      '} as const satisfies Schema',
      '',
      'export const MySchemaPersister = Persister.with(mySchema)',
      '', // final newline!
    ])
  })
})
