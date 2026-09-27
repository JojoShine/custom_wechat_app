import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, GoneException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { FileReadUrl, ReadyFile, UploadAuthorization } from '@template/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { OssProvider, type OssGateway } from './oss.provider.js'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

@Injectable()
export class FilesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient, @Inject(OssProvider) private readonly oss: OssGateway) {}

  async authorize(userId: string, input: { contentType: string; size: number }): Promise<UploadAuthorization> {
    const extension = extensions[input.contentType]
    if (!extension || !Number.isInteger(input.size) || input.size < 1 || input.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Invalid image type or size')
    }
    const objectKey = `users/${userId}/${randomUUID()}.${extension}`
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
    const signed = await this.oss.signUpload({ key: objectKey, contentType: input.contentType, maxBytes: input.size, expiresAt })
    const upload = await this.prisma.uploadIntent.create({
      data: { userId, objectKey, contentType: input.contentType, expectedSize: input.size, expiresAt }
    })
    return { uploadId: upload.id, url: signed.url, fields: signed.fields, expiresAt: expiresAt.toISOString() }
  }

  async confirm(userId: string, uploadId: string): Promise<ReadyFile> {
    const upload = await this.prisma.uploadIntent.findUnique({ where: { id: uploadId } })
    if (!upload || upload.userId !== userId) throw new NotFoundException('File not found')
    const ready = { id: upload.id, contentType: upload.contentType, size: upload.expectedSize }
    if (upload.status === 'READY') return ready
    if (upload.expiresAt <= new Date()) throw new GoneException('Upload authorization expired')

    const object = await this.oss.head(upload.objectKey)
    if (!object || object.size !== upload.expectedSize || object.contentType !== upload.contentType) {
      throw new ConflictException('Uploaded object does not match authorization')
    }
    const changed = await this.prisma.uploadIntent.updateMany({
      where: { id: uploadId, userId, status: 'PENDING', expiresAt: { gt: new Date() } },
      data: { status: 'READY', confirmedAt: new Date() }
    })
    if (changed.count === 1) return ready
    const current = await this.prisma.uploadIntent.findUnique({ where: { id: uploadId } })
    if (current?.status === 'READY') return ready
    if (current?.expiresAt && current.expiresAt <= new Date()) throw new GoneException('Upload authorization expired')
    throw new ConflictException('Upload confirmation conflict')
  }

  async readUrl(userId: string, fileId: string): Promise<FileReadUrl> {
    const file = await this.prisma.uploadIntent.findUnique({ where: { id: fileId } })
    if (!file || file.userId !== userId || file.status !== 'READY') throw new NotFoundException('File not found')
    const url = await this.oss.readUrl(file.objectKey, 300)
    return { url, expiresAt: new Date(Date.now() + 300_000).toISOString() }
  }
}
