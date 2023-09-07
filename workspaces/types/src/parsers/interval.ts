import postgresInterval from 'postgres-interval'

import type { PGParser } from '../parsers'
import type { PGSerializable } from '../serializers'

/** A parsed PostgreSQL `interval` */
export interface PGInterval extends PGSerializable {
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
