import { createHmac, randomBytes } from 'node:crypto'

import { $gry, context } from '@plugjs/build'

import type { Logger } from '../workspaces/pool/src/index'

/** Our test logger */
export class TestLogger implements Logger {
  private _testLogs = process.env.TEST_LOGS === 'true'
  private _logger = context().log

  debug(...args: any[]): void {
    if (this._testLogs) this._logger.info($gry('[dbg]'), ...args)
  }

  info(...args: any[]): void {
    if (this._testLogs) this._logger.notice($gry('[nfo]'), ...args)
  }

  warn(...args: any[]): void {
    if (this._testLogs) this._logger.warn($gry('[wrn]'), ...args)
  }

  error(...args: any[]): void {
    if (this._testLogs) this._logger.error($gry('[err]'), ...args)
  }
}

/** Sleep for a few milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Create our authentication token */
export function createToken(secret: string): Buffer {
  const buffer = randomBytes(48)

  buffer.writeBigInt64LE(BigInt(Date.now()), 0)

  createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(buffer.subarray(0, 16))
      .digest()
      .copy(buffer, 16)

  return buffer
}

/** Restore an environment variable */
export function restoreEnv(variable: string, value: string | undefined): void {
  if (value == null) delete process.env[variable]
  else process.env[variable] = value
}
