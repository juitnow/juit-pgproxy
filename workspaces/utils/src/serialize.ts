import '@juit/pgproxy-client-psql'
import { PGOIDs } from '@juit/pgproxy-types'
import ts from 'typescript'

import type { Schema } from './index'

/* ========================================================================== *
 * TYPES AND CONSTANTS                                                        *
 * ========================================================================== */

const exportModifier = ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)
const endOfFileToken = ts.factory.createToken(ts.SyntaxKind.EndOfFileToken)

const stringType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)

const parseBigInt: ts.TypeNode = null as any
const parseBigIntRange: ts.TypeNode = null as any
const parseBool: ts.TypeNode = null as any
const parseByteA: ts.TypeNode = null as any
const parseCircle: ts.TypeNode = null as any
const parseFloat: ts.TypeNode = null as any
const parseInt: ts.TypeNode = null as any
const parseIntRange: ts.TypeNode = null as any
const parseInterval: ts.TypeNode = null as any
const parseJson: ts.TypeNode = null as any
const parsePoint: ts.TypeNode = null as any
const parseRange: ts.TypeNode = null as any
const parseString: ts.TypeNode = null as any
const parseTimestamp: ts.TypeNode = null as any
const parseTimestampRange: ts.TypeNode = null as any
const parseTimestampTz: ts.TypeNode = null as any
const parseTimestampTzRange: ts.TypeNode = null as any
const parseVoid: ts.TypeNode = null as any

const parseArray: ts.TypeNode = null as any
const parseBigIntArray: ts.TypeNode = null as any
const parseBigIntRangeArray: ts.TypeNode = null as any
const parseBoolArray: ts.TypeNode = null as any
const parseByteAArray: ts.TypeNode = null as any
const parseCircleArray: ts.TypeNode = null as any
const parseFloatArray: ts.TypeNode = null as any
const parseIntArray: ts.TypeNode = null as any
const parseIntRangeArray: ts.TypeNode = null as any
const parseIntervalArray: ts.TypeNode = null as any
const parseJsonArray: ts.TypeNode = null as any
const parsePointArray: ts.TypeNode = null as any
const parseRangeArray: ts.TypeNode = null as any
const parseTimestampArray: ts.TypeNode = null as any
const parseTimestampRangeArray: ts.TypeNode = null as any
const parseTimestampTzArray: ts.TypeNode = null as any
const parseTimestampTzRangeArray: ts.TypeNode = null as any

