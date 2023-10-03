import { PGClient } from '@juit/pgproxy-client'
import '@juit/pgproxy-client-psql'

import type { Column, Schema, Table } from '@juit/pgproxy-persister'

type Writable<T> = { -readonly [P in keyof T]: Writable<T[P]> }
type ResultRow = Column & {
  schema: string,
  table: string,
  column: string,
  tableDescription: string | null,
  columnDescription: string | null,
}

const tableDescriptions = new WeakMap<Table, string>()
const columnDescriptions = new WeakMap<Column, string>()

function escape(id: string): string {
  const replaced = id
      .replaceAll('\\', '\\\\')
      .replaceAll('\'', '\\\'')

  return `'${replaced}'`
}

/**
 * Generate the `Schema` from an array of PosgreSQL schema names.
 *
 * If the schema names is undefined or is an empty array, the default `public`
 * schema will be used.
 */
export async function generateSchema(
    url: URL | string,
    schemas: string[] = [],
): Promise<Schema> {
  if (typeof url === 'string') url = new URL(url)
  if (schemas.length === 0) schemas.push('public')

  const client = new PGClient(url)
  const result = await client.query(`
    SELECT
      "c"."table_schema" AS "schema",
      "c"."table_name" AS "table",
      "c"."column_name" AS "column",
      "c"."is_nullable"::bool AS "isNullable",
      CASE WHEN "c"."column_default" IS NULL
        THEN false
        ELSE true
      END AS "hasDefault",
      "t"."oid" AS "oid",
      "dt"."description" AS "tableDescription",
      "dc"."description" AS "columnDescription"
    FROM
      "information_schema"."columns" AS "c"
    -- join the pg_catalog.pg_type to bring in the OIDs
    INNER JOIN
      "pg_catalog"."pg_type" AS "t"
    ON
      "c"."udt_name" = "t"."typname"
    -- join the pg_catalog.pg_statio_all_tables to bring in the OBJIDs
    INNER JOIN
      "pg_catalog"."pg_statio_all_tables" AS "s"
    ON
      "c"."table_schema" = "s"."schemaname" AND
      "c"."table_name"   = "s"."relname"
    -- join the pg_catalog.pg_description to bring in the TABLE DESCRIPTIONs
    LEFT JOIN
      "pg_catalog"."pg_description" AS "dt"
    ON
      "dt"."objoid" = "s"."relid" AND
      "dt"."objsubid" = 0
    -- join the pg_catalog.pg_description to bring in the COLUMN DESCRIPTIONs
    LEFT JOIN
      "pg_catalog"."pg_description" AS "dc"
    ON
      "dc"."objoid" = "s"."relid" AND
      "dc"."objsubid" = "c"."ordinal_position"
    -- restrict to our schemas
    WHERE
      "c"."table_schema" = ANY($1)
    -- sanity in ordering
    ORDER BY
      "c"."table_schema",
      "c"."table_name",
      "c"."ordinal_position"
  `, [ schemas ])
  await client.destroy()

  const definitions: Writable<Schema> = {}

  for (const row of result.rows) {
    const {
      schema,
      table,
      column,
      tableDescription,
      columnDescription,
      ...columnDef
    } = row as ResultRow

    const name = schema === 'public' ? `${table}` : `${schema}.${table}`
    const tableDef = definitions[name] || (definitions[name] = {})
    tableDef[column] = columnDef

    const tableDesc = tableDescription?.trim()
    const columnDesc = columnDescription?.trim()
    if (tableDesc) tableDescriptions.set(tableDef, tableDesc)
    if (columnDesc) columnDescriptions.set(columnDef, columnDesc)
  }

  return definitions
}

/**
 * Serialize the specified `Schema` as a TypeScript source file.
 *
 * If the `id` is unspecified, the default name `schema` will be used.
 */
export function serializeSchema(schema: Schema, id: string = 'schema'): string {
  const lines: string[] = [
    'import { Persister } from \'@juit/pgproxy-persister\'\n',
    'import type { Schema } from \'@juit/pgproxy-persister\'\n',
    `export const ${id} = {`,
  ]

  for (const [ tableName, table ] of Object.entries(schema)) {
    const description = tableDescriptions.get(table)
    if (description) lines.push(`  /** ${description} */`)
    lines.push(`  ${escape(tableName)}: {`)
    for (const [ columnName, column ] of Object.entries(table)) {
      const description = columnDescriptions.get(column)
      if (description) lines.push(`    /** ${description} */`)
      const definition = [
        `oid: ${parseInt(`${column.oid}`)}`,
        `isNullable: ${!! column.isNullable}`,
        `hasDefault: ${!! column.hasDefault}`,
      ].join(', ')
      lines.push(`    ${escape(columnName)}: { ${definition} },`)
    }
    lines.push('  },')
  }

  lines.push('} as const satisfies Schema\n')

  const persisterId = `${id[0]!.toUpperCase()}${id.substring(1)}Persister`
  lines.push(`export const ${persisterId} = Persister.with(${id})\n`)

  return lines.join('\n')
}
