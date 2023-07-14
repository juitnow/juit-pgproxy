AUTHENTICATION TOKEN
====================

Our authentication token is defined as follows:

| bits              | bytes          | field                     |
|-------------------|----------------|---------------------------|
|   0 ...  63  (64) |  0 ... 7   (8) | timestamp (little endian) |
|  64 ... 127  (64) |  8 ... 15  (8) | random bytes              |
| 128 ... 392 (256) | 16 ... 47 (32) | HMAC-SHA-256 signature    |

The signature is calculated using the HMAC-SHA-256 algorithm using the
UTF-8 encoding of our `secret` as the _key_ and the concatenation of the
following fields as message:

1. Header, the first 16 bytes of the authentication token, containing:
   1. Little endian representation of the current timestamp (64 bits)
   2. Random data (64 bits)
2. UTF-8 encoding of the database name (variable length)

The timeout specified in the header should be validated and checked against the
time when the server receives the request, within a reasonable time delta
(plus/minus 10 seconds) in order to account for time drift.

Furthermore, the header (first 16 bytes of the message) should be cached by the
server and authentication *MUST* be rejected if another request presents the
same token.

The total length of 48 bytes has been chosen so that the BASE-64 encoding
of the authentication token is precisely 64 characters long and doesn't
require any extra padding.
