import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import type { DemoOrderView, PaymentView, RefundView } from '@template/contracts'
import { apiRequest } from '../../core/api/client'
import { createPaymentFlow } from '../../core/payments/payment'
import { recoverProtectedError } from '../../core/navigation/recover'
import { DEMO_PAYMENT_PATH } from '../../core/navigation/routes'
import './index.css'

const path = DEMO_PAYMENT_PATH
const flow = createPaymentFlow({ request: apiRequest, requestPayment: (params) => Taro.requestPayment(params) })
const redirectTo = (url: string) => Taro.redirectTo({ url })
const paymentLabels: Record<PaymentView['status'], string> = {
  CREATING: '正在创建', PENDING: '等待支付确认', SUCCEEDED: '支付已确认',
  CLOSED: '交易已关闭', FAILED: '支付失败', UNKNOWN: '结果待核实'
}
const refundLabels: Record<RefundView['status'], string> = {
  REQUESTING: '正在申请', PROCESSING: '退款处理中', SUCCEEDED: '退款成功',
  CLOSED: '退款已关闭', ABNORMAL: '退款异常', UNKNOWN: '结果待核实'
}

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

  return <View className='demo-pay-page'>
    <View className='demo-pay-hero'>
      <Text className='demo-pay-kicker'>FENGWU / PAYMENT LAB</Text>
      <Text className='demo-pay-title'>支付实验</Text>
      <Text className='demo-pay-subtitle'>用一笔小额交易体验支付与退款流程</Text>
      <View className='demo-pay-hero-mark'>✦</View>
    </View>

    <View className='demo-pay-card'>
      <View className='demo-pay-card-heading'>
        <Text className='demo-pay-section-index'>01 / 演示商品</Text>
        <Text className='demo-pay-tag'>固定价格</Text>
      </View>
      <Text className='demo-pay-product-name'>{order?.productName ?? '支付联调商品'}</Text>
      <View className='demo-pay-price-row'>
        <Text className='demo-pay-price'><Text className='demo-pay-currency'>¥</Text>0.10</Text>
        <Text className='demo-pay-price-note'>人民币 · 10 分</Text>
      </View>
      <Button className='demo-pay-button demo-pay-primary' loading={busy} disabled={busy} onClick={() => void purchase()}>
        创建订单并支付
      </Button>
      <Text className='demo-pay-hint'>实际支付 ¥0.10，支付结果以服务端确认状态为准。</Text>
    </View>

    <View className='demo-pay-card'>
      <Text className='demo-pay-section-index'>02 / 支付状态</Text>
      <View className='demo-pay-status-row'>
        <View className='demo-pay-status-dot' />
        <Text className='demo-pay-status-title'>{payment ? paymentLabels[payment.status] : '尚未创建订单'}</Text>
      </View>
      <Text className='demo-pay-section-copy'>{payment ? '如状态仍待确认，可主动向服务端查询。' : '完成上方操作后，可在这里查看可信支付结果。'}</Text>
      {order ? <View className='demo-pay-detail'><Text>业务订单</Text><Text selectable className='demo-pay-detail-value'>{order.id}</Text></View> : null}
      {order ? <View className='demo-pay-detail'><Text>订单状态</Text><Text className='demo-pay-detail-value'>{order.status === 'PAID' ? '已支付' : '待支付'}</Text></View> : null}
      {payment ? <Button className='demo-pay-button demo-pay-secondary' loading={busy} disabled={busy} onClick={() => void refresh()}>刷新支付结果</Button> : null}
    </View>

    <View className='demo-pay-card demo-pay-refund-card'>
      <Text className='demo-pay-section-index'>03 / 退款体验</Text>
      <Text className='demo-pay-section-title'>支付后可申请 1 分退款</Text>
      <Text className='demo-pay-section-copy'>退款由服务端受理，最终结果以通知或查单为准。</Text>
      {refund ? <View className='demo-pay-refund-state'><Text>{refundLabels[refund.status]}</Text><Text>{refund.amountFen} 分</Text></View> : null}
      {order?.status === 'PAID'
        ? <Button className='demo-pay-button demo-pay-refund-button' loading={busy} disabled={busy} onClick={() => void requestRefund()}>申请 1 分退款</Button>
        : <Text className='demo-pay-locked'>支付确认后开放退款操作</Text>}
    </View>

    {message ? <View className='demo-pay-message'><Text>{message}</Text></View> : null}
    <Text className='demo-pay-footer'>风物实验室 · 支付能力演示</Text>
  </View>
}
