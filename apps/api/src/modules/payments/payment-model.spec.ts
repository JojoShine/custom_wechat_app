import { describe, expect, test } from 'vitest'
import { PaymentStatus, RefundStatus } from '../../generated/prisma/enums.js'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

describe('payment persistence contract', () => {
  test('exposes distinct pending and final states to consumers', () => {
    expect(PaymentStatus.PENDING).toBe('PENDING')
    expect(PaymentStatus.SUCCEEDED).toBe('SUCCEEDED')
    expect(RefundStatus.PROCESSING).toBe('PROCESSING')
    expect(RefundStatus.CLOSED).toBe('CLOSED')
  })

})

describe.skipIf(!process.env.TEST_DATABASE_URL)('payment database constraints', () => {
  test('rejects non-positive amounts and duplicate payment or refund identifiers', async () => {
    const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
    await client.connect()
    try {
      await client.query('BEGIN')
      const userId = randomUUID()
      const paymentId = randomUUID()
      const paymentData = [paymentId, `test-${randomUUID()}`, `order-${randomUUID()}`, `key-${randomUUID()}`, userId, `pay-${randomUUID()}`]
      await client.query('INSERT INTO users (id, wechat_open_id, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())', [userId, `test-${randomUUID()}`])
      const insertPayment = 'INSERT INTO payments (id, business_type, business_order_id, idempotency_key, user_id, amount_fen, description, out_trade_no, expires_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())'
      await client.query(insertPayment, [paymentData[0], paymentData[1], paymentData[2], paymentData[3], paymentData[4], 10, 'test', paymentData[5]])

      async function rejection(sql: string, values: unknown[], code: string): Promise<void> {
        await client.query('SAVEPOINT test_constraint')
        await expect(client.query(sql, values)).rejects.toMatchObject({ code })
        await client.query('ROLLBACK TO SAVEPOINT test_constraint')
      }

      await rejection(insertPayment, [randomUUID(), `test-${randomUUID()}`, `order-${randomUUID()}`, `key-${randomUUID()}`, userId, 0, 'test', `pay-${randomUUID()}`], '23514')
      await rejection(insertPayment, [randomUUID(), `test-${randomUUID()}`, `order-${randomUUID()}`, `key-${randomUUID()}`, userId, 10, 'test', paymentData[5]], '23505')

      const insertRefund = 'INSERT INTO refunds (id, payment_id, business_refund_id, amount_fen, reason, out_refund_no, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())'
      const businessRefundId = `refund-${randomUUID()}`
      await client.query(insertRefund, [randomUUID(), paymentId, businessRefundId, 1, 'test', `out-${randomUUID()}`])
      await rejection(insertRefund, [randomUUID(), paymentId, businessRefundId, 1, 'test', `out-${randomUUID()}`], '23505')
      await rejection(insertRefund, [randomUUID(), paymentId, `refund-${randomUUID()}`, 0, 'test', `out-${randomUUID()}`], '23514')
    } finally {
      await client.query('ROLLBACK')
      await client.end()
    }
  })
})
