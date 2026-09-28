import Taro from '@tarojs/taro'
import { createLocationCapability } from './location'
import { createScanCapability } from './scan'
import { createMediaCapability } from './media'
import { createClipboardCapability } from './clipboard'
import { createDeviceNetworkCapability } from './device-network'

const canIUse = (api: string) => Taro.canIUse(api)

export const locationCapability = createLocationCapability({
  getLocation: () => Taro.getLocation({ type: 'gcj02' }),
  chooseLocation: () => Taro.chooseLocation({}),
  openLocation: ({ latitude, longitude, name, address }) => Taro.openLocation({ latitude, longitude, name, address }),
  canIUse
})

export const scanCapability = createScanCapability({
  scanCode: () => Taro.scanCode({ scanType: ['qrCode', 'barCode'] }),
  canIUse
})

export const mediaCapability = createMediaCapability({
  chooseMedia: () => Taro.chooseMedia({ count: 1, mediaType: ['image', 'video'] }),
  previewMedia: (items, index) => Taro.previewMedia({ sources: items.map(({ path, kind }) => ({ url: path, type: kind })), current: index }),
  canIUse
})

export const clipboardCapability = createClipboardCapability({
  read: () => Taro.getClipboardData(),
  write: (data) => Taro.setClipboardData({ data }),
  canIUse
})

export const deviceNetworkCapability = createDeviceNetworkCapability({
  getDeviceInfo: () => Taro.getDeviceInfo(),
  getWindowInfo: () => Taro.getWindowInfo(),
  getNetworkType: () => Taro.getNetworkType(),
  onNetworkStatusChange: (callback) => Taro.onNetworkStatusChange(callback),
  offNetworkStatusChange: (callback) => Taro.offNetworkStatusChange(callback)
})
