import { defineConfig } from '@tarojs/cli'

export default defineConfig({
  projectName: 'wechat-miniapp-template',
  date: '2026-09-27',
  designWidth: 750,
  deviceRatio: { 750: 1 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  mini: {},
  h5: {}
})
