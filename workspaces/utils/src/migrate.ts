import crypto from 'node:crypto'
import { basename } from 'node:path'

import { PGClient, SQL } from '@juit/pgproxy-client'
import { $blu, $grn, $gry, $ms, $und, $ylw, async, find, fs, merge, paths, pipe, resolve } from '@plugjs/plug'

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

interface AppliedMigration {
  group: string,
  number: number,
  name: string,
  timestamp: Date,
  sha256sum: Buffer,
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
  const context = async.currentContext()
  if (! context) {
    const filename = paths.requireFilename(__fileurl) // self, for context
    const newContext = new pipe.Context(filename, '') // context for pipes
    return async.runAsync(newContext, () => migrate(url, options))
  }

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
  await using client = new PGClient(url)
  await using connection = await client.connect()

  const info = await connection.query<{ name: string }>('SELECT current_database() AS name')
  context.log.notice(`Migrating database ${$ylw((info.rows[0]!.name))} ${$gry(`(group=${group})`)}`)

  // const model = connection.in('$migrations')

  context.log.info('Beginning migrations transaction')
  await connection.begin()

  /* First of all, make sure we have our "$migrations" table */
  context.log.info(`Ensuring presence of ${$blu('$migrations')} table`)
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
  context.log.info(`Lock exclusive use of ${$blu('$migrations')} table`)
  await connection.query('LOCK TABLE "$migrations"')

  /* Gather all applied migrations */
  context.log.info(`Looking for entries in ${$blu('$migrations')} table ${$gry(`(group=${group})`)}`)
  const result = await connection.query<AppliedMigration>(
      SQL`SELECT * FROM "$migrations" WHERE "group" = ${group}`,
  )

  /* Reduce all existing migration, keying them by number */
  const applied = result.rows.reduce((applied, row) => {
    const { group, number, name, timestamp, sha256sum } = row
    applied[number] = { group, number, name, timestamp, sha256sum }
    return applied
  }, {} as Record<number, AppliedMigration>)

  /* Apply our migrations */
  let count = 0
  for (const { number, name, contents, sha256sum } of migrationFiles) {
    const num = `${number}`.padStart(3, '0')
    const prev = applied[number]
    if (prev) {
      if (sha256sum.equals(prev.sha256sum)) {
        const timestamp = prev.timestamp.toISOString().substring(0, 19).replace('T', ' ')
        context.log.notice(`Skipping migration ${$gry(`${group}@`)}${$grn(num)}: ${$blu(name)}`, $gry(`applied on ${$und(timestamp)}`))
      } else {
        context.log.error(`Failed migration ${$gry(`${group}@`)}${$grn(num)}: ${$ylw(name)}`)
        const currHash = sha256sum.toString('hex').substring(0, 6)
        const prevHash = Buffer.from(prev.sha256sum).toString('hex').substring(0, 6)
        throw new Error(`Migration ${group}@${num} (${name}) has checksum "${currHash}" but was recorded as "${prevHash}"`)
      }
    } else {
      try {
        context.log.notice(`Applying migration ${$gry(`${group}@`)}${$grn(num)}: ${$blu(name)}`)
        await connection.query(contents)
        await connection.query(SQL`INSERT INTO "$migrations" ("group", "number", "name", "sha256sum")
                                   VALUES (${group}, ${number}, ${name}, ${sha256sum})`)
        count ++
      } catch (error: any) {
        context.log.error(`Failed migration ${$gry(`${group}@`)}${$grn(num)}: ${$ylw(name)}`)
        const message = error.message.split('\n').map((s: string) => `  ${s}`).join('\n')
        error.message = `Failed migration ${group}@${num} (${name}):\n${message}`
        throw error
      }
    }
  }

  /* Commit our migrations */
  context.log.info('Committing migrations transaction')
  await connection.commit()

  /* All done */
  context.log.notice(`Applied ${$ylw(count)} migrations ${$ms(Date.now() - now)}`)
  return count
}
