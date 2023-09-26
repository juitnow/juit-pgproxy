#!/usr/bin/env node
/* coverage ignore file */
/* eslint-disable no-console */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Server } from '@juit/pgproxy-server'
import { config as dotEnvConfig } from 'dotenv'
import { parse } from 'ini'
import { boolean, number, object, oneOf, optional, string, validate } from 'justus'
import yargsParser from 'yargs-parser'

import type { Logger } from '@juit/pgproxy-pool'
import type { ServerOptions } from '@juit/pgproxy-server'

/* Basic logger, used throughout */
const logger: Logger = {
  debug: function(...args: any[]): void {
    if (debug) console.log('[DEBUG]', ...args)
  },
  info: function(...args: any[]): void {
    console.log('[INFO] ', ...args)
  },
  warn: function(...args: any[]): void {
    console.log('[WARN] ', ...args)
  },
  error: function(...args: any[]): void {
    console.log('[ERROR]', ...args)
  },
}

/* ========================================================================== *
 * HELP AND VERSION                                                           *
 * ========================================================================== */

function showHelp(): never {
  console.log(`
Usage:

  pgproxy-server [--options ...] [config file]

Options:

  --debug         Enable verbose logging.
  --help          Show this help page and exit.
  --version       Show version information and exit.

  [config file]   An optional configuration file (in ".ini" format).

Environment variables:

  HTTP Server:

    PGPROXYSECRET        The secret used to authenticate clients.
    PGPROXYADDRESS       The address where this server will be bound to.
    PGPROXYPORT          The port number where this server will be bound to.
    PGPROXYHEALTHCHECK   Path for the unauthenticated health check GET request.

  Connection Pool:

    PGPOOLMINSIZE          Minimum number of connections to keep in the pool.
    PGPOOLMAXSIZE          Maximum number of connections to keep in the pool.
    PGPOOLIDLECONN         Maximum number of idle connections in the pool.
    PGPOOLACQUIRETIMEOUT   Number of seconds after which 'acquire()' will fail.
    PGPOOLBORROWTIMEOUT    Maximum seconds a connection can be borrowed for.
    PGPOOLRETRYINTERVAL    Seconds to wait after connection creation failed.

  PostgreSQL:

    PGHOST       Name of host to connect to.
    PGPORT       Port number to connect to at the server host.
    PGDATABASE   The database name.
    PGUSER       PostgreSQL user name to connect as.
    PGPASSWORD   Password to be used if the server demands authentication.

    See also: https://www.postgresql.org/docs/current/libpq-envars.html

Remarks:

  Environment variables will also be read from a ".env" file in the current
  directory (if such file exists).

  See also: https://github.com/motdotla/dotenv
`)
  process.exit(1)
}

function showVersion(): never {
  const path = fileURLToPath(import.meta.url)
  const file = resolve(path, '..', '..', 'package.json')
  const data = readFileSync(file, 'utf-8')
  const json = JSON.parse(data)
  console.log(`v${json.version}`)
  process.exit(1)
}

/* ========================================================================== *
 * CONFIGURATION                                                              *
 * ========================================================================== */

/* Validation */
const booleanValidator = boolean({ fromString: true })
const numberValidator = number({ fromString: true, minimum: 0 })
const stringValidator = string({ minLength: 1 })

/* PoolOptions validator */
const poolValidator = object({
  /* Connection pool options */
  acquireTimeout: optional(numberValidator),
  borrowTimeout: optional(numberValidator),
  maximumIdleConnections: optional(numberValidator),
  maximumPoolSize: optional(numberValidator),
  minimumPoolSize: optional(numberValidator),
  retryInterval: optional(numberValidator),
  /* LibPQ options */
  address: optional(stringValidator),
  applicationName: optional(stringValidator),
  connectTimeout: optional(numberValidator),
  database: optional(stringValidator),
  gssLibrary: optional('gssapi'),
  host: optional(stringValidator),
  keepalives: optional(booleanValidator),
  keepalivesCount: optional(numberValidator),
  keepalivesIdle: optional(numberValidator),
  keepalivesInterval: optional(numberValidator),
  kerberosServiceName: optional(stringValidator),
  password: optional(stringValidator),
  port: optional(numberValidator),
  sslCertFile: optional(stringValidator),
  sslCompression: optional(booleanValidator),
  sslCrlFile: optional(stringValidator),
  sslKeyFile: optional(stringValidator),
  sslMode: optional(oneOf('disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full')),
  sslRootCertFile: optional(stringValidator),
  user: optional(stringValidator),
})

