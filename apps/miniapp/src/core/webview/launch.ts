import type { WebviewTicketResult } from '@template/contracts'
import type { GeoPoint } from '../native/location'
import type { NativeOutcome } from '../native/outcome'

export function buildWebviewUrl(entryUrl: string, appId: string, ticket: string, point?: GeoPoint): string {
  const hashAt = entryUrl.indexOf('#')
  const beforeHash = hashAt < 0 ? entryUrl : entryUrl.slice(0, hashAt)
  const fragment = hashAt < 0 ? '' : entryUrl.slice(hashAt)
  const match = /^(https?):\/\/([^/?#]+)/.exec(beforeHash)
  if (!match || match[2].includes('@') || /\s/.test(entryUrl)) throw new Error('Invalid WebView URL')
  const host = match[2].startsWith('[') ? match[2].slice(0, match[2].indexOf(']') + 1) : match[2].split(':')[0]
  if (match[1] === 'http' && !['localhost', '127.0.0.1', '[::1]'].includes(host)) throw new Error('Invalid WebView URL')
  if (/[?&](?:appId|ticket|latitude|longitude|coordinateSystem)=/.test(beforeHash)) throw new Error('Reserved WebView parameter')
  if (!appId || !ticket) throw new Error('Missing WebView launch value')
  const parameters = [`appId=${encodeURIComponent(appId)}`, `ticket=${encodeURIComponent(ticket)}`]
  if (point) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180 || point.coordinateSystem !== 'gcj02') throw new Error('Invalid WebView coordinate')
    parameters.push(`latitude=${point.latitude}`, `longitude=${point.longitude}`, 'coordinateSystem=gcj02')
  }
  const separator = beforeHash.includes('?') ? (/[?&]$/.test(beforeHash) ? '' : '&') : '?'
  return `${beforeHash}${separator}${parameters.join('&')}${fragment}`
}

export function createWebviewLauncher(deps: {
  issueTicket(appId: string): Promise<WebviewTicketResult>
  getCurrentLocation(): Promise<NativeOutcome<GeoPoint>>
}) {
  return {
    async open(appId: string, withLocation: boolean): Promise<string> {
      let point: GeoPoint | undefined
      if (withLocation) {
        try {
          const result = await deps.getCurrentLocation()
          if (result.status === 'ok') point = result.value
        } catch { /* Opening continues without coordinates. */ }
      }
      const { entryUrl, ticket } = await deps.issueTicket(appId)
      return buildWebviewUrl(entryUrl, appId, ticket, point)
    }
  }
}
