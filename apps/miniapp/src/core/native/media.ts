import { classifyNativeError, type NativeOutcome } from './outcome'

export type SelectedMedia = { kind: 'image' | 'video'; path: string; sizeBytes?: number }

type MediaDeps = {
  chooseMedia: () => Promise<unknown>
  previewMedia: (items: SelectedMedia[], index: number) => Promise<unknown>
  canIUse: (api: string) => boolean
}

export function createMediaCapability(deps: MediaDeps) {
  return {
    async chooseMedia(): Promise<NativeOutcome<SelectedMedia[]>> {
      if (!deps.canIUse('chooseMedia')) return { status: 'unavailable' }
      try {
        const response = await deps.chooseMedia() as { tempFiles?: Array<Record<string, unknown>> }
        const files = response?.tempFiles
        if (!Array.isArray(files)) return { status: 'failed' }
        if (files.length === 0) return { status: 'cancelled' }
        const items = files.map((file): SelectedMedia | null => {
          if ((file.fileType !== 'image' && file.fileType !== 'video') || typeof file.tempFilePath !== 'string' || !file.tempFilePath) return null
          return { kind: file.fileType, path: file.tempFilePath, ...(typeof file.size === 'number' ? { sizeBytes: file.size } : {}) }
        })
        return items.every((item): item is SelectedMedia => item !== null)
          ? { status: 'ok', value: items }
          : { status: 'failed' }
      } catch (error) {
        return { status: classifyNativeError(error) }
      }
    },
    async previewMedia(items: SelectedMedia[], index: number): Promise<NativeOutcome<void>> {
      if (!Number.isInteger(index) || index < 0 || index >= items.length || items.some((item) => !item.path)) return { status: 'failed' }
      if (!deps.canIUse('previewMedia')) return { status: 'unavailable' }
      try {
        await deps.previewMedia(items, index)
        return { status: 'ok', value: undefined }
      } catch (error) {
        return { status: classifyNativeError(error) }
      }
    }
  }
}
