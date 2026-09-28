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
assert.match(apiExample, /^WECHAT_PAY_MCH_ID=$/m, 'example must leave payment disabled until real merchant credentials are configured')
for (const name of ['JWT_SECRET', 'WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'WECHAT_PAY_MERCHANT_PRIVATE_KEY', 'WECHAT_PAY_API_V3_KEY']) {
  assert.match(apiExample, new RegExp(`^${name}=replace-with-`, 'm'), `${name} must be a placeholder`)
  assert.ok(!miniappExample.includes(name), `${name} must stay server-side`)
}
for (const term of ['私有 Bucket', 'RAM', '上传域名', '下载域名', '手机号能力', '真实联调']) {
  assert.ok(readme.includes(term), `README is missing ${term}`)
}
