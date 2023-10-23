import crypto from 'node:crypto'
import { basename } from 'node:path'

import { Persister } from '@juit/pgproxy-persister'
import { $blu, $grn, $gry, $ms, $und, $ylw, find, fs, log, merge, resolve } from '@plugjs/plug'

import type { InferSelectType } from '@juit/pgproxy-persister'

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

const migrationsExpression = /^([0-9]+)[^\w](.*)\.(sql)$/i

type Migration = {
  sha256sum: Buffer,
  contents: string,
  number: number,
  name: string,
}

interface MigrationSchema {
  $migrations: {
    group: { type: string, hasDefault: true },
    number: { type: number },
    name: { type: string },
    timestamp: { type: Date, hasDefault: true },
    sha256sum: { type: Buffer },
  },
}

/* ========================================================================== *
 * EXPORTS                                                                    *
 * ========================================================================== */

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

/** Migrate a database, applying all changes from a set of SQL files */
export async function migrate(
    url: string | URL,
    options?: MigrationOptions,
): Promise<number> {
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
      .filter((migration): migration is Migration => !! migration)
      .sort((a, b) => a!.number - b!.number)

  /* Start our gigantic migrations transaction */
  const now = Date.now()
  const persister = new Persister<MigrationSchema>(url)
  return await persister.connect(async (connection) => {
    const info = await connection.query<{ name: string }>('SELECT current_database() AS name')
    log.notice(`Migrating database ${$ylw((info.rows[0]!.name))}`)

    const model = connection.in('$migrations')

    log.info('Beginning migrations transaction')
    await connection.begin()

    /* First of all, make sure we have our "$migrations" table */
    log.info(`Ensuring presence of ${$blu('$migrations')} table`)
    await connection.query(`
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
    await connection.query('LOCK TABLE "$migrations"')

    /* Gather all applied migrations */
    log.info(`Looking for entries in ${$blu('$migrations')} table`)
    const result = await model.read({ group })

    /* Reduce all existing migration, keying them by number */
    const applied = result.reduce((applied, row) => {
      const { group, number, name, timestamp, sha256sum } = row
      applied[number] = { group, number, name, timestamp, sha256sum }
      return applied
    }, {} as Record<number, InferSelectType<MigrationSchema['$migrations']>>)

    /* Apply our migrations */
    let count = 0
    for (const { number, name, contents, sha256sum } of migrationFiles) {
      const num = `${number}`.padStart(3, '0')
      const prev = applied[number]
      if (prev) {
        if (sha256sum.equals(prev.sha256sum)) {
          const timestamp = prev.timestamp.toISOString().substring(0, 19).replace('T', ' ')
          log.notice(`Skipping migration ${$gry(`${group}@`)}${$grn(num)}: ${$blu(name)}`, $gry(`applied on ${$und(timestamp)}`))
        } else {
          log.error(`Failed migration ${$gry(`${group}@`)}${$grn(num)}: ${$ylw(name)}`)
          const currHash = sha256sum.toString('hex').substring(0, 6)
          const prevHash = Buffer.from(prev.sha256sum).toString('hex').substring(0, 6)
          throw new Error(`Migration ${group}@${num} (${name}) has checksum "${currHash}" but was recorded as "${prevHash}"`)
        }
      } else {
        try {
          log.notice(`Applying migration ${$gry(`${group}@`)}${$grn(num)}: ${$blu(name)}`)
          await connection.query(contents)
          await model.create({ group, number, name, sha256sum })
          count ++
        } catch (error) {
          log.error(`Failed migration ${$gry(`${group}@`)}${$grn(num)}: ${$ylw(name)}`)
          throw error
        }
      }
    }

    /* Commit our migrations */
    log.info('Committing migrations transaction')
    await connection.commit()

    /* All done */
    log.notice(`Applied ${$ylw(count)} migrations ${$ms(Date.now() - now)}`)
    return count
  }).finally(() => persister.destroy())
}
