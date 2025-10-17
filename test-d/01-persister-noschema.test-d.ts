import { Persister } from '@juit/pgproxy-persister'
import { expectType, printType } from 'tsd'

import type { ColumnDefinition, Model } from '@juit/pgproxy-persister'

printType('__file_marker__')

const persister = new Persister()
const model = persister.in('myTable')
expectType<Model<Record<string, ColumnDefinition>>>(model)
const connectionModel = await persister.connect((connection) => connection.in('myTable'))
expectType<Model<Record<string, ColumnDefinition>>>(connectionModel)

// ===== CREATE ================================================================

expectType<{
  (data: Record<string, any>, unique?: false): Promise<Record<string, any>>
  (data: Record<string, any>, unique: true): Promise<Record<string, any> | undefined>
}>(model.create)

// ===== UPSERT ================================================================

/* with no keys */
expectType<(
  keys: {},
  data: Omit<Record<string, any>, never>,
) => Promise<Record<string, any>>>(model.upsert<{}>)

expectType<Record<string, any>>(await model.upsert({}, {}))
expectType<Record<string, any>>(await model.upsert({}, { myColumn: 1234 }))

/* with a key */
expectType<(
  keys: { myColumn: number },
  data: Omit<Record<string, any>, 'myColumn'>,
) => Promise<Record<string, any>>>(model.upsert<{ myColumn: number }>)

expectType<Record<string, any>>(await model.upsert({ myColumn: 1234 }, { anotherColumn: 'foo' }))
// can not figure out a way to remove a specific from a Record<string, any>...
expectType<Record<string, any>>(await model.upsert({ myColumn: 1234 }, { myColumn: 4321 }))

// ===== READ ==================================================================

expectType<(
  query?: Record<string, any>,
  sort?: string | string[],
  offset?: number,
  limit?: number,
) => Promise<Record<string, any>[]>>(model.read)

// ===== FIND ==================================================================

expectType<(
  query?: Record<string, any>,
  sort?: string | string[],
) => Promise<Record<string, any> | undefined>>(model.find)

// ===== UPDATE ================================================================

expectType<(
  query: Record<string, any>,
  patch: Record<string, any>,
) => Promise<Record<string, any>[]>>(model.update)

// ===== DELETE ================================================================

expectType<(
  query: Record<string, any>,
) => Promise<number>>(model.delete)
