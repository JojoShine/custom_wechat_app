import { BadRequestException } from '@nestjs/common'
import { TelemetryController } from './telemetry.controller.js'

it('accepts only controlled event fields and lengths', () => {
  const log = { info: vi.fn() }
  const controller = new TelemetryController(log as never)
  const event = { kind: 'action', name: 'profile.save', page: '/pages/profile/index', result: 'success', occurredAt: '2026-09-27T00:00:00.000Z' }
  expect(controller.record({ userId: 'user-1' } as never, event)).toEqual({ accepted: true })
  expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ category: 'event', userId: 'user-1', ...event }))
  expect(() => controller.record({ userId: 'user-1' } as never, { ...event, token: 'secret' })).toThrow(BadRequestException)
  expect(() => controller.record({ userId: 'user-1' } as never, { ...event, name: 'x'.repeat(65) })).toThrow(BadRequestException)
  expect(() => controller.record({ userId: 'user-1' } as never, { ...event, page: '/pages/profile/index?phone=13800138000' })).toThrow(BadRequestException)
})
