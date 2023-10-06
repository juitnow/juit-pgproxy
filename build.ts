import { $p, assert, banner, find, isDirectory, log, merge, parseJson, plugjs, resolve, rmrf, tasks } from '@plugjs/build'
import '@plugjs/tsd'

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
  interface Workspace {
    workspaceDir: AbsolutePath,
    sourceDir: AbsolutePath,
    testDir: AbsolutePath,
    destDir: AbsolutePath,
    extraTypesDir: AbsolutePath,
    tsconfigJson: AbsolutePath,
  }

  /** Find the workspaces associated with the specified identifier */
  function* findWorkspaces(workspace: string): Generator<Workspace> {
    const workspaceDir = workspace ?
      workspace.indexOf('/') < 0 ?
      resolve('workspaces', workspace) :
        workspace = resolve(workspace) :
      undefined

    let matched = false
    for (const workspace of workspaces) {
      if ((! workspaceDir) || (workspace === workspaceDir)) {
        matched = true
        yield {
          workspaceDir: workspace,
          sourceDir: resolve(workspace, 'src'),
          testDir: resolve(workspace, 'test'),
          destDir: resolve(workspace, 'dist'),
          tsconfigJson: resolve(workspace, 'tsconfig-transpile.json'),
          extraTypesDir: resolve(workspace, 'types'),
        }
      }
    }

    if (! matched) {
      log.error(`No workspace matches ${$p(workspaceDir!)}, available workspaces:`)
      for (const ws of workspaces) log.error('-', $p(ws))
      log.fail('')
    }
  }

  /* ======================================================================== *
   * SHARED MONOREPO BUILD                                                    *
   * ======================================================================== */

  return plugjs({
    workspace: '',

    /** Transpile all source code in all workspaces */
    async transpile(): Promise<void> {
      for (const dirs of findWorkspaces(this.workspace)) {
        banner(`Transpiling sources in ${$p(dirs.workspaceDir)}`)
        await build.transpile(dirs)
      }
    },

    /* ====================================================================== */

    /** Run CJS and ESM tests in all workspaces */
    async test(): Promise<void> {
      if (isDirectory(build.coverageDataDir)) await rmrf(build.coverageDataDir)

      let success = true

      for (const workspace of findWorkspaces(this.workspace)) {
        try {
          banner(`Running tests (CJS) in ${$p(workspace.workspaceDir)}`)
          await build.test_cjs(workspace)

          banner(`Running tests (ESM) in ${$p(workspace.workspaceDir)}`)
          await build.test_esm(workspace)
        } catch (error) {
          log.error(error)
          success = false
        }
      }

      assert(success, 'Test failure')
    },

    /* ====================================================================== */

    /** Check the _types_ of our tests in all workspaces */
    async test_types(): Promise<void> {
      for (const workspace of findWorkspaces(this.workspace)) {
        banner(`Checking test types in ${$p(workspace.workspaceDir)}`)
        await build.test_types(workspace)
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

        await merge([ ...findWorkspaces(this.workspace) ].map((workspace) => {
          return build._find_coverage_sources(workspace)
        })).filter('**/*.*', {
          directory: resolve('.'),
        }) .coverage(build.coverageDataDir, {
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
        find('**/*.([cm])?ts', '**/*.([cm])?js', { directory: 'test-d' }),
        find('**/*.([cm])?ts', '**/*.([cm])?js', { directory: 'support' }),
        ...[ ...findWorkspaces(this.workspace) ].map((ws) => build._find_lint_sources(ws)),
      ]).eslint()
    },

    /* ====================================================================== */

    /** Run `tsd` */
    async tsd(): Promise<void> {
      banner('Testing type definitions')
      await find('**/*.test-d.ts', { directory: 'test-d' }).tsd({
        cwd: 'test-d',
      })
    },

    /* ====================================================================== */

    /** Do everything... */
    async default(): Promise<void> {
      await this.transpile()
      await this.test_types()
      await this.tsd()
      await this.coverage()
      await this.lint()
    },
  })
})()
