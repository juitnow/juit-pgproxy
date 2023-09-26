import { Persister } from '../src/index'

const foo = new Persister({
  users: {
    uuid: { type: 'uuid', oid: 2950, isNullable: false, hasDefault: true },
    given_name: { type: 'varchar', oid: 1043, isNullable: false, hasDefault: false },
    family_name: { type: 'varchar', oid: 1043, isNullable: false, hasDefault: false },
    created: { type: 'timestamptz', oid: 1184, isNullable: true, hasDefault: true },
    preferences: { type: 'jsonb', oid: 3802, isNullable: true, hasDefault: false },
  },
} as const)

const model = foo.in('users')
const result = await model.find({
  given_name: '1043',
  family_name: '1043',
}, [ 'created DESC', 'given_name DESC' ])
if (! result) throw new Error
result.uuid
result.given_name
result.family_name
result.created
result.preferences

const fox = {
  'uuid': '2950',
}

const bar = {
  'uuid': '2950',
  'created': new Date(),
  'family_name': '1043',
  'given_name': '1043',
}

await model.upsert(fox, bar)

// model.sort('prefer/ences ASC')
