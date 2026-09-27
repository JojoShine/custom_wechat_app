import type { UserProfile } from '@template/contracts'

export async function bindPhoneFromEvent(
  detail: { code?: string },
  request: <T>(options: { url: string; method: 'POST'; data: { code: string } }) => Promise<T>
): Promise<UserProfile | null> {
  if (!detail.code) return null
  return request<UserProfile>({ url: '/users/me/phone', method: 'POST', data: { code: detail.code } })
}
