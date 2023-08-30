import { AsyncResource } from 'node:async_hooks'

export type Task<T> = () => T | PromiseLike<T>

class Executor<T> extends AsyncResource {
  constructor(
      private _task: Task<T>,
      private _resolve: (result: T) => void,
      private _reject: (error: any) => void,
  ) {
    super('QueueExecutor')
  }

  execute(): Promise<void> {
    return this.runInAsyncScope(async () => {
      try {
        const result = await this._task()
        this._resolve(result)
      } catch (error) {
        this._reject(error)
      }
    })
  }
}

export class Queue {
  private _queue: Executor<any>[] = []
  private _running: boolean = false

  private _run(): void {
    if (this._running) return

    const next = this._queue.splice(0, 1)[0]
    if (! next) return

    this._running = true

    void next.execute().finally(() => {
      this._running = false
      this._run()
    })
  }

  enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const executor = new Executor(task, resolve, reject)
      this._queue.push(executor)
      process.nextTick(() => this._run())
    })
  }
}
