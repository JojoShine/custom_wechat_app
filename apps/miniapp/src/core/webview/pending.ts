let pending: { appId: string; url: string } | null = null

export function setPendingWebview(appId: string, url: string): void {
  pending = { appId, url }
}

export function takePendingWebview(appId: string): string | null {
  const current = pending
  pending = null
  return current?.appId === appId ? current.url : null
}
