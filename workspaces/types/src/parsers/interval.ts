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

/** Constructor for {@link PGInterval} */
export interface PGIntervalConstructor {
  new (value: string): PGInterval
}

// The "postgres-interval" code exports a function, not a class, but still
// declares all its prototype and whatnot in there... Types are wrong!
const PostgresInterval: PGIntervalConstructor = postgresInterval as any

/** A parsed PostgreSQL `interval` */
export const PGInterval: PGIntervalConstructor = class PGIntervalImpl
  extends PostgresInterval
  implements PGInterval {
  constructor(value: string) {
    super(value)
  }
}

/** Parse a PostgreSQL `interval` */
export const parseInterval: PGParser<PGInterval> = (value: string) => new PGInterval(value)
