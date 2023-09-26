# PostgreSQL Proxy Types Conversion

This package provides two-way type conversion between PostgreSQL strings and
the data types they represent in JavaScript.

New parsers for OIDs can be registered in the various `Registry` instances
(or globally with the static `Registry.registerDefaultParser(...)` method).

Custom serialization can be achieved by having values implementing the
`PGSerializable` interface.

* [PGProxy](https://github.com/juitnow/juit-pgproxy/blob/main/README.md)
* [Copyright Notice](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)
* [License](https://github.com/juitnow/juit-pgproxy/blob/main/NOTICE.md)
