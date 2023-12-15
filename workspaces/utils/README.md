# PostgreSQL Proxy Utilities

This package provides a number of different utilities for developing and testing
with `PGProxy`.

* [Test Databases](#test-databases)
* [Database Migrations](#database-migrations)
* [Persister Schema Generation](#persister-schema-generation)
* [PGProxy](https://github.com/juitnow/juit-pgproxy/blob/main/README.md)
* [Copyright Notice](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)
* [License](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)

### Test Databases

Few helpers are available to create and drop test databases while developing:

* `testdb(...)`: return a test database _name_. An optional parameter can be
  used to specify the database name _prefix_ (defaults to `test`).
* `createdb(name, url)`: actually _create_ a new database, and return its name.
  * `name`: the name of the database to create, defaults to the value returned
    by calling `testdb()`.
  * `url`: the URL to connect to for creating the database, defaults to
    `psql:///postgres` (the local PostgreSQL instance via `libpq`)
* `dropdb(name, url)`: drop the specified database.
  * `name`: the name of the database to drop, _required_.
  * `url`: the URL to connect to for dropping the database, defaults to
    `psql:///postgres` (the local PostgreSQL instance via `libpq`)

Normally, those methods are used when running tests, in a pattern similar to
the following:

```ts
let databaseName: string

beforeAll(async () => {
  databaseName = await createdb()
})

afterAll(async () => {
  await dropdb(databasename)
})

it('should run a test', async () => {
  const client = new PGClient(databaseName)
  /// ... use the client to test
})
```


### Database Migrations

The `migrate(...)` function provides an extremely simplistic way to migrate
databases.

Migration files should have names like `001-initial.sql`, `002-second.sql`,
basically stating the migration _order_ followed by a simple name describing it.

All migrations will be recorded in the database using the `$migrations` table.

The `migrate(...)` function requires two arguments:

* `url`: the URL of the database to migrate, _required_.
* `options`: an optional set of options including:
  * `migrations`: the _directory_ where migration files reside, relative to the
    current working directory, defaults to `./sql`.
  * `additional`: an additional set of migrations to be run (for example)
    migrations required to run unit tests, defaults to _undefined_.
  * `group`: a logical name grouping migrations together, when multiple sources
    of database migrations exist in the same database, defaults to `default`.

In unit tests, for example, migrations can be applied in the following way:

```ts
let databaseName: string

beforeAll(async () => {
  databaseName = await createdb()
  await migrate(databaseName, {
    migrations: './migrations',
    additional: './test/migrations',
  })
})

// run your tests, all migrations will be applied beforehand
```


### Persister Schema Genration

Schema definitions for our `Persister` models (see `@juit/pgproxy-persister`)
can be generated using a couple of functions:

* `extractSchema(...)`: extract the `Schema` definition from a database.
* `serializeSchema(...)`: serialize the extracted `Schema` as a Typescript DTS.

The `extractSchema(...)` function takes a couple of arguments:

* `url`: the URL of the database whose schemas are to be extracted, _required_.
* `schemas`: an array of _database schema names_ to extract, defaulting to the
  single `['public']` schema.

The `serializeSchema(...)` takes the following arguments:

* `schema`: the `Schema` for which the DTS should be generated, _required_.
* `id`: the exported identifier of the schema, optional, defaults to `Schema`.
* `overrides`: A `Record` mapping OID numbers to TypeScript types, in case
  the registry used by the client is capable of handling them. All known OIDs
  from the `@juit/pgproxy-types` library are already covered.

An extra couple of utilities are available for the schema extractor:

* `types`: a collection of TypeScript types representing the common, well known
  types converted by `PGProxy` (e.g. _strings_, _numbers_, _arrays_, ...).
* `helpers`: helper functions to generate extra types for `serializeSchema`:
  * `makePostgresArrayType(...)`: given a type `T`, it'll return a type
    representing a postgres array, that is `(T | null)[]`.
  * `makeImportType(module, name, args)`: generate a type imported from the
    specified module, using the specified type arguments, for example:
    `import('myModule').MyType<MyArg1, MyArg2>`
