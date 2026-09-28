import { DEMO_PAYMENT_PATH, LOGIN_PATH, PORTAL_PATH, PROFILE_PATH, WEBVIEW_APPS_PATH } from './routes'

const allowedPaths = new Set([PORTAL_PATH, PROFILE_PATH, WEBVIEW_APPS_PATH, ...(process.env.TARO_APP_DEMO_PAYMENTS_ENABLED === 'true' ? [DEMO_PAYMENT_PATH] : [])])

export function safeReturnTarget(value?: string): string {
  if (!value) return PORTAL_PATH
  try {
    const path = decodeURIComponent(value)
    return allowedPaths.has(path) ? path : PORTAL_PATH
  } catch {
    return PORTAL_PATH
  }
}

export function createNavigationGuard(deps: {
  readSession(): Promise<{ accessToken?: string }>
  navigateTo(url: string): Promise<unknown>
}) {
  return {
    async navigateProtected(target: string): Promise<void> {
      const destination = safeReturnTarget(target)
      const session = await deps.readSession()
      if (session.accessToken) {
        await deps.navigateTo(destination)
      } else {
        await deps.navigateTo(`${LOGIN_PATH}?returnTo=${encodeURIComponent(destination)}`)
      }
    }
  }
}
