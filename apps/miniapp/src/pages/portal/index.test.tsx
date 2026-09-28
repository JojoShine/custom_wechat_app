import { renderToStaticMarkup } from 'react-dom/server'
import Portal from './index'

jest.mock('./index.css', () => ({}))
jest.mock('../../components/native-capabilities/index.css', () => ({}), { virtual: true })
jest.mock('@tarojs/components', () => ({
  Button: ({ openType: _openType, ...props }: { openType?: string }) => jest.requireActual<typeof import('react')>('react').createElement('button', props),
  Input: 'input', Text: 'span', View: 'div'
}))
jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: { getWindowInfo: () => ({ statusBarHeight: 20 }) },
  useShareAppMessage: () => undefined
}))

it('shows native actions directly on the portal and removes placeholder cards', () => {
  const html = renderToStaticMarkup(<Portal />)
  for (const label of ['位置与地图', '扫码', '本地媒体', '剪贴板', '设备与网络', '网页应用']) {
    expect(html).toContain(label)
  }
  expect(html).not.toContain('图片上传')
  expect(html).not.toContain('手机号授权')
  expect(html).not.toContain('能力中心')
})
