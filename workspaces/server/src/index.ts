import type { ConnectionQueryResult } from '@juit/pgproxy-pool'

export interface Request {
  id: string,
  query: string,
  params?: any[],
}

export interface PositiveResponse extends ConnectionQueryResult {
  error?: never,
}

export type NegativeResponse = {
  [ key in keyof ConnectionQueryResult ]?: never
} & {
  error: string,
}

export type Response = {
  id: string,
  statusCode: number,
} & ( PositiveResponse | NegativeResponse )
