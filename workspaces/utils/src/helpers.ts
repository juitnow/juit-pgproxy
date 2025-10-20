import ts from 'typescript'

/**
 * Create a "branding" type extension, like `Original & { __brand: never }`.
 */
export function makeBrandingType(branding: string): ts.TypeLiteralNode {
  const neverType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword)
  const signature = ts.factory.createPropertySignature(undefined, branding, undefined, neverType)
  return ts.factory.createTypeLiteralNode([ signature ])
}


/**
 * Create a PosgreSQL array type for the given type, that is, given the type
 * `T`, return `(T | null)[]`
 */
export function makePostgresArrayType(type: ts.TypeNode): ts.ArrayTypeNode {
  const nullable = ts.factory.createLiteralTypeNode(ts.factory.createNull())
  const union = ts.factory.createUnionTypeNode([ type, nullable ])
  const array = ts.factory.createArrayTypeNode(union)
  return array
}

/**
 * Create an _import_ type, like `import('module').Name<arg0, arg1, ...>`.
 */
export function makeImportType(
    module: string,
    name: string,
    args: ts.TypeNode | ts.TypeNode[] = [],
): ts.ImportTypeNode {
  if (! Array.isArray(args)) args = [ args ]

  return ts.factory.createImportTypeNode( // ..................... "import"
      ts.factory.createLiteralTypeNode(
          ts.factory.createStringLiteral(module)), // ............ "('module')"
      undefined, // import assertions
      ts.factory.createIdentifier(name), // ........................ ".Type"
      args) // ................................................... "<Arg, ...>"
}
