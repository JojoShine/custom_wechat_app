import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

for (const app of ['miniapp', 'api']) {
  const requireFromApp = createRequire(resolve(`apps/${app}/package.json`))
  const packageJson = requireFromApp('@template/contracts/package.json')
  assert.equal(packageJson.name, '@template/contracts')
}

console.log('Both applications resolve @template/contracts')

const apiExample = readFileSync('apps/api/.env.example', 'utf8')
const miniappExample = readFileSync('apps/miniapp/.env.example', 'utf8')
const readme = readFileSync('README.md', 'utf8')
for (const name of ['WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET']) {
  assert.match(apiExample, new RegExp(`^${name}=replace-with-`, 'm'), `${name} must be a placeholder`)
  assert.ok(!miniappExample.includes(name), `${name} must stay server-side`)
}
for (const term of ['私有 Bucket', 'RAM', '上传域名', '下载域名', '手机号能力', '真实联调']) {
  assert.ok(readme.includes(term), `README is missing ${term}`)
}
