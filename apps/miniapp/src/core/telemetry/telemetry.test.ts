import { createTelemetry } from './telemetry'

test('telemetry failures do not block actions and retry at most once', async () => {
  const request = jest.fn().mockRejectedValue(new Error('offline'))
  const telemetry = createTelemetry(request as never)
  expect(() => telemetry.track({ kind: 'action', name: 'profile.save', page: '/pages/profile/index', result: 'success', occurredAt: '2026-09-27T00:00:00.000Z' })).not.toThrow()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(request).toHaveBeenCalledTimes(2)
})
