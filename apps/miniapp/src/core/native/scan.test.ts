import { createScanCapability } from './scan'

test.each([
  ['QR_CODE', 'https://example.com'],
  ['EAN_13', '6901234567890'],
  ['QR_CODE', 'pages/private/index']
])('returns %s content as inert text', async (format, text) => {
  const api = createScanCapability({ scanCode: async () => ({ result: text, scanType: format, rawData: 'ignored' }), canIUse: () => true })
  expect(await api.scanCode()).toEqual({ status: 'ok', value: { text, format } })
})

test('distinguishes cancel and unavailable', async () => {
  const cancelled = createScanCapability({ scanCode: async () => { throw { errMsg: 'scanCode:fail cancel' } }, canIUse: () => true })
  expect(await cancelled.scanCode()).toEqual({ status: 'cancelled' })
  const scanCode = jest.fn()
  const unavailable = createScanCapability({ scanCode, canIUse: () => false })
  expect(await unavailable.scanCode()).toEqual({ status: 'unavailable' })
  expect(scanCode).not.toHaveBeenCalled()
})
