-- We need UUID support in our database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- An auxiliary table for join tests
CREATE TABLE "joined" (
  "uuid" UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  "key"  VARCHAR(1)  NOT NULL UNIQUE,
  "date" TIMESTAMPTZ,
  "json" JSONB
);

-- Insert some data into the joined table
INSERT INTO "joined" ("key", "date") VALUES
  ('A', '2001-01-01T01:01:01+00'),
  ('C', '2002-02-02T02:02:02+00'),
  ('E', '2003-03-03T03:03:03+00'),
  ('G', '2004-04-04T04:04:04+00'),
  ('I', '2005-05-05T05:05:05+00'),
  ('K', '2006-06-06T06:06:06+00');
INSERT INTO "joined" ("key", "json") VALUES
  ('B', '{"a":1,"b":"test","date":"2001-01-01T01:01:01.000Z"}'),
  ('D', '{"a":1,"b":"test","nodate":"before 2001-01-01T01:01:01.000Z after"}'),
  ('F', '{"a":1,"b":"test"}'),
  ('H', '{"a":1,"b":"test"}'),
  ('J', '{"a":1,"b":"test"}'),
  ('L', '{"a":1,"b":"test"}');

-- The main table for our tests
CREATE TABLE "main" (
  "uuid"   UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  "ref"    UUID                 REFERENCES "joined"("uuid"),
  "key"    VARCHAR(6)  NOT NULL UNIQUE,
  "date"   TIMESTAMPTZ NOT NULL,
  "number" INTEGER,
  "json"   JSONB
);

-- Full text search column and index
ALTER TABLE "main" ADD COLUMN "_search" tsvector
  GENERATED ALWAYS AS (setweight(to_tsvector('simple', COALESCE("key", '')), 'A')) STORED;
CREATE INDEX "main__search_idx" ON "main" USING GIN ("_search");

-- Insert some data into the main table (refs are inverted, A refers to L, B to K, etc)
INSERT INTO "main" ("key", "date", "number", "json", "ref") VALUES
  ('AAAAAA', '2001-01-01T01:01:01+00', 1024, '{"here": "A", "there": "L"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'L')),
  ('BBBBBB', '2002-02-02T02:02:02+00', 1023, '{"here": "B", "there": "K"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'K')),
  ('CCCCCC', '2003-03-03T03:03:03+00', 1022, '{"here": "C", "there": "J"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'J')),
  ('DDDDDD', '2004-04-04T04:04:04+00', 1021, '{"here": "D", "there": "I"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'I')),
  ('EEEEEE', '2005-05-05T05:05:05+00', 1020, '{"here": "E", "there": "H"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'H')),
  ('FFFFFF', '2006-06-06T06:06:06+00', 1019, '{"here": "F", "there": "G"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'G')),
  ('GGGGGG', '2007-07-07T07:07:07+00', 1018, '{"here": "G", "there": "F"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'F')),
  ('HHHHHH', '2008-08-08T08:08:08+00', 1017, '{"here": "H", "there": "E"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'E')),
  ('IIIIII', '2009-09-09T09:09:09+00', 1016, '{"here": "I", "there": "D"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'D')),
  ('JJJJJJ', '2010-10-10T10:10:10+00', 1015, '{"here": "J", "there": "C"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'C')),
  ('KKKKKK', '2011-11-11T11:11:11+00', 1014, '{"here": "K", "there": "B"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'B')),
  ('LLLLLL', '2012-12-12T12:12:12+00', 1013, '{"here": "L", "there": "A"}', (SELECT "uuid" FROM "joined" WHERE "key" = 'A'));
INSERT INTO "main" ("key", "date", "number", "json") VALUES
  ('mmmmmm', '2013-01-13T13:13:13+00', 1012, '{"here": "m", "there": null, "other": 123}'),
  ('nnnnnn', '2014-02-14T14:14:14+00', 1011, '{"here": "n", "there": null, "other": 456}'),
  ('oooooo', '2015-03-15T15:15:15+00', 1010, '{"here": "o", "there": null}'),
  ('pppppp', '2016-04-16T16:16:16+00', 1009, '{"here": "p", "there": null}'),
  ('qqqqqq', '2017-05-17T17:17:17+00', 1008, '{"here": "q", "there": null}'),
  ('rrrrrr', '2018-06-18T18:18:18+00', 1007, '{"here": "r", "there": null}'),
  ('ssssss', '2019-07-19T19:19:19+00', 1006, '{"here": "s", "there": null}'),
  ('tttttt', '2020-08-20T20:20:20+00', 1005, '{"here": "t", "there": null}'),
  ('uuuuuu', '2021-09-21T21:21:21+00', 1004, '{"here": "u", "there": null}'),
  ('vvvvvv', '2021-10-21T21:21:21+00', 1003, '{"here": "v", "there": null}'),
  ('wwwwww', '2021-11-21T21:21:21+00', 1002, '{"here": "w", "there": null}'),
  ('xxxxxx', '2021-12-21T21:21:21+00', 1001, '{"here": "x", "there": null}');
