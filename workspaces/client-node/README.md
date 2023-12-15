# PostgreSQL Proxy Client (NodeJS Implementation)

This package provides a NodeJS specific client for PGProxy Servers.

* [Usage with PGClient](#usage-with-pgclient)
* [Direct Usage](#direct-usage)
* [PGProxy](https://github.com/juitnow/juit-pgproxy/blob/main/README.md)
* [Copyright Notice](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)
* [License](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)

### Usage with PGClient

Simply register the client by importing it, and ensure that the `PGURL`
environment variable is set to the HTTP/HTTPS url of the server (or specify
the URL in the constructor):

```ts
import '@juit/pgproxy-client-node'
import { PGClient } from '@juit/pgproxy-client'

const client = new PGClient('https://my-secret@my-pgproxy-server:54321/')
```

### Direct usage

The NodeJS client can be used directly by simply importing the `NodeClient`
class:

```ts
import { NodeClient } from '@juit/pgproxy-client-node'

const client = new NodeClient('https://my-secret@my-pgproxy-server:54321/')
```
