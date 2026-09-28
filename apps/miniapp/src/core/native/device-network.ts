import { classifyNativeError, type NativeOutcome } from './outcome'

export type DeviceSnapshot = {
  platform: string
  windowWidth: number
  windowHeight: number
  safeArea?: { top: number; right: number; bottom: number; left: number }
}

export type NetworkSnapshot = { connected: boolean; type: string }

type Deps = {
  getDeviceInfo: () => unknown
  getWindowInfo: () => unknown
  getNetworkType: () => Promise<unknown>
  onNetworkStatusChange: (callback: (result: unknown) => void) => void
  offNetworkStatusChange: (callback: (result: unknown) => void) => void
}

function network(value: unknown): NetworkSnapshot {
  const result = value as { isConnected?: boolean; networkType?: string } | null
  const raw = result?.networkType
  const type = raw && ['wifi', '2g', '3g', '4g', '5g', 'none', 'unknown'].includes(raw) ? raw : 'unknown'
  return { connected: result?.isConnected ?? type !== 'none', type }
}

export function createDeviceNetworkCapability(deps: Deps) {
  return {
    getDeviceSnapshot(): DeviceSnapshot {
      const device = deps.getDeviceInfo() as { platform?: string }
      const window = deps.getWindowInfo() as { screenWidth?: number; screenHeight?: number; windowWidth?: number; windowHeight?: number; safeArea?: { top: number; right: number; bottom: number; left: number } }
      const width = window.windowWidth ?? 0
      const height = window.windowHeight ?? 0
      return {
        platform: device.platform ?? 'unknown', windowWidth: width, windowHeight: height,
        ...(window.safeArea ? { safeArea: { top: window.safeArea.top, right: (window.screenWidth ?? width) - window.safeArea.right, bottom: (window.screenHeight ?? height) - window.safeArea.bottom, left: window.safeArea.left } } : {})
      }
    },
    async getNetworkSnapshot(): Promise<NativeOutcome<NetworkSnapshot>> {
      try {
        return { status: 'ok', value: network(await deps.getNetworkType()) }
      } catch (error) {
        return { status: classifyNativeError(error) }
      }
    },
    observeNetwork(callback: (snapshot: NetworkSnapshot) => void): () => void {
      let active = true
      const listener = (result: unknown) => { if (active) callback(network(result)) }
      deps.onNetworkStatusChange(listener)
      return () => {
        if (!active) return
        active = false
        deps.offNetworkStatusChange(listener)
      }
    }
  }
}
