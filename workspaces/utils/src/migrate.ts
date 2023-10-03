import crypto from 'node:crypto'
import { basename } from 'node:path'

import { Persister } from '@juit/pgproxy-persister'
import { $grn, $gry, $und, $ylw, find, fs, log, merge, resolve } from '@plugjs/plug'


const migrationsExpression = /^([0-9]+)[^\w](.*)\.(sql|SQL)$/
const createMigrationsTableStatement = `CREATE TABLE IF NOT EXISTS
  "$migrations" (
    "group"     VARCHAR(32)  NOT NULL DEFAULT 'default',
    "number"    INTEGER      NOT NULL,
    "name"      TEXT         NOT NULL,
    "timestamp" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "sha256sum" BYTEA        NOT NULL,
    PRIMARY KEY ("group", "number")
  )`

export type MigrationOptions = {
  /** The directory where migrations SQL files reside (default: `./sql`) */
  migrations?: string,
  /**
   * The directory (or directories) where _additional_ migrations SQL files
   * reside (default: _undefined_).
   */
  additional?: string | string[],
  /** The group identifier for this migrations (default: `default`) */
  group?: string,
}

type MigrationFile = {
  sha256sum: Buffer,
  contents: string,
  number: number,
  name: string,
}

type StoredMigration = {
  group: string,
  number: number,
  name: string,
  sha256sum: Buffer,
  timestamp: string,
}

type Migration = {
  group: string,
  number: number,
  name: string,
  sha256sum: string,
  timestamp: Date,
}

export async function migrate(options?: MigrationOptions): Promise<Migration[]> {
  const {
    /* Default to our "../sql" migrations directory */
    migrations: migrationsDirectory = resolve('sql'),
    /* Our default group name is "default" */
    group = 'default',
    /* Optional additional directory for migrations */
    additional,
    /* Anything else is a PG configuration */
    // ...config
  } = { ...options }

  /* Read our directory containing all our migrations files */
  let entries = await find('*.sql', { directory: migrationsDirectory })

  /* If we have additional paths configured, read those too */
  if (additional) {
    for (const addition of [ additional ].flat()) {
      const additional = await find('*.sql', { directory: addition })
      entries = await merge([ entries, additional ])
    }
  }

  /* For each entry, map it to null or a migration entry */
  const promises = [ ...entries.absolutePaths() ].map(async (file) => {
    /* Match our file name, the groups identify our variables */
    const match = migrationsExpression.exec(basename(file))
    if (! match) return [] // no match, no migration

    /* Extract file, number and name from match */
    const [ , number, name ] = match

    /* Read up our source file (additions have "source" in the dirent) */
    const contents = await fs.readFile(file)

    /* Return our migration entry */
    return {
      sha256sum: crypto.createHash('sha256').update(contents).digest(),
      contents: contents.toString('utf8'),
      number: parseInt(number!),
      name: name!,
    }
  }).filter((migration): migration is Promise<MigrationFile> => !! migration)

  /* Sort our promises by migration _number_ */
  const migrationFiles = (await Promise.all(promises)).sort((a, b) => a!.number - b!.number)

  /* Connect up to our database */
  const persister = new Persister() // TODO: url

  /* Start our gigantic migrations transaction */
  const migrations = await persister.connect(async (client) => {
    log.notice('Beginning migrations transaction')
    await client.begin()

    /* First of all, make sure we have our "$migrations" table */
    log.notice(`Ensuring presence of "${$ylw('$migrations')}" table`)
    await client.query(createMigrationsTableStatement)

    /* Lock our migrations table */
    log.notice(`Lock exclusive use of "${$ylw('$migrations')}" table`)
    await client.query('LOCK TABLE "$migrations"')

    /* Gather all applied migrations */
    log.notice(`Looking for entries in "${$ylw('$migrations')}" table`)
    const result = await client.query('SELECT "group", "number", "name", "timestamp", "sha256sum" FROM "$migrations" WHERE "group"=$1', [ group ])
    const applied = result.rows.reduce((applied: Record<number, StoredMigration>, row) => {
      const { group, number, name, timestamp, sha256sum } = row
      applied[number] = { group, number, name, timestamp, sha256sum }
      return applied
    }, {} as Record<number, StoredMigration>)

    /** Apply our migrations and collect results */
    const results: Migration[] = []

    for (const { number, name, contents, sha256sum } of migrationFiles) {
      if (applied[number]) {
        const prev = applied[number]!

        if (sha256sum.equals(prev.sha256sum)) {
          const timestamp = new Date(prev.timestamp).toISOString()
          log.notice(`Skipping migration ${$ylw(group)}${$gry('@')}${$und(String(number).padStart(3, '0'))}: "${$grn(name)}" (applied on ${timestamp})`)
        } else {
          const currHash = sha256sum.toString('hex').substring(0, 6)
          const prevHash = prev.sha256sum.toString('hex').substring(0, 6)
          throw new Error(`Migration ${group}@${String(number).padStart(3, '0')} (${name}) has checksum "${currHash}" but was recorded as "${prevHash}"`)
        }
      } else {
        log.notice(`Applying migration ${$ylw(group)}${$gry('@')}${$und(String(number).padStart(3, '0'))}: "${$grn(name)}"`)
        await client.query(contents)
        const result = await client.query<StoredMigration>('INSERT INTO "$migrations" ("group", "number", "name", "sha256sum") VALUES ($1, $2, $3, $4) RETURNING *', [ group, number, name, sha256sum ])
        results.push({
          group: result.rows[0]!.group,
          number: result.rows[0]!.number,
          name: result.rows[0]!.name,
          sha256sum: result.rows[0]!.sha256sum.toString('hex'),
          timestamp: new Date(result.rows[0]!.timestamp),
        })
      }
    }

    /* Commit our migrations */
    log.notice('Committing migrations transaction')
    await client.commit()
    return results
  })

  await persister.destroy()
  return migrations
}
