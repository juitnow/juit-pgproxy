import postgresInterval from 'postgres-interval'

import type { PGParser } from '../parsers'

/** A parsed PostgreSQL `interval` */
export interface PGInterval {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;

  toISO(): string;
  toISOString(): string;
  toISOStringShort(): string;
}

/** Parse a PostgreSQL `interval` */
export const parseInterval: PGParser<PGInterval> = postgresInterval