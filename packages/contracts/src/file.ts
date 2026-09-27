export interface UploadAuthorization {
  uploadId: string
  url: string
  fields: Record<string, string>
  expiresAt: string
}

export interface ReadyFile {
  id: string
  contentType: string
  size: number
}

export interface FileReadUrl {
  url: string
  expiresAt: string
}
