const ALL_COLUMNS = '交易时间,公众账号ID,商户号,特约商户号,设备号,微信订单号,商户订单号,用户标识,交易类型,交易状态,付款银行,货币种类,应结订单金额,代金券金额,微信退款单号,商户退款单号,退款金额,充值券退款金额,退款类型,退款状态,商品名称,商户数据包,手续费,费率,订单金额,申请退款金额,费率备注'.split(',')
const SUMMARY_COLUMNS = '总交易单数,应结订单总金额,退款总金额,充值券退款总金额,手续费总金额,订单总金额,申请退款总金额'

export type BillRow = {
  kind: 'PAYMENT' | 'REFUND'
  appId: string
  mchId: string
  outTradeNo: string
  outRefundNo: string | null
  amountFen: number
  tradeTime: string
}

function fen(value: string): number {
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(value)) throw new Error('Invalid bill amount')
  const [yuan, cents] = value.split('.')
  const total = Number(yuan) * 100 + Number(cents)
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Invalid bill amount')
  return total
}

export class TradeBillParser {
  parse(raw: Buffer): BillRow[] {
    const lines = raw.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.length > 0)
    if (lines.shift() !== ALL_COLUMNS.join(',')) throw new Error('Unsupported WeChat Pay ALL bill header')
    const summaryAt = lines.indexOf(SUMMARY_COLUMNS)
    if (summaryAt < 0 || lines.length !== summaryAt + 2) throw new Error('Missing WeChat Pay bill summary')
    const summary = lines[summaryAt + 1].split(',').map((value) => value.startsWith('`') ? value.slice(1) : value)
    if (summary.length !== 7 || !/^\d+$/.test(summary[0]) || Number(summary[0]) !== summaryAt) {
      throw new Error('WeChat Pay bill detail count mismatch')
    }
    const rows: BillRow[] = []
    const seen = new Set<string>()
    for (const line of lines.slice(0, summaryAt)) {
      const values = line.split(',').map((value) => value.startsWith('`') ? value.slice(1) : value)
      if (values.length !== ALL_COLUMNS.length) throw new Error('Malformed WeChat Pay bill row')
      const data = Object.fromEntries(ALL_COLUMNS.map((key, index) => [key, values[index]]))
      const kind = data.交易状态 === 'SUCCESS' ? 'PAYMENT' : data.交易状态 === 'REFUND' ? 'REFUND' : null
      if (!kind || data.交易类型 !== 'JSAPI' || data.货币种类 !== 'CNY' || !data.商户订单号 ||
        !data.商户号 || !data.公众账号ID || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data.交易时间)) {
        throw new Error('Unsupported WeChat Pay bill detail')
      }
      const outRefundNo = kind === 'REFUND' ? data.商户退款单号 : null
      if (kind === 'REFUND' && (!outRefundNo || outRefundNo === '0')) throw new Error('Missing merchant refund number')
      const amountFen = fen(kind === 'REFUND' ? data.申请退款金额 : data.订单金额)
      const key = `${kind}:${outRefundNo ?? data.商户订单号}`
      if (seen.has(key)) throw new Error('Duplicate WeChat Pay bill detail')
      seen.add(key)
      rows.push({ kind, appId: data.公众账号ID, mchId: data.商户号,
        outTradeNo: data.商户订单号, outRefundNo, amountFen, tradeTime: data.交易时间 })
    }
    return rows
  }
}
