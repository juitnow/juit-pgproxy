import crypto from 'node:crypto'
import { basename } from 'node:path'

import { Persister } from '@juit/pgproxy-persister'
import { $blu, $grn, $gry, $ms, $und, $ylw, find, fs, log, merge, resolve } from '@plugjs/plug'

import type { Schema } from '@juit/pgproxy-persister'

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

const migrationsExpression = /^([0-9]+)[^\w](.*)\.(sql)$/i

type MigrationFile = {
  sha256sum: Buffer,
  contents: string,
  number: number,
  name: string,
}

type xxStoredMigration = {
  group: string,
  number: number,
  name: string,
  sha256sum: Buffer,
  timestamp: Date,
}

type Migration = {
  group: string,
  number: number,
  name: string,
  sha256sum: string,
  timestamp: Date,
}

/* ========================================================================== *
 * EXPORTS                                                                    *
 * ========================================================================== */

/** The persister schema for the `$migrations` table. */
export const migrationSchema = {
  '$migrations': {
    'group': { oid: 1043, isNullable: false, hasDefault: true },
    'number': { oid: 23, isNullable: false, hasDefault: false },
    'name': { oid: 25, isNullable: false, hasDefault: false },
    'timestamp': { oid: 1184, isNullable: false, hasDefault: true },
    'sha256sum': { oid: 17, isNullable: false, hasDefault: false },
  },
} as const satisfies Schema


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

export async function migrate(
    url: string | URL,
    options?: MigrationOptions,
): Promise<Migration[]> {
  const {
    /* Default to our "../sql" migrations directory */
    migrations: migrationsDirectory = resolve('sql'),
    /* Our default group name is "default" */
    group = 'default',
    /* Optional additional directory for migrations */
    additional,
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
    if (! match) return // no match, no migration

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
  })

  /* Filter unmatched migrations and sort them by migration _number_ */
  const migrationFiles = (await Promise.all(promises))
      .filter((migration): migration is MigrationFile => !! migration)
      .sort((a, b) => a!.number - b!.number)

  /* Start our gigantic migrations transaction */
  const now = Date.now()
  const persister = new Persister(url, migrationSchema)
  const migrations = persister.connect(async (client) => {
    log.notice(`Applying ${$ylw(migrationFiles.length.toString())} migrations`)

    log.info('Beginning migrations transaction')
    await client.begin()

    /* First of all, make sure we have our "$migrations" table */
    log.info(`Ensuring presence of ${$blu('$migrations')} table`)
    await client.query(`
      SET LOCAL client_min_messages TO WARNING;
      CREATE TABLE IF NOT EXISTS "$migrations" (
        "group"     VARCHAR(32)  NOT NULL DEFAULT 'default',
        "number"    INTEGER      NOT NULL,
        "name"      TEXT         NOT NULL,
        "timestamp" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "sha256sum" BYTEA        NOT NULL,
        PRIMARY KEY ("group", "number")
      );`)

    /* Lock our migrations table */
    log.info(`Lock exclusive use of ${$blu('$migrations')} table`)
    await client.query('LOCK TABLE "$migrations"')

    /* Gather all applied migrations */
    log.info(`Looking for entries in ${$blu('$migrations')} table`)
    const result = await client.query<xxStoredMigration>(`
      SELECT "group",
             "number",
             "name",
             "timestamp",
             "sha256sum"
        FROM "$migrations"
       WHERE "group"=$1`, [ group ])
    const applied = result.rows.reduce((applied, row) => {
      const { group, number, name, timestamp, sha256sum } = row
      applied[number] = { group, number, name, timestamp, sha256sum }
      return applied
    }, {} as Record<number, xxStoredMigration>)

    /** Apply our migrations and collect results */
    const results: Migration[] = []

    for (const { number, name, contents, sha256sum } of migrationFiles) {
      const num = `${number}`.padStart(3, '0')
      if (applied[number]) {
        const prev = applied[number]!

        if (sha256sum.equals(prev.sha256sum)) {
          const timestamp = prev.timestamp.toISOString().substring(0, 19).replace('T', ' ')
          log.notice(`Skipping migration ${$gry(`${group}@`)}${$grn(num)}: ${$blu(name)}`, $gry(`applied on ${$und(timestamp)}`))
        } else {
          const currHash = sha256sum.toString('hex').substring(0, 6)
          const prevHash = prev.sha256sum.toString('hex').substring(0, 6)
          throw new Error(`Migration ${group}@${num} (${name}) has checksum "${currHash}" but was recorded as "${prevHash}"`)
        }
      } else {
        log.notice(`Applying migration ${$gry(`${group}@`)}${$grn(num)}: ${$blu(name)}`)
        await client.query(contents)
        const result = await client.query<xxStoredMigration>(`
          INSERT INTO "$migrations" ("group", "number", "name", "sha256sum")
               VALUES ($1, $2, $3, $4)
            RETURNING *`, [ group, number, name, sha256sum ])
        results.push({
          group: result.rows[0]!.group,
          number: result.rows[0]!.number,
          name: result.rows[0]!.name,
          sha256sum: result.rows[0]!.sha256sum.toString('hex'),
          timestamp: result.rows[0]!.timestamp,
        })
      }
    }

    /* Commit our migrations */
    log.info('Committing migrations transaction')
    await client.commit()

    /* All done */
    log.notice(`Applied ${$ylw(results.length.toString())} migrations ${$ms(Date.now() - now)}`)
    return results
  }).finally(() => persister.destroy())

  return await migrations
}
