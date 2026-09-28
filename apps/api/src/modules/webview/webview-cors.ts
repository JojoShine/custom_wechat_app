import type { WebviewAppConfig } from './webview.config.js'

export function webviewCorsOptions(apps: readonly WebviewAppConfig[]) {
  return { origin: apps.map((app) => app.origin) }
}
