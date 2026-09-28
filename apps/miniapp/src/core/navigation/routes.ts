export const PORTAL_PATH = '/pages/portal/index'
export const LOGIN_PATH = '/pages/login/index'
export const PROFILE_PATH = '/pages/profile/index'
export const CAPABILITIES_PATH = '/pages/capabilities/index'
export const DEMO_PAYMENT_PATH = '/pages/demo-payment/index'

export function enabledPages(includeDemo: boolean): string[] {
  return [PORTAL_PATH, LOGIN_PATH, PROFILE_PATH, CAPABILITIES_PATH, ...(includeDemo ? [DEMO_PAYMENT_PATH] : [])].map((path) => path.slice(1))
}
