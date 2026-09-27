import { BadRequestException } from '@nestjs/common'
import { FilesService } from './files.service.js'
import { OssProvider, buildUploadPolicy } from './oss.provider.js'

describe('private image upload authorization', () => {
  const created: Array<{ userId: string; objectKey: string; contentType: string; expectedSize: number }> = []
  const prisma = { uploadIntent: { create: vi.fn(async ({ data }: { data: typeof created[number] }) => {
    created.push(data)
    return { id: `upload-${created.length}`, ...data }
  }) } }
  const oss = { signUpload: vi.fn(async () => ({ url: 'https://private.example.com', fields: { policy: 'signed' } })) }
  const service = new FilesService(prisma as never, oss as never)

  beforeEach(() => { created.length = 0; vi.clearAllMocks() })

  it.each(['image/jpeg', 'image/png', 'image/webp'])('authorizes %s with a unique owner key', async (contentType) => {
    const first = await service.authorize('user-1', { contentType, size: 123 })
    const second = await service.authorize('user-1', { contentType, size: 123 })
    expect(first).toMatchObject({ uploadId: 'upload-1', url: 'https://private.example.com' })
    expect(created[0].objectKey).toMatch(/^users\/user-1\/[a-f0-9-]+\.(jpg|png|webp)$/)
    expect(created[0].objectKey).not.toBe(created[1].objectKey)
    expect(oss.signUpload).toHaveBeenCalledWith(expect.objectContaining({ key: created[0].objectKey, contentType, maxBytes: 123 }))
  })

  it.each([{ contentType: 'image/png', size: 0 }, { contentType: 'image/png', size: 10 * 1024 * 1024 + 1 }, { contentType: 'image/svg+xml', size: 100 }])
  ('rejects invalid content type or size', async (input) => {
    await expect(service.authorize('user-1', input)).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.uploadIntent.create).not.toHaveBeenCalled()
  })

  it('locks policy to exact key, type, size, bucket and status', () => {
    const policy = buildUploadPolicy({
      bucket: 'private-bucket', credential: 'ak/date/region/oss/aliyun_v4_request',
      date: '20260927T100000Z', key: 'users/u/file.jpg', contentType: 'image/jpeg', maxBytes: 123,
      expiresAt: new Date('2026-09-27T10:10:00Z')
    })
    expect(policy.expiration).toBe('2026-09-27T10:10:00.000Z')
    expect(policy.conditions).toEqual(expect.arrayContaining([
      { bucket: 'private-bucket' }, ['eq', '$key', 'users/u/file.jpg'],
      ['eq', '$content-type', 'image/jpeg'], ['content-length-range', 1, 123],
      ['eq', '$success_action_status', '200']
    ]))
  })

  it('signs a V4 form without returning the secret', async () => {
    const values = {
      OSS_REGION: 'cn-hangzhou', OSS_BUCKET: 'private-bucket',
      OSS_ENDPOINT: 'https://private-bucket.oss-cn-hangzhou.aliyuncs.com',
      OSS_ACCESS_KEY_ID: 'test-access-key', OSS_ACCESS_KEY_SECRET: 'test-secret'
    }
    const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
    Object.assign(process.env, values)
    try {
      const signed = await new OssProvider().signUpload({
        key: 'users/u/file.jpg', contentType: 'image/jpeg', maxBytes: 123,
        expiresAt: new Date(Date.now() + 60_000)
      })
      const policy = JSON.parse(Buffer.from(signed.fields.policy, 'base64').toString())
      expect(policy.conditions).toContainEqual(['eq', '$key', 'users/u/file.jpg'])
      expect(signed.fields['x-oss-signature']).toMatch(/^[a-f0-9]{64}$/)
      expect(JSON.stringify(signed)).not.toContain('test-secret')
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
