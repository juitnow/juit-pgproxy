import { randomUUID } from 'node:crypto'

import { AbstractPGProvider, createProvider, registerProvider } from '../src/index'

import type { PGConnection, PGConnectionResult } from '../src/index'

describe('Provider', () => {
  it('should instantiate a test provider', async () => {
    const calls: string[] = []

    const protocol = `test-${randomUUID()}`

    let error: Error | undefined = undefined
    const result: PGConnectionResult = {
      command: 'TEST',
      rowCount: 0,
      fields: [],
      rows: [],
    }

    const connection: PGConnection = {
      query(text: string, params: string[]): Promise<PGConnectionResult> {
        calls.push(`QUERY: ${text} [${params.join(',')}]`)
        if (error) throw error
        return Promise.resolve(result)
      },
    }

    class TestProvider extends AbstractPGProvider<PGConnection> {
      private _acquire = 0
      private _release = 0

      constructor(url: URL) {
        calls.push(`CONSTRUCT: ${url.href}`)
        super()
      }

      acquire(): Promise<PGConnection> {
        calls.push(`ACQUIRE: ${++ this._acquire}`)
        return Promise.resolve(connection)
      }

      release(connection: PGConnection): Promise<void> {
        expect(connection).toStrictlyEqual(connection)
        calls.push(`RELEASE: ${++ this._release}`)
        return Promise.resolve()
      }
    }

    registerProvider(protocol, TestProvider)

    const url = new URL(`${protocol}://test-host:1234/test-path`)
    const provider = createProvider(url)

    const result2 = await provider.query('the sql', [ 'foo', null, 'bar' ])

    expect(result2).toStrictlyEqual(result)
    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY: the sql [foo,,bar]',
      'RELEASE: 1',
    ])

    // Now repeat, but throw an error

    error = new Error('Fail now!')
    await expect(provider.query('another sql', []))
        .toBeRejectedWith(error)
    await provider.destroy()

    expect(calls).toEqual([
      `CONSTRUCT: ${url.href}`,
      'ACQUIRE: 1',
      'QUERY: the sql [foo,,bar]',
      'RELEASE: 1',
      'ACQUIRE: 2',
      'QUERY: another sql []',
      'RELEASE: 2',
    ])
  })

  it('should fail when a provider is already registered', () => {
    const protocol = `test-${randomUUID()}`

    class TestProvider extends AbstractPGProvider<PGConnection> {
      acquire(): Promise<PGConnection> {
        throw new Error('Method not implemented.')
      }
      release(): Promise<void> {
        throw new Error('Method not implemented.')
      }
    }

    expect(() => registerProvider(protocol, TestProvider)).not.toThrow()

    expect(() => registerProvider(protocol, TestProvider)).toThrowError(
        `Connection provider for "${protocol}://..." already registered`,
    )
  })

  it('should fail when a provider is not registered', () => {
    const protocol = `test-${randomUUID()}`
    const url = new URL(`${protocol}://test-host:1234/test-path`)

    expect(() => createProvider(url)).toThrowError(
        `No connection provider registered for "${protocol}://..."`,
    )
  })
})
