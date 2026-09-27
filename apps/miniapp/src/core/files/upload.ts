import type { ReadyFile, UploadAuthorization } from '@template/contracts'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

type Request = <T>(options: { url: string; method: 'POST'; data?: unknown }) => Promise<T>
type UploadResult = { statusCode: number }
type Dependencies = {
  chooseMedia: () => Promise<{ tempFiles: Array<{ tempFilePath: string; size: number }> }>
  uploadFile: (options: { url: string; filePath: string; name: string; formData: Record<string, string> }) => Promise<UploadResult>
  request: Request
}

export function imageContentType(path: string): string {
  const ext = path.split('?')[0].split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  throw new Error('不支持的图片格式')
}

export function createImageUploader(deps: Dependencies) {
  async function uploadImage(filePath: string, size: number, contentType: string): Promise<ReadyFile> {
      if (!filePath || !imageTypes.has(contentType) || !Number.isInteger(size) || size < 1 || size > MAX_IMAGE_BYTES) throw new Error('图片格式或大小无效')
      const authorization = await deps.request<UploadAuthorization>({ url: '/files/uploads', method: 'POST', data: { contentType, size } })
      const uploaded = await deps.uploadFile({ url: authorization.url, filePath, name: 'file', formData: authorization.fields })
      if (uploaded.statusCode < 200 || uploaded.statusCode >= 300) throw new Error('图片上传失败')
      return deps.request<ReadyFile>({ url: `/files/uploads/${authorization.uploadId}/confirm`, method: 'POST' })
  }
  async function selectAndUploadImage(): Promise<ReadyFile | null> {
      let chosen: Awaited<ReturnType<Dependencies['chooseMedia']>>
      try { chosen = await deps.chooseMedia() } catch (error) {
        if (typeof error === 'object' && error !== null && 'errMsg' in error && String(error.errMsg).toLowerCase().includes('cancel')) return null
        throw error
      }
      const file = chosen.tempFiles[0]
      if (!file) return null
      return uploadImage(file.tempFilePath, file.size, imageContentType(file.tempFilePath))
  }
  return { uploadImage, selectAndUploadImage }
}
