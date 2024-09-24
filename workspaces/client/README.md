# PostgreSQL Proxy Client (Base Package)

This package provides the main entry point for clients to work with PGProxy
Servers. It acts both as an abstraction layer over the various client
implementations _and_ as a registry for them.

* [Connecting](#connecting)
* [Client](#client)
* [Result](#result)
* [Types](#types)
* [Template Literals](#template-literals)
* [PGProxy](https://github.com/juitnow/juit-pgproxy/blob/main/README.md)
* [Copyright Notice](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)
* [License](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)

### Connecting

In the code, you can simply depend on the `PGClient` class:

```ts
import { PGClient } from '@juit/pgproxy-client'

const client = new PGClient()
```

The client can be constructed with a `url` as a parameter, indicating the
endpoint of the connection _and_ the specific client to be used. If no such
parameter is specified, the value of the `PGURL` environment variable will be
used.

Additionally if the URL specified at construction (or in the `PGURL` environment
variable) does not provide ANY authentication information, the `PGUSER` and
`PGPASSWORD` environment variables will be used to fill in those details.

Specific implementations are registered by simply importing their library:

* `@juit/pgproxy-client-node`: The HTTP client for NodeJS \
  handles URLs like: `http(s)://secret@host:port/`
* `@juit/pgproxy-client-whatwg`: The HTTP client for WhatWG + WebCrypto \
  handles URLs like: `http(s)://secret@host:port/`
* `@juit/pgproxy-client-psql`: The direct LibPQ-based client \
  handles URLs like: `psql://usrname:password@host:port/database`

The ability to abstract client and connection details allows the code to be
as portable as possible. For example in an AWS Lambda Function:

```ts
// Entry point for AWS Lambda functions

// Import the _node_ client, the PGURL environment variable comes from the
// Lambda definitions and can be specified via the AWS console, it will have
// a format like: https://my-secret@my-ec2-instance:54321/
import '@pgproxy/client-node'

export const handler = async (event: LambdaEvent) => {
  // ... use code that connects to the database using `new PGClient()`
}
```

Similarly, when running a test requiring a connection to a _local_ database
(no need to spin up a whole PGProxy Server to test):

```ts
// Entry point for tests

// Import the _psql_ client, which will be registered as a handler for the
// "psql" protocol in PGClient
import '@pgproxy/client-psql'

beforeAll(() => {
  process.env.PGURL = "psql://username:password@localhost:5432/my-database"
})

it('should run tests connecting to the database', async () => {
  // ... test the code using `new PGCLient()`
})
```

### Client

Simple queries can be executed on the database via the `query(...)` method:

```ts
const client = new PGClient()
const result = await client.query('SELECT * FROM test WHERE value = $1', [ 'theValue' ])
```

More complex queries (e.g. transactions) can be performed using the
`connect(...)` method:

```ts
const client = new PGClient()
// here "result" will be the value returned by the callback passed to "connect"
const result = await client.connect(async (connection) => {
  await connection.begin()

  await connection.query(...) // ... all transaction queries

  await connection.commit()
  return result // returned to whatever is awaiting on "connect"
})
```

The `query(...)` method requires one parameter, the SQL query to run, and allows
parameters (as an array) to be declared as a second, optional parameter.

A second form of the `query(...)` function accepts an object with two keys:

* `query`: the SQL query to execute optionally containing placeholders
* `params`: any parameter replacement for `$x` placeholders

The object passed to the `connect(...)` callback provides the following methods:

* `query(...)`: as above
* `begin()`: issues the `BEGIN` SQL statement (starts a transaction)
* `commit()`: issues the `COMMIT` SQL statement (commits a transaction)
* `rollback()`: issues the `ROLLBACK` SQL statement (rolls back a transaction)

Uncommitted transactions will always be rolled back by the connection pool code.

### Result

The result returned by the `query(...)` method is a simple object containing:

* `command` (_string_): The SQL command that generated this result (e.g.
  `SELECT`, `INSERT`, ...)
* `rowCount` (_number_): The number of rows affected by the query. \
  This can be the number of lines returned in `rows` (for `SELECT`
  statements, for example) or the number of lines _affected_ by the query
  (the number of records inserted by an `INSERT` query).
* `rows` (_Record<string, any>[]_): The rows returned by the database query,
  keyed by the column name.
* `tuples` (_any[][]_): The tuples returned by the database query, keyed by
  the column index. */


### Types

Each client exposes its own _types registry_ in the `registry` field.

By manipulating the registry, one can tweak the conversion of PostgreSQL types
to JavaScript types.

For more informations see the `@juit/pgproxy-types` package.


### Template Literals

This client also exposes a `SQL` _template tagging function_, or  * a function
capable of converting a template string into a query like structure.

For example:

```typescript
const email = 'user@example.org'
const query = SQL `SELECT * FROM users WHERE email = ${email}`

// Here "query" will be something like:
// {
//   query: 'SELECT * FROM users WHERE email = $1',
//   params: [ 'user@example.org' ],
// }
```

The `SQL` function can also be use with _concatenated_ template strings, for
example:

```typescript
const email = 'user@example.org'
const hash = 'thePasswordHash'
const query = SQL
    `SELECT * FROM users WHERE email = ${email}`
    `AND password_hash = ${hash}`

// Here "query" will be something like:
// {
//   query: 'SELECT * FROM users WHERE email = $1 AND password_hash = $2',
//   params: [ 'user@example.org', 'thePasswordHash' ],
// }
```

In this case, multiple template strings will be concatenated with a single
space character.

This function can be directly used with our query interface, as follows:

```typescript
const client = new PGClient()
const email = 'user@example.org'
const result = await client.query(SQL `SELECT * FROM users WHERE email = ${email}`)
```
