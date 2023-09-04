import { createHmac, randomBytes } from 'node:crypto'
import { request } from 'node:http'

import { $gry, context } from '@plugjs/build'

import type { Logger } from '../src/logger'


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

/**
 * Use a simplified `fetch`, the normal one leaves sockets around when
 * connecting to localhost and _sometimes_ our tests don't end...
 */
export function fetch(url: URL, options: {
  method?: 'POST' | 'GET' | 'OPTIONS',
  headers?: Record<string, string>,
  body?: any,
  bodyRaw?: any,
}): Promise<{ status: number, body: object }> {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: options.method || 'POST',
      headers: {
        'content-type': 'application/json',
        ...options.headers,
      },
    }, (res) => {
      const buffers: Buffer[] = []

      res.on('data', (buffer) => buffers.push(buffer))
      res.on('error', (error) => reject(error))
      res.on('end', () => {
        try {
          const json = Buffer.concat(buffers).toString('utf-8')
          const body = json ? JSON.parse(json) : undefined
          return resolve({ status: res.statusCode || 500, body })
        } catch (error) {
          reject(error)
        }
      })
    })

    if (options.body) options.bodyRaw = JSON.stringify(options.body)
    if (options.bodyRaw) req.write(options.bodyRaw, (err) => (err && reject(err)))
    req.end()
  })
}
