# PostgreSQL Proxy over HTTP and WebSockets

This repository contains a full implementation for a PosgreSQL database proxy
using HTTP and WebSockets.

* [Rationale](#rationale)
* [Principle](#principle)
* [Copyright Notice](NOTICE.md)
* [License](LICENSE.md)

### Rationale

Establishing a connection to a PostgreSQL database is a rather expensive
operation. This is a widely known issue, and that's why connection pools are
normally used to alleviate the issue.

That said, connection pools are best suited for long-lived server processes,
and don't play well with "serverless" types of deployment (for example AWS
Lambda Functions or CloudFlare Workers).

AWS introduced RDS Proxy to alleviate some of the problems related with Lambda
functions, and introduced a _data api_ (available only with RDS Serverless v1)
that allowed HTTP-based access (a great help with CloudFlare workers), but with
the endpoint deprecated, no other solutions exist at this time.

### Principle

This PostgreSQL proxy is a tiny server providing acccess to pooled PostgreSQL
connections over HTTP (for HTTPs use a load balancing solution like NGINX or
AWS Application Load Balancer).

Single queries can be executed with POST, while multiple statements (such as
multi-step transactions) can be executed over the WebSocket protocol.

The protocol is _extremely_ trivial and only _strings_ (in the format defined
by `libpq` are passed over-the-wire, while conversion from said strings to
their JavaScript equivalent is performed by the client.

Clients are available for

* Node JS: [`@juit/pgproxy-client-node`](./workspaces/node) \
  'Nuff said!
* WHATWG + WebCrypto: [`@juit/pgproxy-client-whatwg`](./workspaces/whatwg) \
  Although this client can be used in a browser, it is _specifically_ designed
  to work with CloudFlare Workers (and tested with `workerd`).
* Direct via LibPQ: [`@juit/pgproxy-client-libpq`](./workspaces/libpq) \
  Defeating the purpose of the client-server model, used normally only for
  running unit tests or in development environments.

The server component of the proxy is provided both as an installable library
in [`@juit/pgproxy-server`](./workspaces/server), and an extremely simple
command line interface can be found in the [`@juit/pgproxy`](./workspaces/cli)
package.

### Components:

* [`@juit/pgproxy`](workspaces/cli) \
  Command line interface to easily run our PGProxy Server.
* [`@juit/pgproxy-client`](workspaces/client) \
  Abstract implementation of the PGProxy Client and registry for actual
  implementations, somewhat inspired by the way JDBC drivers work in Java-land.
* [`@juit/pgproxy-client-node`](workspaces/client-node) \
  Concrete implementation of the PGProxy Client for Node JS.
* [`@juit/pgproxy-client-psql`](workspaces/client-psql) \
  Test PGProxy Client implementation using `libpq` directly.
* [`@juit/pgproxy-client-whatwg`](workspaces/client-whatwg) \
  Concrete implementation of the PGProxy Client for CloudFlare Workers.
* [`@juit/pgproxy-pool`](workspaces/pool) \
  Connectivity layer to PostgreSQL via `libpq` offering connection pooling.
* [`@juit/pgproxy-server`](workspaces/server) \
  Library providing the main implementation of our PGProxy Server.
* [`@juit/pgproxy-types`](workspaces/types) \
  Library providing type conversions between `libpq` strings and JavaScript
  objects.
