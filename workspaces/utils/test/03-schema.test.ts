import { randomUUID } from 'node:crypto'

import { PGClient } from '@juit/pgproxy-client'
import '@juit/pgproxy-client-psql'
import { $gry, $ylw } from '@plugjs/build'

import { generateSchema, serializeSchema } from '../src'

describe('Schema Extractor', () => {
  const databaseName = `test-${randomUUID()}`

  beforeAll(async () => {
    log.notice(`Creating database ${$ylw(databaseName)}`)

    const client1 = new PGClient('psql:///postgres')
    try {
      await client1.query(`CREATE DATABASE "${databaseName}"`)

      const client2 = new PGClient(`psql:///${databaseName}`)
      try {
        await client2.connect(async (connection) => {
          await connection.query(`
            CREATE TABLE "users" (
              "id"     SERIAL PRIMARY KEY,
              "name"   VARCHAR(64),
              "email"  VARCHAR(64) NOT NULL,
              "time"   TIMESTAMPTZ DEFAULT NOW()
            )`)
          await connection.query('COMMENT ON TABLE "users" IS \'    \'')

          await connection.query('CREATE SCHEMA "my\'Schema"')

          await connection.query(`
            CREATE TABLE "my'Schema"."my'Table" (
              "my'Data"   BYTEA
            )`)
          await connection.query('COMMENT ON TABLE "my\'Schema"."my\'Table" IS \'  A wicked table comment  \'')
          await connection.query('COMMENT ON COLUMN "my\'Schema"."my\'Table"."my\'Data" IS \'  A wicked column comment  \'')
        })
      } catch (error) {
        await client2.destroy()
        await client1.query(`DROP DATABASE "${databaseName}"`)
        throw error
      } finally {
        await client2.destroy()
      }
    } finally {
      await client1.destroy()
    }
  })

  afterAll(async () => {
    log.notice(`Dropping database ${$ylw(databaseName)}`)
    const client = new PGClient('psql:///postgres')
    try {
      await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`)
    } finally {
      await client.destroy()
    }
  })

  it('should generate a schema definition', async () => {
    const schema = await generateSchema(`psql:///${databaseName}`)
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
    const schema = await generateSchema(`psql:///${databaseName}`, [ 'my\'Schema' ])
    expect(schema).toEqual({
      'my\'Schema.my\'Table': {
        'my\'Data': { isNullable: true, hasDefault: false, oid: 17 },
      },
    })
  })

  it('should generate a schema definition for multiple schema names', async () => {
    const schema = await generateSchema(`psql:///${databaseName}`, [ 'public', 'my\'Schema' ])
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
    const schema = await generateSchema(`psql:///${databaseName}`, [ 'public', 'my\'Schema' ])
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
