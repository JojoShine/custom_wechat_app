import { createClipboardCapability } from './clipboard'

test.each(['', '中文内容'])('reads clipboard text including %s', async (data) => {
  const api = createClipboardCapability({ read: async () => ({ data }), write: async () => ({}), canIUse: () => true })
  expect(await api.readClipboard()).toEqual({ status: 'ok', value: data })
})

test('writes only caller-provided text', async () => {
  const write = jest.fn().mockResolvedValue({})
  const api = createClipboardCapability({ read: async () => ({ data: '' }), write, canIUse: () => true })
  expect(await api.writeClipboard('轻购实验室')).toEqual({ status: 'ok', value: undefined })
  expect(write).toHaveBeenCalledWith('轻购实验室')
})

test('classifies cancellation, denial, unavailable and failure', async () => {
  const make = (error: unknown, canIUse = true) => createClipboardCapability({ read: async () => { throw error }, write: async () => { throw error }, canIUse: () => canIUse })
  expect(await make({ errMsg: 'getClipboardData:fail cancel' }).readClipboard()).toEqual({ status: 'cancelled' })
  expect(await make({ errMsg: 'getClipboardData:fail auth deny' }).readClipboard()).toEqual({ status: 'denied' })
  expect(await make({ errMsg: 'unexpected' }).writeClipboard('x')).toEqual({ status: 'failed' })
  expect(await make({}, false).readClipboard()).toEqual({ status: 'unavailable' })
})
