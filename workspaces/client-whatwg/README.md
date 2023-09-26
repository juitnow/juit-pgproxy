# PostgreSQL Proxy Client (WHATWG + WebCrypto Implementation)

This package provides client for PGProxy Servers based on WHATWG `fetch` and
WebSockets, and the WebCrypto API.

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
import '@juit/pgproxy-client-whatwg'
import { PGClient } from '@juit/pgproxy-client'

const client = new PGClient('https://my-secret@my-pgproxy-server:54321/')
```

### Direct usage

The WHATWG client can be used directly by simply importing the `WHATWGClient`
class:

```ts
import { WHATWGClient } from '@juit/pgproxy-client-whatwg'

const client = new WHATWGClient('https://my-secret@my-pgproxy-server:54321/')
```
