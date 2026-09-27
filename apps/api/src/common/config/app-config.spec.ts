import { loadConfig } from './app-config.js'

describe('API configuration', () => {
  it('rejects a missing database URL', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL is required')
  })

  it('uses the supplied database URL', () => {
    const config = loadConfig({ DATABASE_URL: 'postgresql://local:test@localhost:5432/app' })
    expect(config.databaseUrl).toBe('postgresql://local:test@localhost:5432/app')
  })
})
