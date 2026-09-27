import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const dockerfile = 'apps/api/Dockerfile'
assert.ok(existsSync(dockerfile), 'API Dockerfile is missing')
const example = readFileSync('apps/api/.env.example', 'utf8')
assert.match(example, /WECHAT_APP_SECRET=replace-with-/)
assert.match(example, /JWT_SECRET=replace-with-/)

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}

const image = 'wechat-template-api:local-test'
docker(['build', '-f', dockerfile, '-t', image, '.'])
const container = docker(['run', '--rm', '-d', '-p', '127.0.0.1::3000', '-e', 'DATABASE_URL=postgresql://template:localdev@host.docker.internal:5433/template', image])
try {
  const mapping = docker(['port', container, '3000/tcp'])
  const port = Number(mapping.match(/:(\d+)$/)?.[1])
  assert.ok(port, `Invalid Docker port mapping: ${mapping}`)
  let healthy = false
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok && (await response.json()).status === 'ok') { healthy = true; break }
    } catch { /* container may still be starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  assert.ok(healthy, 'Container health endpoint did not become ready')
  console.log('API container health check passed')
} finally {
  docker(['stop', container])
}
