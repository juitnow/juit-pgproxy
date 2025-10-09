import { createdb, dropdb, testdb } from '../src/index'

describe('Database Utilities', () => {
  let dbname: string | undefined

  it('should not create a test db name with the wrong prefix', () => {
    expect(() => testdb('x')).toThrowError('Invalid database name prefix "x"')
  })

  it('should not create a database with the wrong name', async () => {
    await expect(createdb('x')).toBeRejectedWithError('Invalid database name "x"')
  })

  it('should not drop a database with the wrong name', async () => {
    await expect(dropdb('x')).toBeRejectedWithError('Invalid database name "x"')
  })

  /* Let's create a test database */
  it('should create a test db name', function() {
    expect(testdb()).toMatch(/^test-[\d]{17}-[\d]{4}$/)
    expect(testdb('prefix')).toMatch(/^prefix-[\d]{17}-[\d]{4}$/)
  })

  it('should create a test database', async function() {
    dbname = await createdb()
  })

  it('should delete the test database', async function() {
    if (! dbname) return skip()
    await dropdb(dbname)
  })

  it('should not fail delete the test database a second time', async function() {
    if (! dbname) return skip()
    await dropdb(dbname)
  })
})
