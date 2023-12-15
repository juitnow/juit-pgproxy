import { Server } from '@juit/pgproxy-server'
import { $und, exec, find, mkdtemp, paths, resolve, rmrf } from '@plugjs/build'

import { databaseName } from '../../../support/setup-db'
import { TestLogger } from '../../../support/utils'

describe('CloudFlare Worker', () => {
  let server: Server | undefined
  let url: URL

  beforeAll(async () => {
    server = await new Server(new TestLogger(), {
      address: 'localhost',
      secret: 'mySuperSecret',
      pool: {
        database: databaseName,
        maximumIdleConnections: 0,
      },
    }).start()

    url = new URL(server.url.href)
    url.username = 'mySuperSecret'
    log.notice(`Using ${$und(url.href)} for tests`)
  })

  afterAll(async () => {
    if (server) await server.stop()
  }, 120_000)


  it('should run under "workerd"', async () => {
    const tempdir = mkdtemp()
    try {
      // copy all our sources in the temp directory
      await find('**/*.*', { directory: paths.requireFilename(__fileurl, 'worker') })
          .copy(tempdir)

      await find('**/*.ts', { directory: paths.requireFilename(__fileurl, 'worker') })
          .esbuild({
            platform: 'neutral',
            bundle: true,
            format: 'esm',
            outdir: tempdir,
            minify: true,
            treeShaking: true,
          })

      await exec('workerd', 'test', resolve(tempdir, 'config.capnp'), {
        env: { PGURL: url.href, PWD: tempdir },
        cwd: tempdir,
      })
    } finally {
      await rmrf(tempdir)
    }
  })
})
