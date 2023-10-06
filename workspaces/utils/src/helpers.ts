import ts from 'typescript'

export function makePostgresArrayType(type: ts.TypeNode): ts.ArrayTypeNode {
  const nullable = ts.factory.createLiteralTypeNode(ts.factory.createNull())
  const union = ts.factory.createUnionTypeNode([ type, nullable ])
  const array = ts.factory.createArrayTypeNode(union)
  return array
}

export function makeImportTypeNode(
    module: string,
    id: string,
    args: ts.TypeNode | ts.TypeNode[] = [],
): ts.ImportTypeNode {
  if (! Array.isArray(args)) args = [ args ]

  return ts.factory.createImportTypeNode( // ..................... "import"
      ts.factory.createLiteralTypeNode(
          ts.factory.createStringLiteral(module)), // ............ "('module')"
      undefined, // import assertions
      ts.factory.createIdentifier(id), // ........................ ".Type"
      args) // ................................................... "<Arg, ...>"
}
