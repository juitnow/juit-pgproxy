import { expectType, printType } from 'tsd'

import type { SearchOptions, SearchResult } from '../workspaces/model/src/index'

printType('__file_marker__')

interface TestSchema {
  'joined': {
    'uuid': {
      type: string
      hasDefault: true
    }
    'key': {
      type: string
    }
    'date': {
      type: Date
      isNullable: true
    }
    'json': {
      type: any
      isNullable: true
    }
  }
  'main': {
    'uuid': {
      type: string
      hasDefault: true
    }
    'ref': {
      type: string
      isNullable: true
    }
    'key': {
      type: string
    }
    'date': {
      type: Date
    }
    'number': {
      type: number
      isNullable: true
    }
    'json': {
      type: any
      isNullable: true
    }
  }
}

type TestJoins = {
  referenced: { column: 'ref', refTable: 'joined', refColumn: 'uuid', sortColumn: 'key' },
}

type TestJoins2 = {
  referenced: { column: 'key', refTable: 'joined', refColumn: 'key' },
}

/* ===== SEARCH OPTIONS ===================================================== */

// With joins
expectType<{
  limit?: number | undefined,
  offset?: number | undefined,
  sort?: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json' // from the main table
       | 'referenced' // joined table sort column
       | undefined,
  order?: 'asc' | 'desc' | undefined,
  q?: string | undefined,
  filters?: ({
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: string | undefined,
    op?: '=' | '!=' | '>' | '>=' | '<' | '<=' | '~' | 'like' | 'ilike'
    value: string | number | Date | boolean | null
  } | {
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: string | undefined,
    op: 'in' | 'not in',
    value: (string | number | Date | boolean | null)[]
  } | {
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: never,
    op: '@>' | '<@',
    value: any
  })[] | undefined
}>(null as any as SearchOptions<TestSchema, 'main', TestJoins, true>)

// With non-sortable joins
expectType<{
  limit?: number | undefined,
  offset?: number | undefined,
  sort?: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json' // from the main table
       | undefined, // no 'referenced' here... it's not sortable!
  order?: 'asc' | 'desc' | undefined,
  q?: string | undefined,
  filters?: ({
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: string | undefined,
    op?: '=' | '!=' | '>' | '>=' | '<' | '<=' | '~' | 'like' | 'ilike'
    value: string | number | Date | boolean | null
  } | {
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: string | undefined,
    op: 'in' | 'not in',
    value: (string | number | Date | boolean | null)[]
  } | {
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: never,
    op: '@>' | '<@',
    value: any
  })[] | undefined
}>(null as any as SearchOptions<TestSchema, 'main', TestJoins2, true>)

// Without joins
expectType<{
  limit?: number | undefined,
  offset?: number | undefined,
  sort?: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json' | undefined,
  order?: 'asc' | 'desc' | undefined,
  q?: string | undefined,
  filters?: ({
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: string | undefined,
    op?: '=' | '!=' | '>' | '>=' | '<' | '<=' | '~' | 'like' | 'ilike'
    value: string | number | Date | boolean | null
  } | {
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: string | undefined,
    op: 'in' | 'not in',
    value: (string | number | Date | boolean | null)[]
  } | {
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: never,
    op: '@>' | '<@',
    value: any
  })[] | undefined
}>(null as any as SearchOptions<TestSchema, 'main', {}, true>)

// Without joins, without full text search
expectType<{
  limit?: number | undefined,
  offset?: number | undefined,
  sort?: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json' | undefined,
  order?: 'asc' | 'desc' | undefined,
  q?: never | undefined,
  filters?: ({
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: string | undefined,
    op?: '=' | '!=' | '>' | '>=' | '<' | '<=' | '~' | 'like' | 'ilike'
    value: string | number | Date | boolean | null
  } | {
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: string | undefined,
    op: 'in' | 'not in',
    value: (string | number | Date | boolean | null)[]
  } | {
    name: 'uuid' | 'ref' | 'key' | 'date' | 'number' | 'json',
    field?: never,
    op: '@>' | '<@',
    value: any
  })[] | undefined
}>(null as any as SearchOptions<TestSchema, 'main', {}, false>)

/* ===== SEARCH RESULTS ===================================================== */

// With nullable joins
expectType<{
  uuid: string;
  ref: string | null;
  key: string;
  date: Date;
  number: number | null;
  json: any | null;
  referenced: null | {
    uuid: string;
    key: string;
    date: Date | null;
    json: any | null;
  }
}>(null as any as SearchResult<TestSchema, 'main', TestJoins>)

// With non-nullable joins
expectType<{
  uuid: string;
  ref: string | null;
  key: string;
  date: Date;
  number: number | null;
  json: any | null;
  referenced: {
    uuid: string;
    key: string;
    date: Date | null;
    json: any | null;
  }
}>(null as any as SearchResult<TestSchema, 'main', TestJoins2>)
