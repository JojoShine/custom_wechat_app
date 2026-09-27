import type { DemoPurchaseResult, PaymentLaunchParams, PaymentView, RefundView } from '@template/contracts'
import type { RequestOptions } from '../session/auth'

type Request = <T>(options: RequestOptions) => Promise<T>

export function createPaymentFlow(deps: {
  request: Request
  requestPayment(params: PaymentLaunchParams): Promise<unknown>
  sleep?(ms: number): Promise<void>
}) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  async function refresh(paymentId: string): Promise<PaymentView> {
    return deps.request<PaymentView>({ url: `/payments/${encodeURIComponent(paymentId)}`, method: 'GET' })
  }

  async function purchaseDemo(onCreated?: (payment: PaymentView) => void): Promise<PaymentView> {
    const { payment, launch } = await deps.request<DemoPurchaseResult>({ url: '/demo/payments/orders', method: 'POST' })
    onCreated?.(payment)
    try { await deps.requestPayment(launch) } catch { /* The server still determines the payment result. */ }
    let latest = payment
    for (let attempt = 0; attempt < 3; attempt++) {
      latest = await refresh(payment.id)
      if (latest.status !== 'PENDING' && latest.status !== 'CREATING' && latest.status !== 'UNKNOWN') return latest
      if (attempt < 2) await sleep(1000)
    }
    return latest
  }

  async function requestDemoRefund(orderId: string, requestId: string): Promise<RefundView> {
    return deps.request<RefundView>({
      url: `/demo/payments/orders/${encodeURIComponent(orderId)}/refunds`,
      method: 'POST', data: { requestId }
    })
  }

  return { purchaseDemo, refresh, requestDemoRefund }
}
