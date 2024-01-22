import { Persister } from '@juit/pgproxy-persister'
import { expectError, expectType, printType } from 'tsd'

import type { InferSelectType, InferSort, Model } from '@juit/pgproxy-persister'

printType('__file_marker__')

interface MySchema {
  myTable: {
    123: {
      type: boolean,
    },
    myColumn: {
      type: number,
    },
    myGeneratedColumn: {
      type: number,
      isGenerated: true,
    },
    myNullableColumn: {
      type: boolean,
      isNullable: true,
    },
    myDefaultColumn: {
      type: string,
      hasDefault: true,
    }
    myDefaultNullableColumn: {
      type: Date,
      hasDefault: true,
      isNullable: true,
    }
  },
  'anotherSchema.myTable2': {
    anotherColumn: {
      type: 'this' | 'that',
    },
  },
}

const persister = new Persister<MySchema>()

const model = persister.in('myTable')
expectType<Model<MySchema['myTable']>>(model)
const connectionModel = await persister.connect((connection) => connection.in('myTable'))
expectType<Model<MySchema['myTable']>>(connectionModel)

// @ts-ignore // a persister with the wrong table
expectType<never>(persister.in('wrongTable')) // should not return Model<never>
expectError(persister.in('wrongTable')) // should be an error

// ===== SINGLE TABLE SCHEMA ===================================================

interface MySingleTableSchema {
  myOnlyTable: {
    myOnlyColumn: {
      type: number,
    },
  },
}

const singleTablePersister = new Persister<MySingleTableSchema>()
const singleTableModel = singleTablePersister.in('myOnlyTable')
expectType<Model<MySingleTableSchema['myOnlyTable']>>(singleTableModel)

const singleTableConnectionModel = await singleTablePersister.connect((connection) => connection.in('myOnlyTable'))
expectType<Model<MySingleTableSchema['myOnlyTable']>>(singleTableConnectionModel)

// @ts-ignore // a persister with the wrong table
expectType<never>(singleTablePersister.in('wrongTable')) // should not return Model<never>
expectError(singleTablePersister.in('wrongTable')) // should be an error

// ===== TABLE TYPE ============================================================

/* This is the _concrete_ table type, as in SELECT * FROM "myTable" */
type MyTableType = {
  myColumn: number;
  myGeneratedColumn: number,
  myNullableColumn: boolean | null;
  myDefaultColumn: string;
  myDefaultNullableColumn: Date | null;
}

expectType<MyTableType>(null as any as InferSelectType<MySchema['myTable']>)

// ===== SORT TYPE =============================================================

type MyTableSort =
  | 'myColumn'
  | 'myColumn asc'
  | 'myColumn ASC'
  | 'myColumn desc'
  | 'myColumn DESC'
  | 'myGeneratedColumn'
  | 'myGeneratedColumn asc'
  | 'myGeneratedColumn ASC'
  | 'myGeneratedColumn desc'
  | 'myGeneratedColumn DESC'
  | 'myNullableColumn'
  | 'myNullableColumn asc'
  | 'myNullableColumn ASC'
  | 'myNullableColumn desc'
  | 'myNullableColumn DESC'
  | 'myDefaultColumn'
  | 'myDefaultColumn asc'
  | 'myDefaultColumn ASC'
  | 'myDefaultColumn desc'
  | 'myDefaultColumn DESC'
  | 'myDefaultNullableColumn'
  | 'myDefaultNullableColumn asc'
  | 'myDefaultNullableColumn ASC'
  | 'myDefaultNullableColumn desc'
  | 'myDefaultNullableColumn DESC'

expectType<MyTableSort>(null as any as InferSort<MySchema['myTable']>)

// ===== CREATE ================================================================

expectType<(
data: {
  myColumn: number;
  myNullableColumn?: boolean | null | undefined;
  myDefaultColumn?: string | undefined;
  myDefaultNullableColumn?: Date | null | undefined;
}) => Promise<MyTableType>>(model.create)

