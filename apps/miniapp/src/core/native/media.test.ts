import { createMediaCapability, type SelectedMedia } from './media'

const items: SelectedMedia[] = [{ kind: 'image', path: 'wxfile://image.jpg', sizeBytes: 42 }]

test('maps image and video selection without uploading', async () => {
  const api = createMediaCapability({ chooseMedia: async () => ({ tempFiles: [{ fileType: 'image', tempFilePath: 'wxfile://image.jpg', size: 42 }, { fileType: 'video', tempFilePath: 'wxfile://video.mp4', size: 80 }] }), previewMedia: async () => ({}), canIUse: () => true })
  expect(await api.chooseMedia()).toEqual({ status: 'ok', value: [...items, { kind: 'video', path: 'wxfile://video.mp4', sizeBytes: 80 }] })
})

test('empty selection is cancelled', async () => {
  const api = createMediaCapability({ chooseMedia: async () => ({ tempFiles: [] }), previewMedia: async () => ({}), canIUse: () => true })
  expect(await api.chooseMedia()).toEqual({ status: 'cancelled' })
})

test('rejects invalid preview index and path before calling platform', async () => {
  const previewMedia = jest.fn()
  const api = createMediaCapability({ chooseMedia: async () => ({}), previewMedia, canIUse: () => true })
  expect(await api.previewMedia(items, 2)).toEqual({ status: 'failed' })
  expect(await api.previewMedia([{ kind: 'image', path: '' }], 0)).toEqual({ status: 'failed' })
  expect(previewMedia).not.toHaveBeenCalled()
})

test('distinguishes preview cancel and unavailable', async () => {
  const cancelled = createMediaCapability({ chooseMedia: async () => ({}), previewMedia: async () => { throw { errMsg: 'previewMedia:fail cancel' } }, canIUse: () => true })
  expect(await cancelled.previewMedia(items, 0)).toEqual({ status: 'cancelled' })
  const unavailable = createMediaCapability({ chooseMedia: async () => ({}), previewMedia: async () => ({}), canIUse: () => false })
  expect(await unavailable.previewMedia(items, 0)).toEqual({ status: 'unavailable' })
})
