import * as models from '../src/index'

describe('Persister Models', () => {
  it('should export absolutely nothing', () => {
    expect({ ...models }).toEqual({}) // might have a "null" prototype
  })
})
