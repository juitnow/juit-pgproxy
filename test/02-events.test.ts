import { Emitter } from '../src/events'
import { TestLogger } from './utils'

describe('Events', () => {
  class TestEmitter extends Emitter {
    constructor() {
      super(new TestLogger())
    }
    emit(error: Error): void {
      this._emit('error', error)
    }
  }

  it('should register an "on" handler', () => {
    const emitter = new TestEmitter()

    let actual1: Error | undefined = undefined
    let actual2: Error | undefined = undefined
    emitter.on('error', (e) => actual1 = e)
    emitter.on('error', (e) => actual2 = e)

    const expected = new Error('This is intended')

    emitter.emit(expected)

    expect(actual1).toStrictlyEqual(expected)
    expect(actual2).toStrictlyEqual(expected)
  })

  it('should register an "once" handler', () => {
    const emitter = new TestEmitter()

    let actual: Error | undefined = undefined
    emitter.once('error', (e) => actual = e)

    const expected = new Error('This is intended')

    emitter.emit(expected)
    emitter.emit(new Error('This is wrong'))

    expect(actual).toStrictlyEqual(expected)
  })

  it('should de-register with "off"', () => {
    const emitter = new TestEmitter()

    let actual1: Error | undefined = undefined
    let actual2: Error | undefined = undefined
    const handler = (e: Error): Error => actual1 = e
    emitter.on('error', handler)
    emitter.on('error', (e) => actual2 = e)

    const expected1 = new Error('This is intended')
    const expected2 = new Error('This is wrong')
    emitter.emit(expected1)

    emitter.off('error', handler)
    emitter.emit(expected2)

    expect(actual1).toStrictlyEqual(expected1)
    expect(actual2).toStrictlyEqual(expected2)
  })

  it('should never fail when handlers fail', () => {
    const emitter = new TestEmitter()

    let actual: Error | undefined = undefined
    emitter.on('error', (error) => {
      actual = error
      throw new Error('This is wrong')
    })

    const expected = new Error('This is intended')
    emitter.emit(expected)

    expect(actual).toStrictlyEqual(expected)
  })
})
