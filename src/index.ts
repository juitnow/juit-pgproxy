import type { Result } from './connection'

export interface Request {
  id: string,
  query: string,
  params?: any[],
}

export interface PositiveResponse extends Result {
  id: string,
  error?: never,
}

export type NegativeResponse = {
  [ key in keyof Result ]?: never
} & {
  id: string,
  error: string,
}

export type Response = {
} & ( PositiveResponse | NegativeResponse )
