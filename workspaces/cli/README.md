# PostgreSQL Proxy over HTTP and WebSockets (CLI interface)

This package provides a simple command line interface to run the PGProxy Server.

* [Usage](#usage)
* [Configuration Files](#configuration-files)
  * [Main Section](#main-section)
  * [Pool Section](#pool-section)
* [Environment Variables](#environment-variables)
* [PGProxy](https://github.com/juitnow/juit-pgproxy/blob/main/README.md)
* [Copyright Notice](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)
* [License](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)

### Usage

```
Usage:

  pgproxy-server [--options ...] [config file]

Options:

  --debug         Enable verbose logging.
  --help          Show this help page and exit.
  --version       Show version information and exit.

  [config file]   An optional configuration file (in ".ini" format).

Environment variables:

  HTTP Server:

    PGPROXYSECRET        The secret used to authenticate clients.
    PGPROXYADDRESS       The address where this server will be bound to.
    PGPROXYPORT          The port number where this server will be bound to.
    PGPROXYHEALTHCHECK   Path for the unauthenticated health check GET request.

  Connection Pool:

    PGPOOLMINSIZE          Minimum number of connections to keep in the pool.
    PGPOOLMAXSIZE          Maximum number of connections to keep in the pool.
    PGPOOLIDLECONN         Maximum number of idle connections in the pool.
    PGPOOLACQUIRETIMEOUT   Number of seconds after which 'acquire()' will fail.
    PGPOOLBORROWTIMEOUT    Maximum seconds a connection can be borrowed for.
    PGPOOLRETRYINTERVAL    Seconds to wait after connection creation failed.

  PostgreSQL:

    PGHOST       Name of host to connect to.
    PGPORT       Port number to connect to at the server host.
    PGDATABASE   The database name.
    PGUSER       PostgreSQL user name to connect as.
    PGPASSWORD   Password to be used if the server demands authentication.

    See also: https://www.postgresql.org/docs/current/libpq-envars.html

Remarks:

  Environment variables will also be read from a ".env" file in the current
  directory (if such file exists).

  See also: https://github.com/motdotla/dotenv
```

### Configuration Files

The configuration file(s) used by the command line interface are in `ini` format
and contain two parts: the configuration of the PGProxy server (main section),
and the configuration of the connection pool to PostgreSQL (`[pool]` section).

For example

```ini
secret = mySuperSecret
port = 12345

[pool]
database = myDatabaseName
user = myUser
password = myPasswor
host = localhost
port = 5432
```

#### Main section

In the _main_ section the following options are available to configure the
PGProxy server:

* `secret`: The secret used to authenticate clients.
* `address`: The address where this server will be bound to.
* `port`: The port number where this server will be bound to.
* `backlog`: The maximum length of the queue of pending connections.
* `healthCheck`: The path used to provide stats and a healthcheck via GET requests.

Furthermore, underlying NodeJS HTTP server the following options are available.
Refer to the [Node JS documentation](https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener)
for information on their behaviour.

* `connectionsCheckingInterval`
* `highWaterMark`
* `insecureHTTPParser`
* `joinDuplicateHeaders`
* `keepAlive`
* `keepAliveInitialDelay`
* `keepAliveTimeout`
* `maxHeaderSize`
* `noDelay`
* `requestTimeout`

#### Pool section

In the `[pool]` section the following options are available to configure the
connection pool:

* `minimumPoolSize`: The minimum number of connections to keep in the pool
  (default: `0`).
* `maximumPoolSize`: The maximum number of connections to keep in the pool
  (default: `20`).
* `maximumIdleConnections`: The maximum number of idle connections that can be
   sitting in the pool (default: the average between `minimumPoolSize` and
   `maximumPoolSize`).
* `acquireTimeout`: The number of seconds after which an `acquire()` call will
  fail (default: `30` sec.).
* `borrowTimeout`: The maximum number of seconds a connection can be borrowed
  for (default: `120` sec.).
* `retryInterval`: The number of seconds to wait after the creation of a
  connection failed (default: `5` sec.).

Furthermore, to configure the _connections_ to PostgreSQL:

* `database`: The database name.
* `host`: Name of host to connect to.
* `address`: IPv4 or IPv6 numeric IP address of host to connect to.
* `port`: Port number to connect to at the server host.
* `user`: PostgreSQL user name to connect as.
* `password`: Password to be used if the server demands password authentication.
* `connectTimeout`: Maximum wait for connection, in seconds.
* `applicationName`: The `application_name` as it will appear in `pg_stat_activity`.
* `keepalives`: Controls whether client-side TCP keepalives are used.
* `keepalivesIdle`: The number of seconds of inactivity after which TCP should send a keepalive message to the server.
* `keepalivesInterval`: The number of seconds after which a TCP keepalive message that is not acknowledged by the server should be retransmitted.
* `keepalivesCount`: The number of TCP keepalives that can be lost before the client's connection to the server is considered dead.
* `sslMode`: This option determines whether or with what priority a secure SSL
  TCP/IP connection will be negotiated with the server. There are six modes:
   * `disable`: only try a non-SSL connection
   * `allow`: first try a non-SSL connection; if that fails, try an SSL
    connection
   * `prefer` _(default)_: first try an SSL connection; if that fails, try a
     non-SSL connection
   * `require`: only try an SSL connection. If a root CA file is present, verify
     the certificate in the same way as if verify-ca was specified
   * `verify-ca`: only try an SSL connection, and verify that the server
     certificate is issued by a trusted certificate authority (CA)
   * `verify-full`: only try an SSL connection, verify that the server
     certificate is issued by a trusted CA and that the server host name matches
     that in the certificate
* `sslCompression`: If set to `true` (default), data sent over SSL connections
  will be compressed.
* `sslCertFile`: The file name of the client SSL certificate.
* `sslKeyFile`: The location for the secret key used for the client certificate.
* `sslRootCertFile`: The name of a file containing SSL certificate authority
  (CA) certificate(s).
* `sslCrlFile`: The file name of the SSL certificate revocation list (CRL).
* `kerberosServiceName`: Kerberos service name to use when authenticating with
  Kerberos 5 or GSSAPI.
* `gssLibrary`: GSS library to use for GSSAPI authentication.

### Environment Variables

Most options can also be configured through environment variables as follows:

* _main._`secret` => `PGPROXYSECRET`
* _main._`address` => `PGPROXYADDRESS`
* _main._`port` => `PGPROXYPORT`
* _main._`healthCheck` => `PGPROXYHEALTHCHECK`

For the connection pool:

* `pool.minimumPoolSize` => `PGPOOLMINSIZE`
* `pool.maximumPoolSize` => `PGPOOLMAXSIZE`
* `pool.maximumIdleConnections` => `PGPOOLIDLECONN`
* `pool.acquireTimeout` => `PGPOOLACQUIRETIMEOUT`
* `pool.borrowTimeout` => `PGPOOLBORROWTIMEOUT`
* `pool.retryInterval` => `PGPOOLRETRYINTERVAL`

And for the connection to PosgreSQL:

* `pool.host` => `PGHOST`
* `pool.port` => `PGPORT`
* `pool.database` => `PGDATABASE`
* `pool.user` => `PGUSER`
* `pool.password` => `PGPASSWORD`

For more see also: https://www.postgresql.org/docs/current/libpq-envars.html
