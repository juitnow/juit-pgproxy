import { EventEmitter } from 'node:events'

import type { Logger } from './index'

interface Events {
  error: (error: Error) => unknown
}

type EventParams<E, K extends keyof E> =
  E[K] extends ((...args: any[]) => unknown) ? Parameters<E[K]> : never

type EventCallback<E, K extends keyof E> =
  E[K] extends ((...args: any[]) => unknown) ? E[K] : never

export class Emitter<E = Events> {
  private _emitter = new EventEmitter()

  constructor(protected _logger: Logger) {}

  protected _emit<K extends keyof E>(event: K & string, ...args: EventParams<E, K>): void {
    try {
      this._emitter.emit(event, ...args)
    } catch (error) {
      this._logger.error(`Error in "${event}" handler`, error)
    }
  }

  setMaxListeners(n: number): this {
    this._emitter.setMaxListeners(n)
    return this
  }

  on<K extends keyof E>(event: K & string, callback: EventCallback<E, K>): this {
    this._emitter.on(event, callback)
    return this
  }

  once<K extends keyof E>(event: K & string, callback: EventCallback<E, K>): this {
    this._emitter.once(event, callback)
    return this
  }

  off<K extends keyof E>(event: K & string, callback: EventCallback<E, K>): this {
    this._emitter.off(event, callback)
    return this
  }
}
