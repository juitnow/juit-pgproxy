import { writeFile } from 'node:fs/promises'

import { createdb, dropdb, extractSchema, migrate, serializeSchema } from '@juit/pgproxy-utils'
import { log, paths } from '@plugjs/build'
// side-effect import to register the psql protocol
import '@juit/pgproxy-client-psql'

async function main(): Promise<void> {
  let dbname: string = ''
  try {
    dbname = await createdb()
    const migrations = paths.requireFilename(__fileurl, 'sql')
    await migrate(dbname, { migrations })

    const schema = await extractSchema(dbname)
    const schemaText = serializeSchema(schema, 'TestSchema')
    const schemaFile = paths.requireFilename(__fileurl, 'test-schema.d.ts')
    await writeFile(schemaFile, `/* eslint-disable */\n${schemaText}`, 'utf-8')
  } finally {
    if (dbname) await dropdb(dbname)
  }
}

main().catch((err) => log.error(err))
