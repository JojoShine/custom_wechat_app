import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

for (const app of ['miniapp', 'api']) {
  const requireFromApp = createRequire(resolve(`apps/${app}/package.json`))
  const packageJson = requireFromApp('@template/contracts/package.json')
  assert.equal(packageJson.name, '@template/contracts')
}

console.log('Both applications resolve @template/contracts')
