import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

try {
  await client.query('BEGIN')
  const openId = `unique-test-${randomUUID()}`
  await client.query(
    'INSERT INTO users (id, wechat_open_id, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
    [randomUUID(), openId]
  )

  let duplicateError
  try {
    await client.query(
      'INSERT INTO users (id, wechat_open_id, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
      [randomUUID(), openId]
    )
  } catch (error) {
    duplicateError = error
  }

  assert.equal(duplicateError?.code, '23505')
  console.log('Duplicate WeChat identity rejected by PostgreSQL')
} finally {
  await client.query('ROLLBACK')
  await client.end()
}
