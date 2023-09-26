# PostgreSQL Proxy Client (LibPQ Implementation)

This package provides a `PGClient` implementation _directly connecting_ to
PostgreSQL servers, and not requiring a PGProxy Server to run.

This is useful (mostly? only?) when running tests with a PostgreSQL instance
running on a developer's machine, or in CI environments.

* [Usage with PGClient](#usage-with-pgclient)
* [Direct Usage](#direct-usage)
* [Environment Variables](#environment-variables)
* [PGProxy](https://github.com/juitnow/juit-pgproxy/blob/main/README.md)
* [Copyright Notice](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)
* [License](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)

### Usage with PGClient

Simply register the client by importing it, and ensure that the `PGURL`
environment variable is set to the `psql` url of the PostgreSQL server (or
specify the URL in the constructor):

```ts
import '@juit/pgproxy-client-psql'
import { PGClient } from '@juit/pgproxy-client'

const client = new PGClient('psql://username:password@locahost:5432/my-database')
```

### Direct usage

The PSQL client can be used directly by simply importing the `PSQLClient`
class:

```ts
import { PSQLClient } from '@juit/pgproxy-client-psql'

const client = new PSQLClient('psql://username:password@locahost:5432/my-database')
```

### Environment Variables

The `PSQLClient` implementation does not _require_ a connection URL, and all
connection parameters can be specified via `libpq` environment variables.

The special (empty) URL `psql:///` can be used with `PGClient` in order to
trigger this behaviour or `PSQLClient` instances can be constructed without
an URL parameter.

For a description of the environment variables supported by `libpq` simply look
at the [official documentation](https://www.postgresql.org/docs/current/libpq-envars.html).
