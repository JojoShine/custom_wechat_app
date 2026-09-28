import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import type { DemoOrderView, PaymentView, RefundView } from '@template/contracts'
import { apiRequest } from '../../core/api/client'
import { createPaymentFlow } from '../../core/payments/payment'
import { recoverProtectedError } from '../../core/navigation/recover'
import { DEMO_PAYMENT_PATH } from '../../core/navigation/routes'

const path = DEMO_PAYMENT_PATH
const flow = createPaymentFlow({ request: apiRequest, requestPayment: (params) => Taro.requestPayment(params) })
const redirectTo = (url: string) => Taro.redirectTo({ url })

export default function DemoPayment(): JSX.Element {
  const [order, setOrder] = useState<DemoOrderView | null>(null)
  const [payment, setPayment] = useState<PaymentView | null>(null)
  const [refund, setRefund] = useState<RefundView | null>(null)
  const [refundRequestId, setRefundRequestId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function loadOrder(orderId: string): Promise<void> {
    setOrder(await apiRequest<DemoOrderView>({ url: `/demo/payments/orders/${encodeURIComponent(orderId)}`, method: 'GET' }))
  }

  async function purchase(): Promise<void> {
    setBusy(true)
    setMessage('')
    try {
      const latest = await flow.purchaseDemo(setPayment)
      setPayment(latest)
      await loadOrder(latest.businessOrderId)
      setMessage(latest.status === 'SUCCEEDED' ? '支付已由服务端确认' : '支付结果待确认，请稍后刷新')
    } catch (error) {
      if (!await recoverProtectedError(error, path, redirectTo)) setMessage('下单或查单失败，请稍后重试')
    } finally { setBusy(false) }
  }

  async function refresh(): Promise<void> {
    if (!payment) return
    setBusy(true)
    try {
      setPayment(await flow.refresh(payment.id))
      await loadOrder(payment.businessOrderId)
      if (refund) {
        setRefund(await apiRequest<RefundView>({ url: `/payments/${payment.id}/refunds/${refund.id}`, method: 'GET' }))
      }
      setMessage('状态已更新')
    } catch (error) {
      if (!await recoverProtectedError(error, path, redirectTo)) setMessage('查询失败，请稍后重试')
    } finally { setBusy(false) }
  }

  async function requestRefund(): Promise<void> {
    if (!order) return
    setBusy(true)
    const requestId = refundRequestId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setRefundRequestId(requestId)
    try {
      const latest = await flow.requestDemoRefund(order.id, requestId)
      setRefund(latest)
      setRefundRequestId(null)
      setMessage('退款申请已提交，最终结果以服务端查询为准')
    } catch (error) {
      if (!await recoverProtectedError(error, path, redirectTo)) setMessage('退款申请未确认，请保留本次请求并重试')
    } finally { setBusy(false) }
  }

  return <View style={{ padding: '32px' }}>
    <Text>支付联调演示</Text>
    <View style={{ marginTop: '20px' }}><Text>固定测试商品：10 分</Text></View>
    <Button disabled={busy} onClick={() => void purchase()}>创建订单并支付</Button>
    {order ? <View><Text>业务订单：{order.id}，状态：{order.status}</Text></View> : null}
    {payment ? <View><Text>支付状态：{payment.status}</Text></View> : null}
    {refund ? <View><Text>退款状态：{refund.status}，金额：{refund.amountFen} 分</Text></View> : null}
    {payment ? <Button disabled={busy} onClick={() => void refresh()}>刷新结果</Button> : null}
    {order?.status === 'PAID' ? <Button disabled={busy} onClick={() => void requestRefund()}>申请 1 分退款</Button> : null}
    {message ? <View><Text>{message}</Text></View> : null}
  </View>
}
