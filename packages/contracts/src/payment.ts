export type PaymentStatus = 'CREATING' | 'PENDING' | 'SUCCEEDED' | 'CLOSED' | 'FAILED' | 'UNKNOWN'
export type RefundStatus = 'REQUESTING' | 'PROCESSING' | 'SUCCEEDED' | 'CLOSED' | 'ABNORMAL' | 'UNKNOWN'

export interface PaymentView {
  id: string
  businessType: string
  businessOrderId: string
  amountFen: number
  status: PaymentStatus
  createdAt: string
}

export interface RefundView {
  id: string
  paymentId: string
  amountFen: number
  status: RefundStatus
  createdAt: string
}

export interface PaymentLaunchParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}
