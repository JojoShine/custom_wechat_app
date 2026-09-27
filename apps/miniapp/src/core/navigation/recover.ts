import { safeReturnTarget } from './guard'

export async function recoverProtectedError(
  error: unknown,
  target: string,
  redirectTo: (url: string) => Promise<unknown>
): Promise<boolean> {
  if (!(error instanceof Error) || error.message !== 'AUTH_REQUIRED') return false
  await redirectTo(`/pages/login/index?returnTo=${encodeURIComponent(safeReturnTarget(target))}`)
  return true
}
