import { createDeviceNetworkCapability } from './device-network'

function capability(overrides: Record<string, unknown> = {}) {
  const deps = {
    getDeviceInfo: () => ({ platform: 'devtools', deviceId: 'secret' }),
    getWindowInfo: () => ({ screenWidth: 375, screenHeight: 800, windowWidth: 375, windowHeight: 800, safeArea: { top: 30, right: 375, bottom: 780, left: 0 } }),
    getNetworkType: async () => ({ networkType: 'wifi' }),
    onNetworkStatusChange: jest.fn(),
    offNetworkStatusChange: jest.fn(),
    ...overrides
  }
  return { api: createDeviceNetworkCapability(deps), deps }
}

test('returns a non-identifying device snapshot', () => {
  expect(capability().api.getDeviceSnapshot()).toEqual({ platform: 'devtools', windowWidth: 375, windowHeight: 800, safeArea: { top: 30, right: 0, bottom: 20, left: 0 } })
})

test('calculates safe-area insets from screen dimensions when window is shorter', () => {
  const { api } = capability({ getWindowInfo: () => ({ screenWidth: 375, screenHeight: 812, windowWidth: 375, windowHeight: 724, safeArea: { top: 44, right: 375, bottom: 778, left: 0 } }) })
  expect(api.getDeviceSnapshot().safeArea).toEqual({ top: 44, right: 0, bottom: 34, left: 0 })
})

test.each([['none', false, 'none'], ['wifi', true, 'wifi'], ['satellite', true, 'unknown']])('normalizes network %s', async (networkType, connected, type) => {
  const { api } = capability({ getNetworkType: async () => ({ networkType }) })
  expect(await api.getNetworkSnapshot()).toEqual({ status: 'ok', value: { connected, type } })
})

test('removes only its own listener and stops callbacks after cleanup', () => {
  const { api, deps } = capability()
  const first = jest.fn()
  const second = jest.fn()
  const stopFirst = api.observeNetwork(first)
  api.observeNetwork(second)
  const firstListener = deps.onNetworkStatusChange.mock.calls[0][0]
  const secondListener = deps.onNetworkStatusChange.mock.calls[1][0]
  stopFirst()
  firstListener({ isConnected: false, networkType: 'none' })
  secondListener({ isConnected: true, networkType: '4g' })
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledWith({ connected: true, type: '4g' })
  expect(deps.offNetworkStatusChange).toHaveBeenCalledWith(firstListener)
  expect(deps.offNetworkStatusChange).not.toHaveBeenCalledWith(secondListener)
})
