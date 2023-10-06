import { serializeSchema } from '../src/index'

const schema = {
  'users': {
    id: { oid: 23, isNullable: false, hasDefault: true },
    name: { oid: 1043, isNullable: true, hasDefault: false },
    email: { oid: 1043, isNullable: false, hasDefault: false },
    time: { oid: 1184, isNullable: true, hasDefault: true },
    type: {
      oid: 123_456_789,
      isNullable: true,
      hasDefault: false,
      enumValues: [ 'company', 'individual' ],
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
} as const

describe('Schema Generator', async () => {
  it('should serialize a schema definition', async () => {
    const source = serializeSchema(schema, 'mySchema')
    void source

    // log.notice(source.trim().split('\n').map((s) => `${$gry('|')} ${s}`).join('\n'))

    // expect(source.split('\n')).toEqual([
    //   'import { Persister } from \'@juit/pgproxy-persister\'',
    //   '',
    //   'import type { Schema } from \'@juit/pgproxy-persister\'',
    //   '',
    //   'export const mySchema = {',
    //   '  /** A wicked table comment */',
    //   '  \'my\\\'Schema.my\\\'Table\': {',
    //   '    /** A wicked column comment */',
    //   '    \'my\\\'Data\': { oid: 17, isNullable: true, hasDefault: false },',
    //   '  },',
    //   '  \'users\': {',
    //   '    \'id\': { oid: 23, isNullable: false, hasDefault: true },',
    //   '    \'name\': { oid: 1043, isNullable: true, hasDefault: false },',
    //   '    \'email\': { oid: 1043, isNullable: false, hasDefault: false },',
    //   '    \'time\': { oid: 1184, isNullable: true, hasDefault: true },',
    //   '  },',
    //   '} as const satisfies Schema',
    //   '',
    //   'export const MySchemaPersister = Persister.with(mySchema)',
    //   '', // final newline!
    // ])
  })
})
