# PostgreSQL Proxy Client (Persister Interface)

The persister interface for PostgreSQL Proxy is a higher-level interface
offering (on top of the usual connection and query interface) a CRUD
abstraction over database tables and few utility methods.

* [Connecting](#connecting)
* [Schema Definition](#schema-defintion)
* [Model Views](#model-views)
  * [Create](#create)
  * [Upsert](#upsert)
  * [Read](#read)
  * [Find](#find)
  * [Update](#update)
  * [Delete](#delete)
* [Pinging the database](#pinging-the-database)
* [PGProxy](https://github.com/juitnow/juit-pgproxy/blob/main/README.md)
* [Copyright Notice](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)
* [License](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)



### Connecting

In the code, you can simply depend on the `Persister` class:

```ts
import { Persister } from '@juit/pgproxy-persister'

const client = new Persister()
```

As with the standard client (`PGClient`) persisters can be constructed with a
`url` as a parameter, indicating the endpoint of the connection _and_
the specific client to be used.



### Schema Definition

The `Persister` interface (and the `Model`s bound to it) is a _generic_
interface. The `Schema` type parameter can be used to provide a fully typed
view over the columns (and related `Model`s) it manages.

Formally, the `Schema` is a type mapping table and column names to column
definitions. Each column definition is a type containing the following
properties:

* `type`: the _type_ of the column
* `isNullable` _(optional)_: if `true` the column is _nullable_ and henceforth
  the `null` value can be used in lieu of the `type` above.
* `hasDefault` _(optional)_: if `true` the column _specifies a default value_
  and therefore can be omitted in create operations.

An example of a `Schema` is as follows:

```ts
/** Definition for all modelable columns */
export interface MySchema {
  /** Columns for the `users` table */
  users: {
    /** Definition for the `id` column in `users` */
    id: { type: number, hasDefault: true } // not nullable, but has default
    /** Definition for the `email` column in `users` */
    email: { type: string } // not nullable, no default, required creating
    /** Definition for the `age` column in `users` */
    age: { type: number, isNullable: true, hasDefault: false }

    // ... all other columns
  },

  // ... all other tables
}
```

The `@juit/pgproxy-utils` comes with a useful schema generator, querying a
database for all of its tables and generating a proper TypeScript interface.



### Model views

Model views offer a very basic interface to **C**reate, **R**ead, **U**pdate
and **D**elete data from a table.

A _CRUD_ model can be obtained by calling the `in(tableName)` on a `Persister`
or `connection` object, for example:

```ts
const model = persister.in('myTable')
model.create({ ... })
model.delete({ ... })

persister.connect(async (connection) => {
  const model = connection.in('myTable')
  await model.create({ ... })
  await model.delete({ ... })
})
```

#### Create

The model's `create(object)` function will create `INSERT INTO ... RETURNING *`
statements based on the specified object.

Each key in the object will represent a _column name_ and its associated value
will be inserted in place.

This function will return (obviously) the values inserted, including any default
value calculated by the database.

```typescript
persisterOrConnection.in('myTable').create({ myString: 'foo', myNumber: 123 })
// INSERT INTO "myTable" ("myString", "myNumber") VALUES ('foo', 123) RETURNING *

persisterOrConnection.in('myTable').create({})
// INSERT INTO "myTable" DEFAULT VALUES RETURNING *
```

#### Upsert

The model's `upsert(keys, data)` function will create upsert statements like
`INSERT INTO ... ON CONFLICT (...) DO UPDATE ... RETURNING *`.

The `keys` object passed as a first argument indicates the columns (and values
to set) for which conflicts are to be detected, while `data` is an object
containing other columns to update.

This function will return the values inserted and/or updated.

```typescript
persisterOrConnection.in('myTable').upsert({
  myKey: 'myValue', anotherKey: 'anotherValue'
}, {
  myString: 'foo', myNumber: 123
})
// INSERT INTO "myTable" ("myKey",   "anotherKey",   "myString", "myNumber")
//      VALUES           ('myValue', 'anotherValue', 'foo',      123)
// ON CONFLICT ("myKey", "anotherKey") DO UPDATE
//         SET "myString"='foo',
//             "myNumber"=123
//   RETURNING *
```

#### Read

The model's `read(query, sort)` function will create `SELECT * FROM ...`
statements based on the specified query and sort parameters.

Each key/value mapping in the query object will be mapped to a `WHERE key=value`
statement part.

The sort parameter must be an `Array` of `string`(s) containing the column name
and (optionally) the keywords `ASC` or `DESC`:

```ts
persisterOrConnection.in('myTable').read({ myString: 'foo', myNumber: 123 }, [
  'mySortColumn',
  'anotherSortColumn ASC',
  'yetAnotherSortColumn DESC',
])
// SELECT * FROM "myTable" WHERE "myString"='foo' AND "myNumber"=123
// ORDER BY "mySortColumn", "anotherSortColumn" ASC, "yetAnotherSortColumn" DESC
```

#### Find

Similar to `read(...)` this method will return the _first_ result of the
generated `SELECT` query, or _undefined_ in case of no results:

```ts
persisterOrConnection.in('myTable').find({ myString: 'foo', myNumber: 123 }, [
  'mySortColumn',
  'anotherSortColumn ASC',
  'yetAnotherSortColumn DESC',
])
// SELECT * FROM "myTable" WHERE "myString"='foo' AND "myNumber"=123
// ORDER BY "mySortColumn", "anotherSortColumn" ASC, "yetAnotherSortColumn" DESC
// LIMIT 1
```

#### Update

The model's `update(query, patch)` function will create
`UPDATE ... WHERE ... SET ...  RETURNING *` statements.

* the `query` parameter will work as in [read](#read), generating `WHERE ...`
  statement parts.
* the `patch` parameter will work similarly to [create](#create), generating
  `SET ...=...` statement parts.

This function will _cowardly_ fail when the `query` parameter is an empty object
(by design, we don't allow modification of _all_ rows in a database).

This function will return an `Array` of all rows modified by this call.

```javascript
persisterOrConnection.in('myTable').update({ myString: 'foo'}, { myNumber: 123 })
// UPDATE "myTable" SET "myNumber=123 WHERE "myString"='foo' RETURNING *
```

#### Delete

The model's `delete(query)` function will create
`DELETE FROM ... WHERE ... RETURNING *` statements.

* the `query` parameter will work as in [read](#read), generating `WHERE ...`
  statement parts.
* the `patch` parameter will work similarly to [create](#create), generating
  `SET ...=...` statement parts.

This function will _cowardly_ fail when the `query` parameter is an empty object
(by design, we don't allow deletion of _all_ rows in a database).

This function will return the _number of rows_ deleted by the query.

```javascript
persisterOrConnection.in('myTable').delete({ myString: 'foo'})
// DELETE FROM "myTable" WHERE "myString"='foo' RETURNING *
```



### Pinging the database

The `ping()` method on `Persister` is a simple shortcut to
`void query('SELECT now()')` and can be used to ping the database (for health
checks, connectivity checks, keepalives, ...).
