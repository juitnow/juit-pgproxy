/** The identity {@link PGParser}, returning the same string from input */
export const identityParser: PGParser<string> = (value: string): string => value

/** A function parsing a `string` returned from PostgreSQL */
export type PGParser<T = string> = (value: string) => T

/** A parsed PostgreSQL `point` */
export interface PGPoint {
  x: number,
  y: number,
}

/** A parsed PostgreSQL `circle` */
export interface PGCircle extends PGPoint {
  radius: number,
}

/** A parsed PostgreSQL `array` */
export type PGArray<T = string> = (T | null)[]

/** A parsed PostgreSQL `range` */
export interface PGRange<T = string> {
  lower: T | null;
  upper: T | null;

  isEmpty (): boolean;
  isBounded (): boolean;
  isLowerBoundClosed (): boolean;
  isUpperBoundClosed (): boolean;
  hasLowerBound (): boolean;
  hasUpperBound (): boolean;

  containsPoint (point: T): boolean;
  containsRange (range: PGRange<T>): boolean;
}

/** A parsed PostgreSQL `interval` */
export interface PGInterval {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;

  toPostgres(): string;

  toISO(): string;
  toISOString(): string;
  toISOStringShort(): string;
}
