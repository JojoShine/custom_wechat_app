export interface WebviewAppConfig {
  appId: string
  name: string
  entryUrl: string
  origin: string
}

export const WEBVIEW_APPS = Symbol('WEBVIEW_APPS')

export function loadWebviewApps(env: NodeJS.ProcessEnv): WebviewAppConfig[] {
  if (!env.WEBVIEW_APPS_JSON?.trim()) return []
  const parsed: unknown = JSON.parse(env.WEBVIEW_APPS_JSON)
  if (!Array.isArray(parsed)) throw new Error('WEBVIEW_APPS_JSON must be an array')
  const seen = new Set<string>()
  return parsed.map((value): WebviewAppConfig => {
    if (!value || typeof value !== 'object') throw new Error('Invalid WebView app')
    const app = value as Record<string, unknown>
    if (typeof app.appId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(app.appId) || seen.has(app.appId)) throw new Error('Invalid or duplicate WebView appId')
    if (typeof app.name !== 'string' || !app.name.trim() || app.name.length > 80) throw new Error('Invalid WebView app name')
    if (typeof app.entryUrl !== 'string' || typeof app.origin !== 'string') throw new Error('Invalid WebView app URL')
    let url: URL
    try { url = new URL(app.entryUrl) } catch { throw new Error('Invalid WebView app URL') }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.origin !== app.origin) {
      throw new Error('Invalid WebView app origin')
    }
    seen.add(app.appId)
    return { appId: app.appId, name: app.name, entryUrl: url.href, origin: app.origin }
  })
}
