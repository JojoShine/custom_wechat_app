import { createLocationCapability } from './location'

const point = { latitude: 30.25, longitude: 120.17, coordinateSystem: 'gcj02' as const }

function capability(overrides: Record<string, unknown> = {}) {
  const deps = {
    getLocation: jest.fn().mockResolvedValue({ latitude: 30.25, longitude: 120.17, accuracy: 12 }),
    chooseLocation: jest.fn().mockResolvedValue({ latitude: 30.25, longitude: 120.17, name: '西湖', address: '杭州' }),
    openLocation: jest.fn().mockResolvedValue({}),
    canIUse: jest.fn().mockReturnValue(true),
    ...overrides
  }
  return { api: createLocationCapability(deps), deps }
}

test('gets one GCJ-02 location with accuracy', async () => {
  expect(await capability().api.getCurrentLocation()).toEqual({ status: 'ok', value: { ...point, accuracyMeters: 12 } })
})

test('converts map picker coordinates and keeps labels', async () => {
  const { api } = capability({ chooseLocation: async () => ({ latitude: '30.25', longitude: '120.17', name: '西湖', address: '杭州' }) })
  expect(await api.chooseLocation()).toEqual({ status: 'ok', value: { ...point, name: '西湖', address: '杭州' } })
})

test('reports picker cancellation and authorization denial', async () => {
  expect(await capability({ chooseLocation: async () => { throw { errMsg: 'chooseLocation:fail cancel' } } }).api.chooseLocation()).toEqual({ status: 'cancelled' })
  expect(await capability({ getLocation: async () => { throw { errMsg: 'getLocation:fail auth deny' } } }).api.getCurrentLocation()).toEqual({ status: 'denied' })
})

test.each([{ latitude: NaN, longitude: 120 }, { latitude: 91, longitude: 120 }, { latitude: 30, longitude: -181 }])('does not open invalid coordinates', async (invalid) => {
  const { api, deps } = capability()
  expect(await api.openLocation({ ...point, ...invalid })).toEqual({ status: 'failed' })
  expect(deps.openLocation).not.toHaveBeenCalled()
})

test('returns unavailable without invoking location API', async () => {
  const { api, deps } = capability({ canIUse: () => false })
  expect(await api.getCurrentLocation()).toEqual({ status: 'unavailable' })
  expect(deps.getLocation).not.toHaveBeenCalled()
})