/* ServerOptions validator */
const serverValidator = object({
  /* Proxy server */
  secret: string({ minLength: 8 }),
  address: optional(string({ minLength: 1 })),
  port: optional(numberValidator),
  backlog: optional(numberValidator),
  healthCheck: optional(stringValidator),
  /* Connection pool & database */
  pool: optional(poolValidator),
  /* Node HTTP server options */
  connectionsCheckingInterval: optional(numberValidator),
  highWaterMark: optional(numberValidator),
  insecureHTTPParser: optional(booleanValidator),
  joinDuplicateHeaders: optional(booleanValidator),
  keepAlive: optional(booleanValidator),
  keepAliveInitialDelay: optional(numberValidator),
  keepAliveTimeout: optional(numberValidator),
  maxHeaderSize: optional(numberValidator),
  noDelay: optional(booleanValidator),
  requestTimeout: optional(numberValidator),
})

function readConfigs(files: string[]): ServerOptions {
  /* First, parse any and all ".env" file in CWD for environment variables */
  dotEnvConfig()

  /* Base configuration fron environment variables */
  const config: Record<string, string | undefined> = {
    secret: process.env.PGPROXYSECRET,
    address: process.env.PGPROXYADDRESS,
    port: process.env.PGPROXYPORT || '54321',
    healthCheck: process.env.PGPROXYHEALTHCHECK,
  }

  /* Parse command line files */
  for (const file of files) {
    const text = readFileSync(file, 'utf-8')
    Object.assign(config, parse(text))
  }

  /* Validate and return our options */
  return validate(serverValidator, config)
}


/* ========================================================================== *
 * STARTUP                                                                    *
 * ========================================================================== */

/* Then parse our command line arguments */
const { _: args, ...opts } = yargsParser(process.argv.slice(2), {
  configuration: {
    'camel-case-expansion': false,
    'strip-aliased': true,
    'strip-dashed': true,
  },
  alias: {
    'debug': [ 'd' ],
    'help': [ 'h' ],
    'version': [ 'v' ],
  },
  boolean: [
    'debug',
    'help',
    'version',
  ],
})

/* Process each option, one by one */
const files = args.map((arg) => `${arg}`)
const debug = !! opts.debug
if (opts.help) showHelp()
if (opts.version) showVersion()
for (const key of Object.keys(opts)) {
  switch (key) {
    case 'debug':
    case 'help':
    case 'version':
      continue
    default:
      logger.error(`Unsupported / unknown option: --${key}\n`)
      showHelp()
  }
}

/* Read our configs */
let options: ServerOptions
try {
  options = readConfigs(files)
} catch (error: any) {
  logger.error(error.message)
  process.exit(1)
}

/* Start our server */
let server = new Server(logger, options)
await server.start()
logger.info(`DB proxy server running with PID ${process.pid}`)

/* Gracefully terminate on CTRL-C or "kill -TERM $PID" */
process.on('SIGINT', () => server.stop()
    .then(() => process.exitCode = 0)
    .catch((error) => {
      logger.error(error)
      process.exit(1)
    }))
process.on('SIGTERM', () => server.stop()
    .then(() => process.exitCode = 0)
    .catch((error) => {
      logger.error(error)
      process.exit(1)
    }))

/* Reload configurations and restart server on "kill -HUP $PID" */
process.on('SIGHUP', () => {
  try {
    options = readConfigs(files)
  } catch (error: any) {
    logger.error(error.message)
    logger.error('Not restarting running server')
  }

  server.stop()
      .then(() => {
        server = new Server(logger, options)
        return server.start()
      })
      .catch((error) => {
        logger.error(error)
        process.exit(1) // critical, let systemd handle restarts!
      })
})
