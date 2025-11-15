import { Search } from '../src'

import type { SearchJoins } from '../src'
import type { Persister } from '../src/persister'

interface Schema {
  main: {
    id: {
      type: number,
    },
    main_column: {
      type: string,
    },
    json_column: {
      type: 'jsonb',
    },
    sortable_id: {
      type: number,
    },
    sortable_id_2: {
      type: number,
    },
    unsortable_id: {
      type: number,
    },
  },

  sortables: {
    id: {
      type: number,
    }
    sortable_column: {
      type: string,
    },
  },

  unsortables: {
    id: {
      type: number,
    },
    unsortable_column: {
      type: string,
    }
  }
}

describe('Search (Query Preparation)', () => {
  const persister: Persister<Schema> = null as any
  const joins = {
    sortable: { table: 'sortables', column: 'sortable_id', refColumn: 'id', sortColumn: 'sortable_column' },
    unsortable: { table: 'unsortables', column: 'unsortable_id', refColumn: 'id' },
  } as const satisfies SearchJoins<Schema>
  const search = new Search(persister, 'main', joins, 'search_column')

  function check(result: [ sql: string, params: any[] ], expectedSql: string, expectedParams: any[]): void {
    expect(result[0].replace(/\s+/g, ' ').trim()).toEqual(expectedSql.replace(/\s+/g, ' ').trim())
    expect(result[1]).toEqual(expectedParams)
  }

  it('should prepare a query', () => {
    check(search.query({}),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" =   "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
          LIMIT $4`, [ 'search_column', 'sortable', 'unsortable', 20 ])
  })

  it('should prepare a query sorting on a column', () => {
    check(search.query({ sort: 'main_column' }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
       ORDER BY "main"."main_column"
          LIMIT $4`, [ 'search_column', 'sortable', 'unsortable', 20 ])

    check(search.query({ sort: 'main_column', order: 'desc' }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
       ORDER BY "main"."main_column" DESC
          LIMIT $4`, [ 'search_column', 'sortable', 'unsortable', 20 ])
  })

  it('should prepare a query sorting on a joined field', () => {
    check(search.query({ sort: 'sortable' }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
       ORDER BY "__$2$__"."sortable_column" NULLS LAST
          LIMIT $4`, [ 'search_column', 'sortable', 'unsortable', 20 ])

    check(search.query({ sort: 'sortable', order: 'desc' }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
       ORDER BY "__$2$__"."sortable_column" DESC NULLS LAST
          LIMIT $4`, [ 'search_column', 'sortable', 'unsortable', 20 ])
  })

  it('should use the correct alias when there are multiple joins to the same table', () => {
    const search = new Search(persister, 'main', {
      sortable1: { table: 'sortables', column: 'sortable_id_1', refColumn: 'id', sortColumn: 'sortable_column' },
      sortable2: { table: 'sortables', column: 'sortable_id_2', refColumn: 'id', sortColumn: 'sortable_column' },
    } as const)

    check(search.query({ sort: 'sortable1' }),
        `SELECT (TO_JSONB("main".*)
             || JSONB_BUILD_OBJECT($1::TEXT, "__$1$__".*)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$1$__"
             ON "main"."sortable_id_1" = "__$1$__"."id"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id_2" = "__$2$__"."id"
       ORDER BY "__$1$__"."sortable_column" NULLS LAST
          LIMIT $3`, [ 'sortable1', 'sortable2', 20 ])

    check(search.query({ sort: 'sortable2' }),
        `SELECT (TO_JSONB("main".*)
             || JSONB_BUILD_OBJECT($1::TEXT, "__$1$__".*)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$1$__"
             ON "main"."sortable_id_1" = "__$1$__"."id"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id_2" = "__$2$__"."id"
       ORDER BY "__$2$__"."sortable_column" NULLS LAST
          LIMIT $3`, [ 'sortable1', 'sortable2', 20 ])
  })

  it('should throw when a joined field can not be sorted upon', () => {
    expect(() => search.query({ sort: 'unsortable' }))
        .toThrowError('Sort column for joined field "unsortable" not defined')
  })

  it('should prepare a query with full text search (prefix match)', () => {
    check(search.query({ q: 'foobar' }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id",
                CAST(LOWER($4) AS tsquery) AS "__query"
          WHERE "__query" @@ "main"."search_column"
       ORDER BY ts_rank("main"."search_column", "__query") DESC
          LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', 'foobar:*', 20 ])
  })

  it('should prepare a query with full text search (web search)', () => {
    check(search.query({ q: 'foo and bar' }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id",
                websearch_to_tsquery($4) AS "__query"
          WHERE "__query" @@ "main"."search_column"
       ORDER BY ts_rank("main"."search_column", "__query") DESC
          LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', 'foo and bar', 20 ])
  })

  it('should prepare a query with full text search and overridden sort', () => {
    check(search.query({ q: 'foobar', sort: 'main_column' }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id",
                CAST(LOWER($4) AS tsquery) AS "__query"
          WHERE "__query" @@ "main"."search_column"
       ORDER BY "main"."main_column",
                ts_rank("main"."search_column", "__query") DESC
          LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', 'foobar:*', 20 ])
  })

  it('should throw when performing a full text search without a search column', () => {
    const search = new Search(persister, 'main')

    expect(() => search.query({ q: 'foobar' }))
        .toThrowError('Full-text search column not defined')
  })

  for (const [ op, sqlOp ] of [
    [ '>', '>' ],
    [ '>=', '>=' ],
    [ '<', '<' ],
    [ '<=', '<=' ],
    [ 'like', 'LIKE' ],
    [ 'ilike', 'ILIKE' ],
    [ '~', 'ILIKE' ],
    [ '!=', 'IS DISTINCT FROM' ],
    [ '=', 'IS NOT DISTINCT FROM' ],
  ] as const) {
    it(`should prepare a query with using the "${op}" operator`, () => {
      check(search.query({ filters: [ { name: 'id', op, value: 'foobar' } ] }),
          `SELECT ((TO_JSONB("main".*) - $1)
               || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
               || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
               AS "result"
             FROM "main"
        LEFT JOIN "sortables" "__$2$__"
               ON "main"."sortable_id" = "__$2$__"."id"
        LEFT JOIN "unsortables" "__$3$__"
               ON "main"."unsortable_id" = "__$3$__"."id"
            WHERE "main"."id" ${sqlOp} $4
            LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', 'foobar', 20 ])

      // bigint value
      check(search.query({ filters: [ { name: 'id', op, value: 12345678901234567890n } ] }),
          `SELECT ((TO_JSONB("main".*) - $1)
               || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
               || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
               AS "result"
             FROM "main"
        LEFT JOIN "sortables" "__$2$__"
               ON "main"."sortable_id" = "__$2$__"."id"
        LEFT JOIN "unsortables" "__$3$__"
               ON "main"."unsortable_id" = "__$3$__"."id"
            WHERE "main"."id" ${sqlOp} $4
            LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', '12345678901234567890', 20 ])
    })
  }
  it('should prepare a query with using the "in" operator', () => {
    check(search.query({ filters: [ { name: 'id', op: 'in', value: [ 'foo', 'bar', 'baz' ] } ] }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
          WHERE "main"."id" = ANY($4)
          LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', [ 'foo', 'bar', 'baz' ], 20 ])
  })


  it('should prepare a query with using the "not in" operator', () => {
    check(search.query({ filters: [ { name: 'id', op: 'not in', value: [ 'foo', 'bar', 'baz' ] } ] }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
          WHERE "main"."id" != ALL($4)
          LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', [ 'foo', 'bar', 'baz' ], 20 ])
  })

  it('should prepare a query with using the "<@" operator', () => {
    check(search.query({ filters: [ { name: 'id', op: '<@', value: { hello: 'world' } } ] }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
          WHERE "main"."id" <@ ($4)::JSONB
          LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', '{"hello":"world"}', 20 ])
  })

  it('should prepare a query with using the "@>" operator', () => {
    check(search.query({ filters: [ { name: 'id', op: '@>', value: 'foobar' } ] }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
          WHERE "main"."id" @> ($4)::JSONB
          LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', '"foobar"', 20 ])
  })

  it('should prepare a query for json fields', () => {
    check(search.query({ filters: [ { name: 'json_column', field: 'hello', value: 'world' } ] }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
          WHERE "main"."json_column"->>$4 IS NOT DISTINCT FROM $5
          LIMIT $6`, [ 'search_column', 'sortable', 'unsortable', 'hello', 'world', 20 ])
  })

  it('should prepare a query with an extra "where" clause', () => {
    check(search.query({ filters: [ { name: 'id', value: 123 } ] }, {
      where: '"foo" = $1 AND "bar" = $2',
      params: [ 'FOO', 'BAR' ],
    }), `SELECT ((TO_JSONB("main".*) - $3)
             || JSONB_BUILD_OBJECT($4::TEXT, "__$4$__".*)
             || JSONB_BUILD_OBJECT($5::TEXT, "__$5$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$4$__"
             ON "main"."sortable_id" = "__$4$__"."id"
      LEFT JOIN "unsortables" "__$5$__"
             ON "main"."unsortable_id" = "__$5$__"."id"
          WHERE "foo" = $1
            AND "bar" = $2
            AND "main"."id" IS NOT DISTINCT FROM $6
          LIMIT $7`, [ 'FOO', 'BAR', 'search_column', 'sortable', 'unsortable', 123, 20 ])
  })

  it('should throw when finding an unexpected operator', () => {
    expect(() => search.query({ filters: [ { name: 'main_column', op: 'foo' as any, value: 'world' } ] }))
        .toThrowError('Unsupported operator "foo" for "main_column"')
  })

  it('should prepare a query with offset and query', () => {
    check(search.query({ offset: 10 }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
         OFFSET $4
          LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', 10, 20 ])

    check(search.query({ limit: 0 }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"`, [ 'search_column', 'sortable', 'unsortable' ])

    check(search.query({ offset: 10, limit: 30 }),
        `SELECT ((TO_JSONB("main".*) - $1)
             || JSONB_BUILD_OBJECT($2::TEXT, "__$2$__".*)
             || JSONB_BUILD_OBJECT($3::TEXT, "__$3$__".*))::TEXT
             AS "result"
           FROM "main"
      LEFT JOIN "sortables" "__$2$__"
             ON "main"."sortable_id" = "__$2$__"."id"
      LEFT JOIN "unsortables" "__$3$__"
             ON "main"."unsortable_id" = "__$3$__"."id"
         OFFSET $4
          LIMIT $5`, [ 'search_column', 'sortable', 'unsortable', 10, 30 ])
  })
})
