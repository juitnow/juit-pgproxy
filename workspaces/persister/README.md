# PostgreSQL Proxy Client (Persister Interface)

The persister interface for PostgreSQL Proxy is a high-level interface to
operate on databases, offering (on top of the usual connection and query
interface) a CRUD abstraction of tables and few

* [Connecting](#connecting)
* [Schema Definition](#schema-defintion)
* [Persister Factories](#persister-factories)
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

The second parameter to the constructor is a _pseudo-schema-definition_ that
can be used in conjunction with our `Model` interface to _infer_ the types
of the various columns in a table.

### Schema Defintion

The schema definition is a trivial object mapping tables and columns to an
object defining the type (OID), the nullability of the column, and whether the
column has a _default_ value associated with it:

```ts
export const schema = {
  'myTable': {
    'myColumn': { oid: 1234, isNullable: true, hasDefault: false }
    // ...
  }
}
```

The `@juit/pgproxy-persister/schema` sub-module exports two functions to help
generating schema definitions from a database:

* `generateSchema(...)`: connects to the URL specified, and extracts the schema
  definitions for the schema names specified (defaulting to `['public']`).
* `serializeSchema(...)`: serializes a schema as a TypeScript source file.

### Persister Factories

It might be useful to share a _constructor_ for a Persister associated with
a schema. The static `with` method on `Persister` allows us to do so:

```ts
const mySchema = { /* the schema definition */ }
export const MySchemaPersister = Persister.with(mySchema)
// ...
const persister = new MySchemaPersister('... my url ...')
```

The `serializeSchema(...)` outlined above automatically generates such a
`Persister` constructor for each schema it generates.

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
