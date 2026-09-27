import { describe, expect, test } from 'vitest'
import { TradeBillParser } from './trade-bill.parser.js'

const headers = '交易时间,公众账号ID,商户号,特约商户号,设备号,微信订单号,商户订单号,用户标识,交易类型,交易状态,付款银行,货币种类,应结订单金额,代金券金额,微信退款单号,商户退款单号,退款金额,充值券退款金额,退款类型,退款状态,商品名称,商户数据包,手续费,费率,订单金额,申请退款金额,费率备注'

function line(changes: Record<string, string>): string {
  const values: Record<string, string> = {
    交易时间: '2026-09-27 10:00:00', 公众账号ID: 'wx-app', 商户号: 'mch-1', 特约商户号: '0',
    设备号: '', 微信订单号: 'wx-trade', 商户订单号: 'P123', 用户标识: 'openid', 交易类型: 'JSAPI',
    交易状态: 'SUCCESS', 付款银行: 'OTHERS', 货币种类: 'CNY', 应结订单金额: '0.10', 代金券金额: '0.00',
    微信退款单号: '0', 商户退款单号: '0', 退款金额: '0.00', 充值券退款金额: '0.00',
    退款类型: '', 退款状态: '', 商品名称: 'Demo', 商户数据包: '', 手续费: '0.00',
    费率: '0.60%', 订单金额: '0.10', 申请退款金额: '0.00', 费率备注: '', ...changes
  }
  return headers.split(',').map((header) => `\`${values[header]}`).join(',')
}
export const paymentBillRow = line({})
export const refundBillRow = line({ 交易状态: 'REFUND', 商户退款单号: 'R123', 微信退款单号: 'wx-refund',
  应结订单金额: '0.00', 订单金额: '0.00', 退款金额: '0.06', 申请退款金额: '0.06', 退款状态: 'PROCESSING' })
export const bill = (rows: string[]) => Buffer.from(`${headers}\n${rows.join('\n')}\n总交易单数,应结订单总金额,退款总金额,充值券退款总金额,手续费总金额,订单总金额,申请退款总金额\n\`${rows.length},\`0.10,\`0.06,\`0.00,\`0.00,\`0.10,\`0.06\n`)

describe('TradeBillParser', () => {
  const parser = new TradeBillParser()
  test('parses only official ALL details with exact integer fen', () => {
    expect(parser.parse(bill([paymentBillRow, refundBillRow]))).toEqual([
      { kind: 'PAYMENT', appId: 'wx-app', mchId: 'mch-1', outTradeNo: 'P123', outRefundNo: null, amountFen: 10, tradeTime: '2026-09-27 10:00:00' },
      { kind: 'REFUND', appId: 'wx-app', mchId: 'mch-1', outTradeNo: 'P123', outRefundNo: 'R123', amountFen: 6, tradeTime: '2026-09-27 10:00:00' }
    ])
  })

  test('rejectsMalformedFenConversion', () => {
    for (const malformed of ['0.001', 'NaN', '1e3', '-0.10', '999999999999999.99']) {
      expect(() => parser.parse(bill([line({ 订单金额: malformed })]))).toThrow()
    }
  })

  test('rejects truncated, duplicate and unknown-state details', () => {
    expect(() => parser.parse(Buffer.from('bad header\n' + paymentBillRow))).toThrow()
    expect(() => parser.parse(bill([paymentBillRow, paymentBillRow]))).toThrow()
    expect(() => parser.parse(bill([line({ 交易状态: 'REVOKED' })]))).toThrow()
    expect(() => parser.parse(Buffer.from(`${headers}\n${paymentBillRow}\n`))).toThrow()
    expect(() => parser.parse(Buffer.from(bill([paymentBillRow]).toString().replace('`1,`0.10', '`2,`0.10')))).toThrow()
  })
})
