import type { TelemetryEvent } from '@template/contracts'

export function createTelemetry(request: <T>(options: { url: string; method: 'POST'; data: TelemetryEvent }) => Promise<T>) {
  return {
    track(event: TelemetryEvent): void {
      void request({ url: '/telemetry/events', method: 'POST', data: event })
        .catch(() => request({ url: '/telemetry/events', method: 'POST', data: event }))
        .catch(() => undefined)
    }
  }
}
