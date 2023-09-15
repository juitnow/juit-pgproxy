export function msg(message: string | null | undefined, defaultMessage: string): string {
  return message || /* coverage ignore next */ defaultMessage
}
