import { oids } from '../src/oids'
import { parseString } from '../src/parsers'
import { Registry } from '../src/registry'

describe('Types Registry', () => {
  it('should have mappings for all known OIDs', () => {
    const registry = new Registry()
    const parsers = Object.keys((registry as any)._parsers)
    expect(parsers).toMatchContents(Object.values(oids).map((oid) => `${oid}`))
  })

  it('should register a parser', () => {
    const registry = new Registry()

    const parser = (): void => {}

    expect(registry.getParser(6210681)).toStrictlyEqual(parseString)

    registry.registerParser(6210681, parser)
    expect(registry.getParser(6210681)).toStrictlyEqual(parser)

    registry.deregisterParser(6210681)
    expect(registry.getParser(6210681)).toStrictlyEqual(parseString)
  })

  it('should register a default parser', () => {
    const registry1 = new Registry()
    const registry2 = new Registry()

    const parserDefault = (): void => {}
    const parserOverride = (): void => {}

    // must be the default
    expect(registry1.getParser(6210682)).toStrictlyEqual(parseString)
    expect(registry2.getParser(6210682)).toStrictlyEqual(parseString)

    // register, must be visible on both parsers
    Registry.registerDefaultParser(6210682, parserDefault)
    expect(registry1.getParser(6210682)).toStrictlyEqual(parserDefault)
    expect(registry2.getParser(6210682)).toStrictlyEqual(parserDefault)

    // override on parser1, must be visible on parser2
    registry1.registerParser(6210682, parserOverride)
    expect(registry1.getParser(6210682)).toStrictlyEqual(parserOverride)
    expect(registry2.getParser(6210682)).toStrictlyEqual(parserDefault)

    // deregister, parser1 must keep override, parser2 gets identity
    Registry.deregisterDefaultParser(6210682)
    expect(registry1.getParser(6210682)).toStrictlyEqual(parserOverride)
    expect(registry2.getParser(6210682)).toStrictlyEqual(parseString)
  })
})
