import { portalShare } from './portal'

test('portal share has a fixed safe path and title', () => {
  expect(portalShare()).toEqual({ title: '轻购实验室', path: '/pages/portal/index' })
  expect(portalShare.length).toBe(0)
  expect(JSON.stringify(portalShare())).not.toMatch(/token|phone|Signature|\?/i)
})
