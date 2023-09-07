/** Pad a number with zeroes to the specified number of digits */
function pad(number: number, digits: number): string {
  return number.toString().padStart(digits, '0')
}

// /* THIS IS UNTESTABLE: We can't set the timezone offset in a JavaScript date,
//  * it's always the _local_ one (which basically means, depends on where the
//  * tester actually _is_)... So until we get some inspiration, let's keep the
//  * code here but don't develop it further... */
//
// /** Serialize a {@link Date} as a timestamp preserving its time zone */
// export function serializeDateWithTimezone(date: Date): string {
//   if (isNaN(date.getTime())) throw new TypeError('Attempted to serialize invalid date')
//
//   let offset = -date.getTimezoneOffset()
//
//   let year = date.getFullYear()
//   const isBCYear = year < 1
//   if (isBCYear) year = Math.abs(year) + 1 // negative years are 1 off their BC representation
//
//   let result =
//     pad(year, 4) + '-' +
//     pad(date.getMonth() + 1, 2) + '-' +
//     pad(date.getDate(), 2) + 'T' +
//     pad(date.getHours(), 2) + ':' +
//     pad(date.getMinutes(), 2) + ':' +
//     pad(date.getSeconds(), 2) + '.' +
//     pad(date.getMilliseconds(), 3)
//
//   if (offset < 0) {
//     result += '-'
//     offset *= -1
//   } else {
//     result += '+'
//   }
//
//   result += pad(Math.floor(offset / 60), 2) + ':' + pad(offset % 60, 2)
//   if (isBCYear) result += ' BC'
//
//   return result
// }

/** Serialize a {@link Date} as a timestamp always in the UTC time zone */
export function serializeDateUTC(date: Date): string {
  if (isNaN(date.getTime())) throw new TypeError('Attempted to serialize invalid date')

  let year = date.getUTCFullYear()
  const isBCYear = year < 1
  if (isBCYear) year = Math.abs(year) + 1 // negative years are 1 off their BC representation

  let ret =
    pad(year, 4) + '-' +
    pad(date.getUTCMonth() + 1, 2) + '-' +
    pad(date.getUTCDate(), 2) + 'T' +
    pad(date.getUTCHours(), 2) + ':' +
    pad(date.getUTCMinutes(), 2) + ':' +
    pad(date.getUTCSeconds(), 2) + '.' +
    pad(date.getUTCMilliseconds(), 3)

  ret += '+00:00'
  if (isBCYear) ret += ' BC'
  return ret
}
