import configurations from '@plugjs/eslint-plugin'

export default [
  ...configurations,

  // ===== DEFINE THE LOCATION OF OUR TSCONFIG.JSON FILES ======================
  {
    languageOptions: {
      parserOptions: {
        createDefaultProgram: false,
        project: [
          'tsconfig.json',
          'support/tsconfig.json',
          'workspaces/client/test/tsconfig.json',
          'workspaces/client/tsconfig.json',
          'workspaces/pool/test/tsconfig.json',
          'workspaces/pool/tsconfig.json',
          'workspaces/server/test/tsconfig.json',
          'workspaces/server/tsconfig.json',
          'workspaces/types/test/tsconfig.json',
          'workspaces/types/tsconfig.json',
        ],
      },
    },
  },

  // ===== ENSURE THAT OUR MAIN FILES DEPEND ONLY ON PROPER DEPENDENCIES =======
  {
    files: [ 'src/**' ],
    rules: {
      // Turn _ON_ dependencies checks only for sources
      'import-x/no-extraneous-dependencies': [ 'error', {
        'devDependencies': true,
        'peerDependencies': true,
        'optionalDependencies': true,
        'bundledDependencies': false,
      } ],
    },
  },

  // ===== PROJECT LOCAL RULES =================================================
  // Add any extra rule not tied to a specific "files" pattern here, e.g.:
  {
    rules: {
      '@stylistic/operator-linebreak': [ 'off', 'after', {
        'overrides': {
          '?': 'before',
          ':': 'before',
          '|': 'before',
        },
      } ],
      '@stylistic/indent': [ 'error', 2, {
        CallExpression: {
          'arguments': 2,
        },
        FunctionDeclaration: {
          'body': 1,
          'parameters': 2,
        },
        FunctionExpression: {
          'body': 1,
          'parameters': 2,
        },
        MemberExpression: 2,
        ObjectExpression: 1,
        SwitchCase: 1,
        flatTernaryExpressions: true,
        offsetTernaryExpressions: false,
        // ignoredNodes: [],
      } ],

    },
  },

  // ===== IGNORED FILES =======================================================
  // REMEMBER! Ignores *must* be in its own configuration, they can not coexist
  // with "rules", "languageOptions", "files", ... or anything else, otherwise
  // ESLint will blaantly ignore the ignore files!
  {
    ignores: [
      'coverage/',
      'dist/',
      'node_modules/',
    ],
  },
]
