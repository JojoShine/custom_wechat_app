import { classifyNativeError, type NativeOutcome } from './outcome'

type ClipboardDeps = {
  read: () => Promise<{ data: string }>
  write: (text: string) => Promise<unknown>
  canIUse: (api: string) => boolean
}

export function createClipboardCapability(deps: ClipboardDeps) {
  return {
    async readClipboard(): Promise<NativeOutcome<string>> {
      if (!deps.canIUse('getClipboardData')) return { status: 'unavailable' }
      try {
        const result = await deps.read()
        return typeof result.data === 'string' ? { status: 'ok', value: result.data } : { status: 'failed' }
      } catch (error) {
        return { status: classifyNativeError(error) }
      }
    },
    async writeClipboard(text: string): Promise<NativeOutcome<void>> {
      if (!deps.canIUse('setClipboardData')) return { status: 'unavailable' }
      try {
        await deps.write(text)
        return { status: 'ok', value: undefined }
      } catch (error) {
        return { status: classifyNativeError(error) }
      }
    }
  }
}
