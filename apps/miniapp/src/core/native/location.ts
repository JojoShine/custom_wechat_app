import { classifyNativeError, type NativeOutcome } from './outcome'

export interface GeoPoint {
  latitude: number
  longitude: number
  coordinateSystem: 'gcj02'
  accuracyMeters?: number
  name?: string
  address?: string
}

type LocationDeps = {
  getLocation: () => Promise<unknown>
  chooseLocation: () => Promise<unknown>
  openLocation: (point: GeoPoint) => Promise<unknown>
  canIUse: (api: string) => boolean
}

function valid(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
}

function parsePoint(value: unknown): GeoPoint | null {
  if (typeof value !== 'object' || value === null) return null
  const source = value as Record<string, unknown>
  if ((typeof source.latitude !== 'number' && (typeof source.latitude !== 'string' || source.latitude.trim() === '')) ||
      (typeof source.longitude !== 'number' && (typeof source.longitude !== 'string' || source.longitude.trim() === ''))) return null
  const latitude = Number(source.latitude)
  const longitude = Number(source.longitude)
  if (!valid(latitude, longitude)) return null
  const point: GeoPoint = { latitude, longitude, coordinateSystem: 'gcj02' }
  if (typeof source.accuracy === 'number' && Number.isFinite(source.accuracy)) point.accuracyMeters = source.accuracy
  if (typeof source.name === 'string') point.name = source.name
  if (typeof source.address === 'string') point.address = source.address
  return point
}

export function createLocationCapability(deps: LocationDeps) {
  async function invoke(api: 'getLocation' | 'chooseLocation', call: () => Promise<unknown>): Promise<NativeOutcome<GeoPoint>> {
    if (!deps.canIUse(api)) return { status: 'unavailable' }
    try {
      const point = parsePoint(await call())
      return point ? { status: 'ok', value: point } : { status: 'failed' }
    } catch (error) {
      return { status: classifyNativeError(error) }
    }
  }

  return {
    getCurrentLocation: () => invoke('getLocation', deps.getLocation),
    chooseLocation: () => invoke('chooseLocation', deps.chooseLocation),
    async openLocation(point: GeoPoint): Promise<NativeOutcome<void>> {
      if (!valid(point.latitude, point.longitude)) return { status: 'failed' }
      if (!deps.canIUse('openLocation')) return { status: 'unavailable' }
      try {
        await deps.openLocation(point)
        return { status: 'ok', value: undefined }
      } catch (error) {
        return { status: classifyNativeError(error) }
      }
    }
  }
}
