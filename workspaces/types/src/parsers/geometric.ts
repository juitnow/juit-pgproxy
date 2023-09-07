import type { PGParser } from '../parsers'
import type { PGSerializable } from '../serializers'

/* ========================================================================== *
 * GEOMETRIC TYPES                                                            *
 * ========================================================================== */

/** A parsed PostgreSQL `point` */
export interface PGPoint extends PGSerializable {
  readonly x: number,
  readonly y: number,
}

/** A parsed PostgreSQL `circle` */
export interface PGCircle extends PGPoint {
  readonly radius: number,
}

/** Constructor for {@link PGPoint} */
export interface PGPointConstructor {
  new(x: number, y: number): PGPoint
}

/** Constructor for {@link PGCircle} */
export interface PGCircleConstructor {
  new(x: number, y: number, radius: number): PGCircle
}


/** Create a new {@link PGPoint} instance */
export const PGPoint: PGPointConstructor = class PGPoint implements PGPoint {
  constructor(public readonly x: number, public readonly y: number) {}

  toPostgres(): string {
    return `(${this.x},${this.y})`
  }
}

/** Create a new {@link PGCircle} instance */
export const PGCircle: PGCircleConstructor = class PGCircle extends PGPoint implements PGCircle {
  constructor(x: number, y: number, public readonly radius: number) {
    super(x, y)
  }

  toPostgres(): string {
    return `<(${this.x},${this.y}),${this.radius}>`
  }
}

/* ===== INVALID CONSTANTS ================================================== */

const INVALID_POINT = new PGPoint(NaN, NaN)
const INVALID_CIRCLE = new PGCircle(NaN, NaN, NaN)

/* ========================================================================== *
 * PARSERS                                                                    *
 * ========================================================================== */

/** Parse a PostgreSQL `point` */
export const parsePoint: PGParser<PGPoint> = (value: string): PGPoint => {
  if (value[0] !== '(') return INVALID_POINT

  const values = value.substring(1, value.length - 1).split(',')

  return new PGPoint(parseFloat(values[0]!), parseFloat(values[1]!))
}

/** Parse a PostgreSQL `circle` */
export const parseCircle: PGParser<PGCircle> = (value: string): PGCircle => {
  if (value[0] !== '<' && value[1] !== '(') return INVALID_CIRCLE

  let point = '('
  let radius = ''
  let pointParsed = false
  for (let i = 2; i < value.length - 1; i++) {
    if (!pointParsed) {
      point += value[i]
    }

    if (value[i] === ')') {
      pointParsed = true
      continue
    } else if (!pointParsed) {
      continue
    }

    if (value[i] === ',') {
      continue
    }

    radius += value[i]
  }

  const { x, y } = parsePoint(point)
  return new PGCircle(x, y, parseFloat(radius))
}
