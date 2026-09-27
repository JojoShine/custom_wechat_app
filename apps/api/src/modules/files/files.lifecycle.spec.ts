import { NotFoundException, GoneException, ConflictException } from '@nestjs/common'
import { FilesService } from './files.service.js'

describe('file confirmation and private read', () => {
  const record = {
    id: 'upload-1', userId: 'owner', objectKey: 'users/owner/file.jpg',
    contentType: 'image/jpeg', expectedSize: 123, expiresAt: new Date(Date.now() + 60_000),
    status: 'PENDING', confirmedAt: null as Date | null
  }
  const prisma = { uploadIntent: {
    findUnique: vi.fn(async () => ({ ...record })),
    updateMany: vi.fn(async ({ where, data }: { where: { status: string }; data: { status: string; confirmedAt?: Date } }) => {
      if (record.status !== where.status || record.expiresAt <= new Date()) return { count: 0 }
      record.status = data.status
      record.confirmedAt = data.confirmedAt ?? null
      return { count: 1 }
    })
  } }
  const oss = { head: vi.fn(async () => ({ size: 123, contentType: 'image/jpeg' })), readUrl: vi.fn(async () => 'https://private.example.com/signed') }
  const service = new FilesService(prisma as never, oss as never)

  beforeEach(() => {
    record.status = 'PENDING'
    record.confirmedAt = null
    record.expiresAt = new Date(Date.now() + 60_000)
    vi.clearAllMocks()
  })

  it('does not confirm another user or expired intent', async () => {
    await expect(service.confirm('stranger', 'upload-1')).rejects.toBeInstanceOf(NotFoundException)
    record.expiresAt = new Date(0)
    await expect(service.confirm('owner', 'upload-1')).rejects.toBeInstanceOf(GoneException)
    expect(oss.head).not.toHaveBeenCalled()
  })

  it('makes a missing OSS object a terminal failure', async () => {
    oss.head.mockResolvedValueOnce(null as never)
    await expect(service.confirm('owner', 'upload-1')).rejects.toBeInstanceOf(ConflictException)
    expect(record.status).toBe('FAILED')
    await expect(service.confirm('owner', 'upload-1')).rejects.toBeInstanceOf(ConflictException)
    expect(oss.head).toHaveBeenCalledTimes(1)
  })

  it('makes mismatched OSS metadata a terminal failure', async () => {
    oss.head.mockResolvedValueOnce({ size: 122, contentType: 'image/jpeg' })
    await expect(service.confirm('owner', 'upload-1')).rejects.toBeInstanceOf(ConflictException)
    expect(record.status).toBe('FAILED')
    await expect(service.confirm('owner', 'upload-1')).rejects.toBeInstanceOf(ConflictException)
  })

  it('confirms once and repeats idempotently', async () => {
    const first = await service.confirm('owner', 'upload-1')
    const second = await service.confirm('owner', 'upload-1')
    expect(first).toEqual({ id: 'upload-1', contentType: 'image/jpeg', size: 123 })
    expect(second).toEqual(first)
    expect(prisma.uploadIntent.updateMany).toHaveBeenCalledTimes(1)
    expect(oss.head).toHaveBeenCalledTimes(1)
  })

  it('only signs a ready file for its owner', async () => {
    await expect(service.readUrl('owner', 'upload-1')).rejects.toBeInstanceOf(NotFoundException)
    record.status = 'READY'
    await expect(service.readUrl('stranger', 'upload-1')).rejects.toBeInstanceOf(NotFoundException)
    const result = await service.readUrl('owner', 'upload-1')
    expect(result.url).toBe('https://private.example.com/signed')
    expect(oss.readUrl).toHaveBeenCalledWith(record.objectKey, 300)
  })
})
