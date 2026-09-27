const PORTAL = '/pages/portal/index'
const allowedPaths = new Set([PORTAL, '/pages/profile/index'])

export function safeReturnTarget(value?: string): string {
  if (!value) return PORTAL
  try {
    const path = decodeURIComponent(value)
    return allowedPaths.has(path) ? path : PORTAL
  } catch {
    return PORTAL
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
        await deps.navigateTo(`/pages/login/index?returnTo=${encodeURIComponent(destination)}`)
      }
    }
  }
}
