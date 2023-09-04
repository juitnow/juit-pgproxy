import type { Result } from './connection'

export interface Request {
  id: string,
  query: string,
  params?: any[],
}

export interface PositiveResponse extends Result {
  error?: never,
}

export type NegativeResponse = {
  [ key in keyof Result ]?: never
} & {
  error: string,
}

export type Response = {
  id: string,
  statusCode: number,
} & ( PositiveResponse | NegativeResponse )
