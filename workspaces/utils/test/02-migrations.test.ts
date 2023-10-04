import { Persister } from '@juit/pgproxy-persister'
import { paths } from '@plugjs/build'

import { createdb, dropdb, migrate } from '../src/index'

describe('Migrations', async () => {
  const dbname = await createdb()
  const persister = new Persister(dbname)

  afterAll(async () => {
    await persister.destroy()
    await dropdb(dbname)
  })

  it('should run migrations nicely', async function() {
    const result = await migrate(dbname, {
      migrations: paths.requireFilename(__fileurl, './migrations'),
      additional: paths.requireFilename(__fileurl, './additional'),
    })

    expect(result).toStrictlyEqual(3)

    const result2 = await migrate(dbname, {
      migrations: paths.requireFilename(__fileurl, './migrations'),
      additional: paths.requireFilename(__fileurl, './additional'),
      group: 'test',
    })

    expect(result2).toStrictlyEqual(3)
  })

  it('should re-run migrations without applying any', async function() {
    const result = await migrate(dbname, {
      migrations: paths.requireFilename(__fileurl, './migrations'),
    })

    expect(result).toEqual(0)
  })

  it('should re-run migrations without applying any in a group', async function() {
    const result = await migrate(dbname, {
      migrations: paths.requireFilename(__fileurl, './migrations'),
      group: 'test',
    })

    expect(result).toEqual(0)
  })

  it('should have recorded all the correct migrations', async function() {
    const result = await persister.query('SELECT * FROM "$migrations" ORDER BY "timestamp"')

    const sha256sum = Buffer.from('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'hex')

    expect(result.rows).toEqual([
      { group: 'default', number: 1, name: 'migration1', timestamp: result.rows[0]!.timestamp, sha256sum },
      { group: 'default', number: 2, name: 'migration2', timestamp: result.rows[1]!.timestamp, sha256sum },
      { group: 'default', number: 3, name: 'migration3', timestamp: result.rows[2]!.timestamp, sha256sum },
      { group: 'test', number: 1, name: 'migration1', timestamp: result.rows[3]!.timestamp, sha256sum },
      { group: 'test', number: 2, name: 'migration2', timestamp: result.rows[4]!.timestamp, sha256sum },
      { group: 'test', number: 3, name: 'migration3', timestamp: result.rows[5]!.timestamp, sha256sum },
    ])

    for (const row of result.rows) {
      expect(row.timestamp.getTime()).toBeCloseTo(Date.now(), 5000) // within 5 sec
    }
  })

  it('should fail when a previous migration has the wrong checksum', async function() {
    const persister = new Persister(dbname)
    await persister.query('UPDATE "$migrations" SET sha256sum=$1 WHERE number=1', [ Buffer.alloc(32) ])
    await persister.destroy()

    await expect(migrate(dbname, {
      migrations: paths.requireFilename(__fileurl, './migrations'),
    })).toBeRejectedWithError('Migration default@001 (migration1) has checksum "e3b0c4" but was recorded as "000000"')
  })
})
