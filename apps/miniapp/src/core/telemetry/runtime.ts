import type { TelemetryEvent } from '@template/contracts'
import { apiRequest } from '../api/client'
import { createTelemetry } from './telemetry'

const telemetry = createTelemetry(apiRequest)

export function track(kind: TelemetryEvent['kind'], name: string, page: string, result: TelemetryEvent['result']): void {
  telemetry.track({ kind, name, page, result, occurredAt: new Date().toISOString() })
}
