'use strict'

module.exports = {
  root: true,
  extends: [
    'plugin:@plugjs/typescript',
  ],
  parserOptions: {
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
}
