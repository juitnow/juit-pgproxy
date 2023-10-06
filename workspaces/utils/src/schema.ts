import { PGClient } from '@juit/pgproxy-client'
import '@juit/pgproxy-client-psql'

interface ResultRow {
  schema: string,
  table: string,
  column: string,
  isNullable: boolean,
  hasDefault: boolean,
  oid: number,
  enumValues: string[] | null,
  description: string | null,
}

export interface Schema {
  [ table: string ] : {
    [ column: string ] : {
      oid: number,
      isNullable?: boolean,
      hasDefault?: boolean,
      description?: string,
      enumValues?: [ string, ...string[] ],
    }
  }
}

/** Strip all undefined values from a record */
function stripUndefined<T extends Record<string, any>>(object: T): T {
  for (const key of Object.keys(object)) {
    if (object[key] === undefined) delete object[key]
  }
  return object
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
  if (schemas.length === 0) schemas.push('public')

  const client = new PGClient(url)
  const result = await client.query<ResultRow>(`
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
      "e"."enumValues" AS "enumValues",
      "d"."description" AS "description"
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
    -- join the pg_catalog.pg_enum to bring in the ENUM VALUESs
    LEFT JOIN (
      SELECT
        "enumtypid",
        "array_agg"("enumlabel")::varchar[] AS "enumValues"
      FROM
        "pg_catalog"."pg_enum"
      GROUP BY
        "enumtypid"
    ) "e"
    ON
      "t"."oid" = "e"."enumtypid"
    -- join the pg_catalog.pg_description to bring in the column DESCRIPTIONs
    LEFT JOIN
      "pg_catalog"."pg_description" AS "d"
    ON
      "d"."objoid" = "s"."relid" AND
      "d"."objsubid" = "c"."ordinal_position"
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

  const definitions: Schema = {}

  for (const row of result.rows) {
    const {
      schema,
      table,
      column,
      description,
      enumValues,
      ...others
    } = row as ResultRow

    const name = schema === 'public' ? `${table}` : `${schema}.${table}`
    const tableDef = definitions[name] || (definitions[name] = {})

    tableDef[column] = stripUndefined({ ...others,
      description: description?.trim() ? description.trim() : undefined,
      enumValues: (enumValues && enumValues.length) ? enumValues as any : undefined,
    })
  }

  return definitions
}

// /**
//  * Serialize the specified `Schema` as a TypeScript source file.
//  *
//  * If the `id` is unspecified, the default name `schema` will be used.
//  */
// export function serializeSchema(schema: Schema, id: string = 'schema'): string {
//   const lines: string[] = [
//     'import { Persister } from \'@juit/pgproxy-persister\'\n',
//     'import type { Schema } from \'@juit/pgproxy-persister\'\n',
//     `export const ${id} = {`,
//   ]

//   for (const [ tableName, table ] of Object.entries(schema)) {
//     const description = tableDescriptions.get(table)
//     if (description) lines.push(`  /** ${description} */`)
//     lines.push(`  ${escape(tableName)}: {`)
//     for (const [ columnName, column ] of Object.entries(table)) {
//       const description = columnDescriptions.get(column)
//       if (description) lines.push(`    /** ${description} */`)
//       const definition = [
//         `oid: ${parseInt(`${column.oid}`)}`,
//         `isNullable: ${!! column.isNullable}`,
//         `hasDefault: ${!! column.hasDefault}`,
//       ]
//       if (column.enumValues && column.enumValues.length) {
//         const values = column.enumValues.map((label) => escape(label))
//         definition.push(`enumValues: [ ${values.join(', ')} ]`)
//       }
//       lines.push(`    ${escape(columnName)}: { ${definition.join(', ')} },`)
//     }
//     lines.push('  },')
//   }

//   lines.push('} as const satisfies Schema\n')

//   const persisterId = `${id[0]!.toUpperCase()}${id.substring(1)}Persister`
//   lines.push(`export const ${persisterId} = Persister.with(${id})\n`)

//   return lines.join('\n')
// }
