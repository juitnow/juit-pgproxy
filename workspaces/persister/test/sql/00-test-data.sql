-- We need UUID support in our database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- An auxiliary table for join tests
CREATE TABLE "joined" (
  "uuid" UUID        NOT NULL PRIMARY KEY,
  "key"  VARCHAR(1)  NOT NULL UNIQUE,
  "date" TIMESTAMPTZ
);

-- Insert some data into the joined table
INSERT INTO "joined" ("uuid", "key", "date") VALUES
  ('e1a19dbe-17e5-44a1-b3d6-bceb707e1131', 'A', '2001-01-01T01:01:01+00'),
  ('b24ddae4-5877-41ab-9472-0789606d4e4f', 'B', NULL),
  ('4e4dc69b-a0ef-478f-a928-8e8fbddb5f58', 'C', '2002-02-02T02:02:02+00'),
  ('e7c1a331-18f8-4b0b-b4f4-0ca14ea9a0a1', 'D', NULL),
  ('8046239b-3c96-4f25-b377-96122471442c', 'E', '2003-03-03T03:03:03+00'),
  ('b9f5b9b1-71d6-48c4-ab40-453b4005fc4c', 'F', NULL),
  ('3292abc3-6f66-4fe0-a4f2-f1c7c8427abd', 'G', '2004-04-04T04:04:04+00'),
  ('d17577e4-5874-46ba-8ea8-062e765db9c0', 'H', NULL),
  ('6f709728-55db-447e-b17e-eab00dc72fc4', 'I', '2005-05-05T05:05:05+00'),
  ('97d26faf-c77b-4ae2-971c-2f6704d79258', 'J', NULL),
  ('a2229338-260c-4c9f-ac89-92c2bdc4d582', 'K', '2006-06-06T06:06:06+00'),
  ('2b9c4b69-b584-4c63-a6c3-28a7583c6233', 'L', NULL);

