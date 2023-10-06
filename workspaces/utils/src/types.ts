import ts from 'typescript'

import { makeImportTypeNode, makePostgresArrayType } from './helpers'

/* Null and void */
export const nullType = ts.factory.createLiteralTypeNode(ts.factory.createNull())
export const voidType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)

/* Basic types and primitives */
export const anyType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
export const bigintType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.BigIntKeyword)
export const booleanType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
export const numberType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
export const stringType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)

/* Objects */
export const dateType = ts.factory.createTypeReferenceNode('Date')
export const uint8ArrayType = ts.factory.createTypeReferenceNode('Uint8Array')

/* Basic arrays */
export const anyArrayType = makePostgresArrayType(anyType)
export const bigintArrayType = makePostgresArrayType(bigintType)
export const booleanArrayType = makePostgresArrayType(booleanType)
export const numberArrayType = makePostgresArrayType(numberType)
export const stringArrayType = makePostgresArrayType(stringType)

/* Object arrays */
export const dateArrayType = makePostgresArrayType(dateType)
export const uint8ArrayArrayType = makePostgresArrayType(uint8ArrayType)

/* Imported */
export const pgCircleType: ts.TypeNode = makeImportTypeNode('@juit/pgproxy-types', 'PGCircle')
export const pgIntervalType: ts.TypeNode = makeImportTypeNode('@juit/pgproxy-types', 'PGInterval')
export const pgPointType: ts.TypeNode = makeImportTypeNode('@juit/pgproxy-types', 'PGPoint')

/* Imported arrays */
export const pgCircleArrayType = makePostgresArrayType(pgCircleType)
export const pgIntervalArrayType = makePostgresArrayType(pgIntervalType)
export const pgPointArrayType = makePostgresArrayType(pgPointType)

/* Ranges */
export const bigintRangeType = makeImportTypeNode('@juit/pgproxy-types', 'PGRange', bigintType)
export const numberRangeType = makeImportTypeNode('@juit/pgproxy-types', 'PGRange', numberType)
export const stringRangeType = makeImportTypeNode('@juit/pgproxy-types', 'PGRange', stringType)
export const dateRangeType = makeImportTypeNode('@juit/pgproxy-types', 'PGRange', dateType)

/* Range arrays */
export const bigintRangeArrayType = makePostgresArrayType(bigintRangeType)
export const numberRangeArrayType = makePostgresArrayType(numberRangeType)
export const stringRangeArrayType = makePostgresArrayType(stringRangeType)
export const dateRangeArrayType = makePostgresArrayType(dateRangeType)