// ===== UPSERT ================================================================

/* with no keys */
expectType<(
keys: {},
data: {
  myColumn: number;
  myNullableColumn?: boolean | null | undefined;
  myDefaultColumn?: string | undefined;
  myDefaultNullableColumn?: Date | null | undefined;
}) => Promise<MyTableType>>(model.upsert<{}>)

expectType<MyTableType>(await model.upsert({}, { myColumn: 1234 }))
expectError(model.upsert({}, {}))

/* with a _required_ key */
expectType<(
keys: {
  myColumn: number;
},
data: {
  myNullableColumn?: boolean | null | undefined;
  myDefaultColumn?: string | undefined;
  myDefaultNullableColumn?: Date | null | undefined;
}) => Promise<MyTableType>>(model.upsert<{ myColumn: number }>)

expectType<MyTableType>(await model.upsert({ myColumn: 1234 }, {}))
expectError(await model.upsert({ myColumn: 1234 }, { myColumn: 4321 })) // column can not be repeated
expectError(await model.upsert({ myColumn: 1234 }, { wrongColumn: 4321 })) // invalid column name

/* with an _optional_ key */
expectType<(
keys: {
  myNullableColumn?: boolean | null | undefined;
  myDefaultColumn?: string | undefined;
},
data: {
  myColumn: number;
  // myNullableColumn?: boolean | null | undefined;
  // myDefaultColumn?: string | undefined;
  myDefaultNullableColumn?: Date | null | undefined;
}) => Promise<MyTableType>>(model.upsert<{
  myNullableColumn?: boolean | null | undefined;
  myDefaultColumn?: string | undefined;
}>)

expectType<MyTableType>(await model.upsert({ myNullableColumn: false }, { myColumn: 1234 }))
expectError(await model.upsert({ myNullableColumn: false }, {})) // missing required column
expectError(await model.upsert({ myNullableColumn: false }, { myColumn: 4321, myNullableColumn: true })) // column can not be repeated
expectError(await model.upsert({ myNullableColumn: false }, { myColumn: 4321, wrongColumn: 4321 })) // invalid column name

// ===== READ ==================================================================

expectType<(
query?: {
  myColumn?: number | undefined;
  myGeneratedColumn?: number | undefined;
  myNullableColumn?: boolean | null | undefined;
  myDefaultColumn?: string | undefined;
  myDefaultNullableColumn?: Date | null | undefined;
},
sort?: MyTableSort | MyTableSort[],
offset?: number,
limit?: number,
) => Promise<MyTableType[]>>(model.read)

// ===== FIND ==================================================================

expectType<(
query?: {
  myColumn?: number | undefined;
  myGeneratedColumn?: number | undefined;
  myNullableColumn?: boolean | null | undefined;
  myDefaultColumn?: string | undefined;
  myDefaultNullableColumn?: Date | null | undefined;
},
sort?: MyTableSort | MyTableSort[],
) => Promise<MyTableType | undefined>>(model.find)

// ===== UPDATE ================================================================

expectType<(
query: {
  myColumn?: number | undefined;
  myGeneratedColumn?: number | undefined;
  myNullableColumn?: boolean | null | undefined;
  myDefaultColumn?: string | undefined;
  myDefaultNullableColumn?: Date | null | undefined;
},
patch: {
  myColumn?: number | undefined;
  myNullableColumn?: boolean | null | undefined;
  myDefaultColumn?: string | undefined;
  myDefaultNullableColumn?: Date | null | undefined;
},
) => Promise<MyTableType[]>>(model.update)

// ===== DELETE ================================================================

expectType<(
query: {
  myColumn?: number | undefined;
  myGeneratedColumn?: number | undefined;
  myNullableColumn?: boolean | null | undefined;
  myDefaultColumn?: string | undefined;
  myDefaultNullableColumn?: Date | null | undefined;
},
) => Promise<number>>(model.delete)
