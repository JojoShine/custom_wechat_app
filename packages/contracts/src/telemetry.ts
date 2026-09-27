export interface TelemetryEvent {
  kind: 'event' | 'error'
  name: string
  page: string
  result: 'success' | 'failure' | 'cancelled'
  occurredAt: string
}
