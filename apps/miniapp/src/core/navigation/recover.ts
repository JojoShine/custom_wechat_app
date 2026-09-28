import { safeReturnTarget } from './guard'
import { LOGIN_PATH } from './routes'

export async function recoverProtectedError(
  error: unknown,
  target: string,
  redirectTo: (url: string) => Promise<unknown>
): Promise<boolean> {
  if (!(error instanceof Error) || error.message !== 'AUTH_REQUIRED') return false
  await redirectTo(`${LOGIN_PATH}?returnTo=${encodeURIComponent(safeReturnTarget(target))}`)
  return true
}