const oidTypes = {
  /* Basic known types                                |_oid__|_typname______| */
  [PGOIDs.bool]: parseBool, /*                        |   16 | bool         | */
  [PGOIDs.bytea]: parseByteA, /*                      |   17 | bytea        | */
  [PGOIDs.int8]: parseBigInt, /*                      |   20 | int8         | */
  [PGOIDs.int2]: parseInt, /*                         |   21 | int2         | */
  [PGOIDs.int4]: parseInt, /*                         |   23 | int4         | */
  [PGOIDs.oid]: parseInt, /*                          |   26 | oid          | */
  [PGOIDs.json]: parseJson, /*                        |  114 | json         | */
  [PGOIDs.point]: parsePoint, /*                      |  600 | point        | */
  [PGOIDs.float4]: parseFloat, /*                     |  700 | float4       | */
  [PGOIDs.float8]: parseFloat, /*                     |  701 | float8       | */
  [PGOIDs.circle]: parseCircle, /*                    |  718 | circle       | */
  [PGOIDs.varchar]: parseString, /*                   | 1043 | varchar      | */
  [PGOIDs.timestamp]: parseTimestamp, /*              | 1114 | timestamp    | */
  [PGOIDs.timestamptz]: parseTimestampTz, /*          | 1184 | timestamptz  | */
  [PGOIDs.interval]: parseInterval, /*                | 1186 | interval     | */
  [PGOIDs.numeric]: parseString, /*                   | 1700 | numeric      | */
  [PGOIDs.jsonb]: parseJson, /*                       | 3802 | jsonb        | */

  /* Special types                                    |_oid__|_typname______| */
  [PGOIDs.void]: parseVoid, /*                        | 2278 | void         | */
  [PGOIDs.xid]: parseInt, /*                          |   28 | xid          | */
  [PGOIDs.xid8]: parseBigInt, /*                      | 5069 | xid8         | */
  [PGOIDs._xid]: parseIntArray, /*                    | 1011 | _xid         | */
  [PGOIDs._xid8]: parseBigIntArray, /*                |  271 | _xid8        | */

  /* Native array types of the above                  |_oid__|_typname______| */
  [PGOIDs._bool]: parseBoolArray, /*                  | 1000 | _bool        | */
  [PGOIDs._bytea]: parseByteAArray, /*                | 1001 | _bytea       | */
  [PGOIDs._int8]: parseBigIntArray, /*                | 1016 | _int8        | */
  [PGOIDs._int2]: parseIntArray, /*                   | 1005 | _int2        | */
  [PGOIDs._int4]: parseIntArray, /*                   | 1007 | _int4        | */
  [PGOIDs._oid]: parseIntArray, /*                    | 1028 | _oid         | */
  [PGOIDs._json]: parseJsonArray, /*                  |  199 | _json        | */
  [PGOIDs._point]: parsePointArray, /*                | 1017 | _point       | */
  [PGOIDs._float4]: parseFloatArray, /*               | 1021 | _float4      | */
  [PGOIDs._float8]: parseFloatArray, /*               | 1022 | _float8      | */
  [PGOIDs._circle]: parseCircleArray, /*              |  719 | _circle      | */
  [PGOIDs._timestamp]: parseTimestampArray, /*        | 1115 | _timestamp   | */
  [PGOIDs._timestamptz]: parseTimestampTzArray, /*    | 1185 | _timestamptz | */
  [PGOIDs._interval]: parseIntervalArray, /*          | 1187 | _interval    | */
  [PGOIDs._numeric]: parseArray, /*                   | 1231 | _numeric     | */
  [PGOIDs._jsonb]: parseJsonArray, /*                 | 3807 | _jsonb       | */

  /* Other known array types                          |_oid__|_typname______| */
  [PGOIDs._cidr]: parseArray, /*                      |  651 | _cidr        | */
  [PGOIDs._money]: parseArray, /*                     |  791 | _money       | */
  [PGOIDs._regproc]: parseArray, /*                   | 1008 | _regproc     | */
  [PGOIDs._text]: parseArray, /*                      | 1009 | _text        | */
  [PGOIDs._bpchar]: parseArray, /*                    | 1014 | _bpchar      | */
  [PGOIDs._varchar]: parseArray, /*                   | 1015 | _varchar     | */
  [PGOIDs._macaddr]: parseArray, /*                   | 1040 | _macaddr     | */
  [PGOIDs._inet]: parseArray, /*                      | 1041 | _inet        | */
  [PGOIDs._date]: parseArray, /*                      | 1182 | _date        | */
  [PGOIDs._time]: parseArray, /*                      | 1183 | _time        | */
  [PGOIDs._timetz]: parseArray, /*                    | 1270 | _timetz      | */
  [PGOIDs._uuid]: parseArray, /*                      | 2951 | _uuid        | */

  /* Range types                                      |_oid__|_typname______| */
  [PGOIDs.int4range]: parseIntRange, /*               | 3904 | int4range    | */
  [PGOIDs.numrange]: parseRange, /*                   | 3906 | numrange     | */
  [PGOIDs.tsrange]: parseTimestampRange, /*           | 3908 | tsrange      | */
  [PGOIDs.tstzrange]: parseTimestampTzRange, /*       | 3910 | tstzrange    | */
  [PGOIDs.daterange]: parseRange, /*                  | 3912 | daterange    | */
  [PGOIDs.int8range]: parseBigIntRange, /*            | 3926 | int8range    | */

  /* Array of range types                             |_oid__|_typname______| */
  [PGOIDs._int4range]: parseIntRangeArray, /*         | 3905 | _int4range   | */
  [PGOIDs._numrange]: parseRangeArray, /*             | 3907 | _numrange    | */
  [PGOIDs._tsrange]: parseTimestampRangeArray, /*     | 3909 | _tsrange     | */
  [PGOIDs._tstzrange]: parseTimestampTzRangeArray, /* | 3911 | _tstzrange   | */
  [PGOIDs._daterange]: parseRangeArray, /*            | 3913 | _daterange   | */
  [PGOIDs._int8range]: parseBigIntRangeArray, /*      | 3927 | _int8range   | */
} satisfies Record<PGOIDs[keyof PGOIDs], ts.TypeNode>

