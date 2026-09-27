import { randomUUID } from 'node:crypto'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import type { UploadAuthorization } from '@template/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { OssProvider, type OssGateway } from './oss.provider.js'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

@Injectable()
export class FilesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient, private readonly oss: OssProvider & OssGateway) {}

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
}
