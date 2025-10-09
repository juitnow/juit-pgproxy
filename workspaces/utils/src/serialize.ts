import { PGOIDs } from '@juit/pgproxy-types'
import ts from 'typescript'

import * as types from './types'

import type { Schema } from './index'

/* ========================================================================== *
 * TYPES AND CONSTANTS                                                        *
 * ========================================================================== */

const exportModifier = ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)
const endOfFileToken = ts.factory.createToken(ts.SyntaxKind.EndOfFileToken)

const oidTypes = {
  /* Basic known types                                |_oid__|_typname______| */
  [PGOIDs.bool]: types.booleanType, /*                |   16 | bool         | */
  [PGOIDs.bytea]: types.uint8ArrayType, /*            |   17 | bytea        | */
  [PGOIDs.int8]: types.bigintType, /*                 |   20 | int8         | */
  [PGOIDs.int2]: types.numberType, /*                 |   21 | int2         | */
  [PGOIDs.int4]: types.numberType, /*                 |   23 | int4         | */
  [PGOIDs.oid]: types.numberType, /*                  |   26 | oid          | */
  [PGOIDs.json]: types.anyType, /*                    |  114 | json         | */
  [PGOIDs.point]: types.pgPointType, /*               |  600 | point        | */
  [PGOIDs.float4]: types.numberType, /*               |  700 | float4       | */
  [PGOIDs.float8]: types.numberType, /*               |  701 | float8       | */
  [PGOIDs.circle]: types.pgCircleType, /*             |  718 | circle       | */
  [PGOIDs.varchar]: types.stringType, /*              | 1043 | varchar      | */
  [PGOIDs.timestamp]: types.dateType, /*              | 1114 | timestamp    | */
  [PGOIDs.timestamptz]: types.dateType, /*            | 1184 | timestamptz  | */
  [PGOIDs.interval]: types.pgIntervalType, /*         | 1186 | interval     | */
  [PGOIDs.numeric]: types.stringType, /*              | 1700 | numeric      | */
  [PGOIDs.jsonb]: types.anyType, /*                   | 3802 | jsonb        | */

  /* Special types                                    |_oid__|_typname______| */
  [PGOIDs.void]: types.voidType, /*                   | 2278 | void         | */
  [PGOIDs.xid]: types.numberType, /*                  |   28 | xid          | */
  [PGOIDs.xid8]: types.bigintType, /*                 | 5069 | xid8         | */
  [PGOIDs._xid]: types.numberArrayType, /*            | 1011 | _xid         | */
  [PGOIDs._xid8]: types.bigintArrayType, /*           |  271 | _xid8        | */

  /* Native array types of the above                  |_oid__|_typname______| */
  [PGOIDs._bool]: types.booleanArrayType, /*          | 1000 | _bool        | */
  [PGOIDs._bytea]: types.uint8ArrayArrayType, /*      | 1001 | _bytea       | */
  [PGOIDs._int8]: types.bigintArrayType, /*           | 1016 | _int8        | */
  [PGOIDs._int2]: types.numberArrayType, /*           | 1005 | _int2        | */
  [PGOIDs._int4]: types.numberArrayType, /*           | 1007 | _int4        | */
  [PGOIDs._oid]: types.numberArrayType, /*            | 1028 | _oid         | */
  [PGOIDs._json]: types.anyArrayType, /*              |  199 | _json        | */
  [PGOIDs._point]: types.pgPointArrayType, /*         | 1017 | _point       | */
  [PGOIDs._float4]: types.numberArrayType, /*         | 1021 | _float4      | */
  [PGOIDs._float8]: types.numberArrayType, /*         | 1022 | _float8      | */
  [PGOIDs._circle]: types.pgCircleArrayType, /*       |  719 | _circle      | */
  [PGOIDs._timestamp]: types.dateArrayType, /*        | 1115 | _timestamp   | */
  [PGOIDs._timestamptz]: types.dateArrayType, /*      | 1185 | _timestamptz | */
  [PGOIDs._interval]: types.pgIntervalArrayType, /*   | 1187 | _interval    | */
  [PGOIDs._numeric]: types.stringArrayType, /*        | 1231 | _numeric     | */
  [PGOIDs._jsonb]: types.anyArrayType, /*             | 3807 | _jsonb       | */

  /* Other known array types                          |_oid__|_typname______| */
  [PGOIDs._cidr]: types.stringArrayType, /*           |  651 | _cidr        | */
  [PGOIDs._money]: types.stringArrayType, /*          |  791 | _money       | */
  [PGOIDs._regproc]: types.stringArrayType, /*        | 1008 | _regproc     | */
  [PGOIDs._text]: types.stringArrayType, /*           | 1009 | _text        | */
  [PGOIDs._bpchar]: types.stringArrayType, /*         | 1014 | _bpchar      | */
  [PGOIDs._varchar]: types.stringArrayType, /*        | 1015 | _varchar     | */
  [PGOIDs._macaddr]: types.stringArrayType, /*        | 1040 | _macaddr     | */
  [PGOIDs._inet]: types.stringArrayType, /*           | 1041 | _inet        | */
  [PGOIDs._date]: types.stringArrayType, /*           | 1182 | _date        | */
  [PGOIDs._time]: types.stringArrayType, /*           | 1183 | _time        | */
  [PGOIDs._timetz]: types.stringArrayType, /*         | 1270 | _timetz      | */
  [PGOIDs._uuid]: types.stringArrayType, /*           | 2951 | _uuid        | */

  /* Range types                                      |_oid__|_typname______| */
  [PGOIDs.int4range]: types.numberRangeType, /*       | 3904 | int4range    | */
  [PGOIDs.numrange]: types.numberRangeType, /*        | 3906 | numrange     | */
  [PGOIDs.tsrange]: types.dateRangeType, /*           | 3908 | tsrange      | */
  [PGOIDs.tstzrange]: types.dateRangeType, /*         | 3910 | tstzrange    | */
  [PGOIDs.daterange]: types.stringRangeType, /*       | 3912 | daterange    | */
  [PGOIDs.int8range]: types.bigintRangeType, /*       | 3926 | int8range    | */

  /* Array of range types                             |_oid__|_typname______| */
  [PGOIDs._int4range]: types.numberRangeArrayType, /* | 3905 | _int4range   | */
  [PGOIDs._numrange]: types.numberRangeArrayType, /*  | 3907 | _numrange    | */
  [PGOIDs._tsrange]: types.dateRangeArrayType, /*     | 3909 | _tsrange     | */
  [PGOIDs._tstzrange]: types.dateRangeArrayType, /*   | 3911 | _tstzrange   | */
  [PGOIDs._daterange]: types.stringRangeArrayType, /* | 3913 | _daterange   | */
  [PGOIDs._int8range]: types.bigintRangeArrayType, /* | 3927 | _int8range   | */
} satisfies Record<PGOIDs[keyof PGOIDs], ts.TypeNode>

const trueLiteralTypeNode = ts.factory.createLiteralTypeNode(
    ts.factory.createToken(ts.SyntaxKind.TrueKeyword))

const isGeneratedSignature = ts.factory.createPropertySignature(
    undefined, // no modifiers
    'isGenerated',
    undefined, // no question mark
    trueLiteralTypeNode)

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
    overrides: Record<number, ts.TypeNode> = {},
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
      if (column.oid in overrides) {
        typeNode = overrides[column.oid]!

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
        typeNode = types.stringType
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
      if (column.isGenerated) definition.push(isGeneratedSignature)

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
  return content
}
