/** A base Logger class that can be used to inject */
export interface Logger {
  /** Log a message at `DEBUG` level */
  readonly debug: (...args: any[]) => void
  /** Log a message at `INFO` level */
  readonly info: (...args: any[]) => void
  /** Log a message at `WARN` level */
  readonly warn: (...args: any[]) => void
  /** Log a message at `ERROR` level */
  readonly error: (...args: any[]) => void
}
