import { PGClient } from '@juit/pgproxy-client'
import '@juit/pgproxy-client-psql'

import type { Schema } from './index'

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

/** Master query to analyse the structure of our database */
const query = `
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
    "c"."ordinal_position"`

/** Interface describing the result from our query above */
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

/** Strip all undefined values from a record */
function stripUndefined<T extends Record<string, any>>(object: T): T {
  for (const key of Object.keys(object)) {
    if (object[key] === undefined) delete object[key]
  }
  return object
}

/* ========================================================================== *
 * EXPORTED                                                                   *
 * ========================================================================== */

/**
 * Extract a {@link Schema} from an array of PosgreSQL schema names.
 *
 * If the schema names is undefined or is an empty array, the default `public`
 * schema will be used.
 */
export async function extractSchema(
    url: URL | string,
    schemas: string[] = [],
): Promise<Schema> {
  if (schemas.length === 0) schemas.push('public')

  const client = new PGClient(url)
  let rows: ResultRow[]
  try {
    const result = await client.query<ResultRow>(query, [ schemas ])
    rows = result.rows
  } finally {
    await client.destroy()
  }

  const schemaDef: Schema = {}

  for (const row of rows) {
    const { schema, table, column, description, enumValues, ...def } = row

    const name = schema === 'public' ? `${table}` : `${schema}.${table}`
    const tableDef = schemaDef[name] || (schemaDef[name] = {})

    tableDef[column] = stripUndefined({ ...def,
      description: description?.trim() ? description.trim() : undefined,
      enumValues: (enumValues && enumValues.length) ? enumValues as any : undefined,
    })
  }

  return schemaDef
}
