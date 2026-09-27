import Taro from '@tarojs/taro'
import { apiRequest } from '../api/client'
import { createImageUploader, imageContentType } from './upload'

const uploader = createImageUploader({
  chooseMedia: () => Taro.chooseMedia({ count: 1, mediaType: ['image'] }),
  uploadFile: (options) => Taro.uploadFile(options),
  request: apiRequest
})

export const uploadImage = uploader.uploadImage
export const selectAndUploadImage = uploader.selectAndUploadImage

export async function uploadAvatar(filePath: string) {
  const [file, image] = await Promise.all([Taro.getFileInfo({ filePath }), Taro.getImageInfo({ src: filePath })])
  const contentType = image.type ? imageContentType(`avatar.${image.type}`) : imageContentType(filePath)
  if (!('size' in file) || typeof file.size !== 'number') throw new Error('无法读取图片大小')
  return uploadImage(filePath, file.size, contentType)
}
