import { encodeSchemaAndName } from '../src/utils'

describe('Utilities', () => {
  it('should escape identifiers correctly', () => {
    expect(encodeSchemaAndName('foobar')).toEqual('"public"."foobar"')
    expect(encodeSchemaAndName('public.foobar')).toEqual('"public"."foobar"')
    expect(encodeSchemaAndName('.foobar')).toEqual('"public"."foobar"')
    expect(encodeSchemaAndName('myschema.foobar')).toEqual('"myschema"."foobar"')

    expect(() => encodeSchemaAndName('')).toThrowError('Invalid table name ""')
    expect(() => encodeSchemaAndName('.')).toThrowError('Invalid table name "."')
    expect(() => encodeSchemaAndName('..')).toThrowError('Invalid table name ".."')
    expect(() => encodeSchemaAndName('myschema.foobar.baz')).toThrowError('Invalid table name "myschema.foobar.baz"')
  })
})
