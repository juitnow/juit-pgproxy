import { SQL } from '../src'

describe('SQL Template Strings', () => {
  it('should process a simple tagged template string', () => {
    const result1 = SQL `SELECT * FROM users WHERE email = ${'user@example.org'}`
    expect(result1).toBeA('function')
    expect(result1.query).toEqual('SELECT * FROM users WHERE email = $1')
    expect(result1.params).toEqual([ 'user@example.org' ])

    // chaining
    const result2 = result1 `AND number = ${2}`
    expect(result2).toBeA('function')
    expect(result2.query).toEqual('SELECT * FROM users WHERE email = $1 AND number = $2')
    expect(result2.params).toEqual([ 'user@example.org', 2 ])

    // chaining w/o pollution
    const result3 = result1 `AND deleted = ${false}`
    expect(result3).toBeA('function')
    expect(result3.query).toEqual('SELECT * FROM users WHERE email = $1 AND deleted = $2')
    expect(result3.params).toEqual([ 'user@example.org', false ])
  })

  it('should process a set of concatenated tagged template strings', () => {
    const result = SQL `SELECT * FROM users WHERE email = ${'user@example.org'}` `AND number = ${2}` `AND deleted = ${false}`
    expect(result).toBeA('function')
    expect(result.query).toEqual('SELECT * FROM users WHERE email = $1 AND number = $2 AND deleted = $3')
    expect(result.params).toEqual([ 'user@example.org', 2, false ])
  })
})
