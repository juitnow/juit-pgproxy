import { Queue } from '../src/queue'

describe('Queue', () => {
  it('should queue few successful tasks', async () => {
    const queue = new Queue()
    const calls: string[] = []

    const p1 = queue.enqueue((): Promise<number> => {
      calls.push('before 1')
      return new Promise((resolve) => setTimeout(() => {
        calls.push('after 1')
        resolve(1)
      }, 10))
    })

    const p2 = queue.enqueue((): number => {
      calls.push('call 2')
      return 2
    })

    expect(calls).toEqual([])
    const r1 = await p1
    expect(r1).toStrictlyEqual(1)

    expect(calls).toEqual([ 'before 1', 'after 1' ])
    const r2 = await p2
    expect(r2).toStrictlyEqual(2)

    expect(calls).toEqual([ 'before 1', 'after 1', 'call 2' ])
  })

  it('should queue few failing tasks', async () => {
    const queue = new Queue()
    const calls: string[] = []

    const p1 = queue.enqueue((): Promise<number> => {
      calls.push('before 1')
      return new Promise((_, reject) => setTimeout(() => {
        calls.push('after 1')
        reject(new Error('First'))
      }, 10))
    })

    const p2 = queue.enqueue((): number => {
      calls.push('call 2')
      return 2
    })

    expect(calls).toEqual([])

    await expect(p1).toBeRejectedWithError('First')

    const r2 = await p2
    expect(r2).toStrictlyEqual(2)

    expect(calls).toEqual([ 'before 1', 'after 1', 'call 2' ])
  })

  it('should handle exceptions', async () => {
    const queue = new Queue()
    const calls: string[] = []

    const p1 = queue.enqueue((): Promise<number> => {
      calls.push('before 1')
      return new Promise((_, reject) => setTimeout(() => {
        calls.push('after 1')
        reject(new Error('First'))
      }, 10))
    })

    const p2 = queue.enqueue((): number => {
      calls.push('call 2')
      throw new Error('Second')
    })

    expect(calls).toEqual([])

    await expect(p1).toBeRejectedWithError('First')
    await expect(p2).toBeRejectedWithError('Second')

    expect(calls).toEqual([ 'before 1', 'after 1', 'call 2' ])
  })
})
