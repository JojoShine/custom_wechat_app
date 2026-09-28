export type NativeFailure = 'cancelled' | 'denied' | 'unavailable' | 'failed'

export type NativeOutcome<T> = { status: 'ok'; value: T } | { status: NativeFailure }

export function classifyNativeError(error: unknown): 'cancelled' | 'denied' | 'failed' {
  const message = typeof error === 'object' && error !== null && 'errMsg' in error
    ? String(error.errMsg).toLowerCase()
    : ''
  if (message.includes('cancel')) return 'cancelled'
  if (message.includes('auth deny') || message.includes('authorize no response')) return 'denied'
  return 'failed'
}
