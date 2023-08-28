import { $gry, context } from '@plugjs/build'

import type { Logger } from '../src/logger'

const testLogs = process.env.TEST_LOGS === 'true'

export class TestLogger implements Logger {
  private _logger = context().log

  debug(...args: any[]): void {
    if (testLogs) this._logger.info($gry('[dbg]'), ...args)
  }

  info(...args: any[]): void {
    if (testLogs) this._logger.notice($gry('[nfo]'), ...args)
  }

  warn(...args: any[]): void {
    if (testLogs) this._logger.warn($gry('[wrn]'), ...args)
  }

  error(...args: any[]): void {
    if (testLogs) this._logger.error($gry('[err]'), ...args)
  }
}
