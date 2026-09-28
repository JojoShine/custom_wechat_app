import { classifyNativeError, type NativeOutcome } from './outcome'

type ScanDeps = { scanCode: () => Promise<unknown>; canIUse: (api: string) => boolean }

export function createScanCapability(deps: ScanDeps) {
  return {
    async scanCode(): Promise<NativeOutcome<{ text: string; format: string }>> {
      if (!deps.canIUse('scanCode')) return { status: 'unavailable' }
      try {
        const result = await deps.scanCode()
        if (typeof result !== 'object' || result === null) return { status: 'failed' }
        const { result: text, scanType: format } = result as Record<string, unknown>
        return typeof text === 'string' && typeof format === 'string'
          ? { status: 'ok', value: { text, format } }
          : { status: 'failed' }
      } catch (error) {
        return { status: classifyNativeError(error) }
      }
    }
  }
}