const trueLiteralTypeNode = ts.factory.createLiteralTypeNode(
    ts.factory.createToken(ts.SyntaxKind.TrueKeyword))

const isNullableSignature = ts.factory.createPropertySignature(
    undefined, // no modifiers
    'isNullable',
    undefined, // no question mark
    trueLiteralTypeNode)

const hasDefaultSignature = ts.factory.createPropertySignature(
    undefined, // no modifiers
    'hasDefault',
    undefined, // no question mark
    trueLiteralTypeNode)

/* ========================================================================== *
 * EXPORTED                                                                   *
 * ========================================================================== */

/**
 * Serialize the specified `Schema` as a TypeScript source file.
 *
 * If the `id` is unspecified, the default name `Schema` will be used.
 */
export function serializeSchema(
    schema: Schema,
    id: string = 'Schema',
    types: Record<number, ts.TypeNode> = {},
): string {
/* Property signatures of all tables */
  const tables: ts.PropertySignature[] = []

  /* Iterate through our tables */
  for (const [ tableName, table ] of Object.entries(schema)) {
  /* Property signatures of all columns in the current table */
    const columns: ts.PropertySignature[] = []

    /* Iterate through our table's columns */
    for (const [ columnName, column ] of Object.entries(table)) {
      let typeNode: ts.TypeNode

      /* First look at any type overridden when calling this */
      if (column.oid in types) {
        typeNode = types[column.oid]!

        /* Then look at our well-known types */
      } else if (column.oid in oidTypes) {
        typeNode = oidTypes[column.oid as keyof typeof oidTypes]

        /* Still nothing? Maybe it's an enum (a union type) */
      } else if (column.enumValues) {
        typeNode = ts.factory.createUnionTypeNode(
            column.enumValues.map((value) =>
              ts.factory.createLiteralTypeNode(
                  ts.factory.createStringLiteral(value),
              )))

        /* Anything else is a string... */
      } else {
        typeNode = stringType
      }

      /* Create the _type_ signature for this column */
      const typeSignature = ts.factory.createPropertySignature(
          undefined, // no modifiers
          'type',
          undefined, // no question mark
          typeNode,
      )

      /* Create the property signature for this column */
      const definition: ts.PropertySignature[] = [ typeSignature ]
      if (column.hasDefault) definition.push(hasDefaultSignature)
      if (column.isNullable) definition.push(isNullableSignature)

      const columnSignature = ts.factory.createPropertySignature(
          undefined, // no modifiers
          ts.factory.createStringLiteral(columnName),
          undefined, // no question mark
          ts.factory.createTypeLiteralNode(definition),
      )

      /* If we have a description, add it as a JSDoc comment */
      if (column.description) {
        ts.addSyntheticLeadingComment(
            columnSignature,
            ts.SyntaxKind.MultiLineCommentTrivia,
            `* ${column.description} `,
            true, // trailing newline!
        )
      }

      /* All done with this column, push its signature */
      columns.push(columnSignature)
    }

    /* Create the table signature from all the columns */
    const tableSignature = ts.factory.createPropertySignature(
        undefined, // modifiers
        ts.factory.createStringLiteral(tableName),
        undefined, // question mark
        ts.factory.createTypeLiteralNode(columns), // as any,
    )
    tables.push(tableSignature)
  }

  /* Create our schema declaration, as an exported interface */
  const declaration = ts.factory.createInterfaceDeclaration(
      [ exportModifier ], // export modifier
      id, // the name of the schema, "Schema" or whatever we were given
      undefined, // no type parameters
      undefined, // no heritage clause
      tables, // all our tables signatures
  )

  /* Wrap our source interface declaration in a source file */
  const source = ts.factory.createSourceFile(
      [ declaration ],
      endOfFileToken,
      ts.NodeFlags.None,
  )

  /* Create a printer, and stringify our source file */
  const content = ts.createPrinter().printFile(source)
  console.log('\n\n' + content)

  return content
}