-- The main table for our tests
CREATE TABLE "main" (
  "uuid"   UUID        NOT NULL PRIMARY KEY,
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

-- Insert some MORE data into the main table (refs are inverted, A refers to L, B to K, etc)
INSERT INTO "main" ("uuid", "ref", "key", "date", "number", "json") VALUES
  ('b13bad8a-2b69-4614-82ab-5884ab380a4f', '2b9c4b69-b584-4c63-a6c3-28a7583c6233', 'AAAAAA', '2001-01-01T01:01:01+00', 1024, '{"here": "A", "there": "L"}' ),
  ('0fc8a71e-0a46-4d15-b287-6338e10f9d33', 'a2229338-260c-4c9f-ac89-92c2bdc4d582', 'BBBBBB', '2002-02-02T02:02:02+00', 1023, '{"here": "B", "there": "K"}' ),
  ('512e04aa-9820-41ee-9b3f-54960844e43e', '97d26faf-c77b-4ae2-971c-2f6704d79258', 'CCCCCC', '2003-03-03T03:03:03+00', 1022, '{"here": "C", "there": "J"}' ),
  ('753cdc51-2823-4036-ac57-f4832b4adb7d', '6f709728-55db-447e-b17e-eab00dc72fc4', 'DDDDDD', '2004-04-04T04:04:04+00', 1021, '{"here": "D", "there": "I"}' ),
  ('222df885-470a-4f1d-a2e3-a75d50a4d503', 'd17577e4-5874-46ba-8ea8-062e765db9c0', 'EEEEEE', '2005-05-05T05:05:05+00', 1020, '{"here": "E", "there": "H"}' ),
  ('fbbc36da-0fa9-4fc0-8659-6ffafd14ce9c', '3292abc3-6f66-4fe0-a4f2-f1c7c8427abd', 'FFFFFF', '2006-06-06T06:06:06+00', 1019, '{"here": "F", "there": "G"}' ),
  ('591e0f96-b6c8-4433-8b6d-877d7bafd6d0', 'b9f5b9b1-71d6-48c4-ab40-453b4005fc4c', 'GGGGGG', '2007-07-07T07:07:07+00', 1018, '{"here": "G", "there": "F"}' ),
  ('e5888b2c-5620-406f-8892-1205cf89e6a9', '8046239b-3c96-4f25-b377-96122471442c', 'HHHHHH', '2008-08-08T08:08:08+00', 1017, '{"here": "H", "there": "E"}' ),
  ('3a8bf731-e640-4b54-b539-99c5d95e1a1b', 'e7c1a331-18f8-4b0b-b4f4-0ca14ea9a0a1', 'IIIIII', '2009-09-09T09:09:09+00', 1016, '{"here": "I", "there": "D"}' ),
  ('217c98ba-012a-4e59-8ec3-4c819b56ce99', '4e4dc69b-a0ef-478f-a928-8e8fbddb5f58', 'JJJJJJ', '2010-10-10T10:10:10+00', 1015, '{"here": "J", "there": "C"}' ),
  ('b461aba5-e413-4536-99f8-efbb740e20be', 'b24ddae4-5877-41ab-9472-0789606d4e4f', 'KKKKKK', '2011-11-11T11:11:11+00', 1014, '{"here": "K", "there": "B"}' ),
  ('ff2aae89-5297-4502-9df8-d4e54846898f', 'e1a19dbe-17e5-44a1-b3d6-bceb707e1131', 'LLLLLL', '2012-12-12T12:12:12+00', 1013, '{"here": "L", "there": "A"}' ),
  ('03af3cb8-c110-4863-960f-061f677991b3', null,                                   'mmmmmm', '2013-01-13T13:13:13+00', 1012, '{"here": "m", "there": null}' ),
  ('42738a2c-392d-494d-be40-b244671e2f6f', null,                                   'nnnnnn', '2014-02-14T14:14:14+00', 1011, '{"here": "n", "there": null}' ),
  ('1daf89df-5796-4148-a650-c6dfe3bc642b', null,                                   'oooooo', '2015-03-15T15:15:15+00', 1010, '{"here": "o", "there": null}' ),
  ('16e65c9a-2e69-4aed-bded-47ff8dc1776c', null,                                   'pppppp', '2016-04-16T16:16:16+00', 1009, '{"here": "p", "there": null}' ),
  ('52965c03-211d-4618-959a-20276787a1b4', null,                                   'qqqqqq', '2017-05-17T17:17:17+00', 1008, '{"here": "q", "there": null}' ),
  ('ae4a2e0f-0039-4765-bd3e-33670e914a3e', null,                                   'rrrrrr', '2018-06-18T18:18:18+00', 1007, '{"here": "r", "there": null}' ),
  ('3014822a-d093-477c-aea8-cea8d405b80d', null,                                   'ssssss', '2019-07-19T19:19:19+00', 1006, '{"here": "s", "there": null}' ),
  ('47a117ed-302a-4245-a117-35d21dad2da6', null,                                   'tttttt', '2020-08-20T20:20:20+00', 1005, '{"here": "t", "there": null}' ),
  ('7570411f-a9dc-426d-83fd-98e9077f981d', null,                                   'uuuuuu', '2021-09-21T21:21:21+00', 1004, '{"here": "u", "there": null}' ),
  ('8ec67acd-b1c3-48c5-bdb0-db38ef58594a', null,                                   'vvvvvv', '2021-10-21T21:21:21+00', 1003, '{"here": "v", "there": null}' ),
  ('9101f3be-3f8c-4c3b-b4fd-f6c1348fe996', null,                                   'wwwwww', '2021-11-21T21:21:21+00', 1002, '{"here": "w", "there": null}' ),
  ('1231e580-4b55-4e71-9562-2a867b0f5f4e', null,                                   'xxxxxx', '2021-12-21T21:21:21+00', 1001, '{"here": "x", "there": null}' );
