import { createImageUploader } from './upload'

const authorization = { uploadId: 'first', url: 'https://oss.example/upload', fields: { key: 'private/key' }, expiresAt: 'soon' }

function setup() {
  const chooseMedia = jest.fn(async () => ({ tempFiles: [{ tempFilePath: '/tmp/photo.jpg', size: 123 }] }))
  const request = jest.fn(async ({ url }: { url: string }) => url.endsWith('/confirm') ? { id: 'first', contentType: 'image/jpeg', size: 123 } : authorization)
  const uploadFile = jest.fn(async () => ({ statusCode: 200 }))
  return { chooseMedia, request, uploadFile, uploader: createImageUploader({ chooseMedia, request: request as never, uploadFile }) }
}

test('cancelled image selection does not call API', async () => {
  const ctx = setup()
  ctx.chooseMedia.mockRejectedValueOnce({ errMsg: 'chooseMedia:fail cancel' })
  await expect(ctx.uploader.selectAndUploadImage()).resolves.toBeNull()
  expect(ctx.request).not.toHaveBeenCalled()
})

test('oversized local image is rejected before authorization', async () => {
  const ctx = setup()
  await expect(ctx.uploader.uploadImage('/tmp/photo.jpg', 10 * 1024 * 1024 + 1, 'image/jpeg')).rejects.toThrow()
  expect(ctx.request).not.toHaveBeenCalled()
})

test('authorizes, uploads to OSS, and confirms', async () => {
  const ctx = setup()
  await expect(ctx.uploader.selectAndUploadImage()).resolves.toEqual({ id: 'first', contentType: 'image/jpeg', size: 123 })
  expect(ctx.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ url: authorization.url, filePath: '/tmp/photo.jpg', formData: authorization.fields }))
  expect(ctx.request.mock.calls.map(([arg]) => arg.url)).toEqual(['/files/uploads', '/files/uploads/first/confirm'])
})

test('retry after OSS failure obtains a fresh authorization', async () => {
  const ctx = setup()
  ctx.uploadFile.mockRejectedValueOnce(new Error('network'))
  await expect(ctx.uploader.uploadImage('/tmp/photo.jpg', 123, 'image/jpeg')).rejects.toThrow('network')
  await ctx.uploader.uploadImage('/tmp/photo.jpg', 123, 'image/jpeg')
  expect(ctx.request.mock.calls.filter(([arg]) => arg.url === '/files/uploads')).toHaveLength(2)
})
