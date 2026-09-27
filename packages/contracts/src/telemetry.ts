export interface TelemetryEvent {
  kind: 'action' | 'navigation' | 'error'
  name: string
  page: string
  result: 'success' | 'failure' | 'cancelled'
  occurredAt: string
}
