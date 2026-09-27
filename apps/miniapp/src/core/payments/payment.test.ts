import type { PaymentLaunchParams, PaymentView, RefundView } from '@template/contracts'
import { createPaymentFlow } from './payment'

const launch: PaymentLaunchParams = { timeStamp: '1', nonceStr: 'nonce', package: 'prepay_id=one', signType: 'RSA', paySign: 'signed' }
const pending: PaymentView = { id: 'payment-1', businessType: 'demo', businessOrderId: 'order-1', amountFen: 10, status: 'PENDING', createdAt: '2026-09-28T00:00:00.000Z' }
const success: PaymentView = { ...pending, status: 'SUCCEEDED' }

function setup(query: PaymentView[] = [success]) {
  const request = jest.fn(async <T>(options: { url: string; method?: string; data?: unknown }): Promise<T> => {
    if (options.url === '/demo/payments/orders') return { order: { id: 'order-1' }, payment: pending, launch } as T
    if (options.url === '/payments/payment-1') return (query.shift() ?? pending) as T
    if (options.url === '/demo/payments/orders/order-1/refunds') return { id: 'refund-1', paymentId: 'payment-1', amountFen: 1, status: 'PROCESSING', createdAt: pending.createdAt } as T
    throw new Error('unexpected request')
  })
  const requestPayment = jest.fn(async (_params: PaymentLaunchParams) => {})
  const sleep = jest.fn(async () => {})
  return { request, requestPayment, sleep, flow: createPaymentFlow({ request: request as never, requestPayment, sleep }) }
}

test('submits only server-issued launch params and confirms payment from API', async () => {
  const { flow, request, requestPayment } = setup([pending, success])
  expect(await flow.purchaseDemo()).toEqual(success)
  expect(requestPayment).toHaveBeenCalledWith(launch)
  expect(request).toHaveBeenCalledWith({ url: '/demo/payments/orders', method: 'POST' })
})

test('user cancellation does not become a local payment failure or success', async () => {
  const { flow, requestPayment } = setup([pending, pending, pending])
  requestPayment.mockRejectedValueOnce(new Error('requestPayment:fail cancel'))
  expect((await flow.purchaseDemo()).status).toBe('PENDING')
})

test('payment API network failure propagates and cannot be treated as paid', async () => {
  const { flow, request } = setup()
  request.mockRejectedValueOnce(new Error('network unavailable'))
  await expect(flow.purchaseDemo()).rejects.toThrow('network unavailable')
})

test('requestPayment network failure still asks server for trusted payment status', async () => {
  const { flow, requestPayment } = setup([success])
  requestPayment.mockRejectedValueOnce(new Error('network unavailable'))
  expect((await flow.purchaseDemo()).status).toBe('SUCCEEDED')
})

test('refund request sends idempotency key only and returns processing status', async () => {
  const { flow, request } = setup()
  const refund: RefundView = await flow.requestDemoRefund('order-1', 'request-1')
  expect(refund.status).toBe('PROCESSING')
  expect(request).toHaveBeenCalledWith({ url: '/demo/payments/orders/order-1/refunds', method: 'POST', data: { requestId: 'request-1' } })
})
