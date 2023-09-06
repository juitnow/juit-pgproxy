import { $p, assert, banner, find, isDirectory, merge, parseJson, plugjs, resolve, rmrf, tasks } from '@plugjs/build'

import type { AbsolutePath } from '@plugjs/build'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default (() => {
  /* Our shared build, with all basic tasks */
  const build = tasks({ banners: false })

  /* Read up our "package.json" file and resolve all workspaces */
  const workspaces = ((): AbsolutePath[] => {
    const pkg = parseJson('package.json')
    assert(Array.isArray(pkg.workspaces), 'No workspaces in "package.json"')
    assert(pkg.workspaces.length > 0, 'Zero workspaces in "package.json"')
    return pkg.workspaces.map((dir: string) => resolve(dir))
  })()

  /* Prepare "sourceDir", "testDir" and "destDir" for a workspace */
  function workspaceDirs(workspace: AbsolutePath): {
    sourceDir: AbsolutePath,
    testDir: AbsolutePath,
    destDir: AbsolutePath,
  } {
    return {
      sourceDir: resolve(`${workspace}`, 'src'),
      testDir: resolve(`${workspace}`, 'test'),
      destDir: resolve(`${workspace}`, 'dist'),
    }
  }

  /* ======================================================================== *
   * SHARED MONOREPO BUILD                                                    *
   * ======================================================================== */

  return plugjs({
    /** Transpile all source code in all workspaces */
    async transpile(): Promise<void> {
      for (const workspace of workspaces) {
        banner(`Transpiling sources in ${$p(workspace)}`)
        await build.transpile(workspaceDirs(workspace))
      }
    },

    /* ====================================================================== */

    /** Run CJS and ESM tests in all workspaces */
    async test(): Promise<void> {
      if (isDirectory(build.coverageDataDir)) await rmrf(build.coverageDataDir)

      for (const workspace of workspaces) {
        banner(`Running tests (CJS) in ${$p(workspace)}`)
        await build.test_cjs(workspaceDirs(workspace))

        banner(`Running tests (ESM) in ${$p(workspace)}`)
        await build.test_esm(workspaceDirs(workspace))
      }
    },

    /* ====================================================================== */

    /** Check the _types_ of our tests in all workspaces */
    async test_types(): Promise<void> {
      banner('Checking test types')
      for (const workspace of workspaces) {
        await build.test_types(workspaceDirs(workspace))
      }
    },

    /* ====================================================================== */

    /** Run all tests and generate a global coverage report */
    async coverage(): Promise<void> {
      // Capture error from running tests, but always produce coverage
      try {
        await this.test()
      } finally {
        banner('Preparing coverage report')

        await merge(workspaces.map((workspace) => {
          return build._find_coverage_sources(workspaceDirs(workspace))
        })).coverage(build.coverageDataDir, {
          reportDir: build.coverageDir,
          minimumCoverage: 100,
          minimumFileCoverage: 100,
        })
      }
    },

    /* ====================================================================== */

    /** Lint all sources in all workspaces, and some local ones */
    async lint(): Promise<void> {
      banner('Linting sources')

      await merge([
        find('build.ts', { directory: '.' }),
        find('**/*.([cm])?ts', '**/*.([cm])?js', { directory: 'support' }),
        ...workspaces.map((ws) => build._find_lint_sources(workspaceDirs(ws))),
      ]).eslint()
    },

    /* ====================================================================== */

    /** Do everything... */
    async default(): Promise<void> {
      await this.transpile()
      await this.test_types()
      await this.coverage()
      await this.lint()
    },
  })
})()
