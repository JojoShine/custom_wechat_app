import { classifyNativeError } from './outcome'

test.each([
  [{ errMsg: 'chooseLocation:fail cancel' }, 'cancelled'],
  [{ errMsg: 'getLocation:fail auth deny' }, 'denied'],
  [{ errMsg: 'getLocation:fail authorize no response' }, 'denied'],
  [{ errMsg: 'unexpected details' }, 'failed']
] as const)('classifies native error without exposing its message', (error, status) => {
  expect(classifyNativeError(error)).toBe(status)
})
