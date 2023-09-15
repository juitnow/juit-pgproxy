import type { ConnectionQueryResult } from '@juit/pgproxy-pool'

export * from './server'

export interface Request {
  id: string,
  query: string,
  params?: (string | null)[],
}

export interface PositiveResponse extends ConnectionQueryResult {
  statusCode: 200,
  error?: never,
}

export type NegativeResponse = {
  [ key in keyof ConnectionQueryResult ]?: never
} & {
  statusCode: 400 | 500,
  error: string,
}

export type Response = {
  id: string,
  // statusCode: number,
} & ( PositiveResponse | NegativeResponse )
