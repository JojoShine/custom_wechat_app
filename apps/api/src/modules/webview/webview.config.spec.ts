import { describe, expect, it } from 'vitest'
import { loadWebviewApps } from './webview.config.js'

const app = { appId: 'demo', name: '示例网页', entryUrl: 'https://demo.example.com/home', origin: 'https://demo.example.com' }
const load = (items: unknown) => loadWebviewApps({ WEBVIEW_APPS_JSON: JSON.stringify(items) })

describe('loadWebviewApps', () => {
  it('returns no apps when not configured', () => {
    expect(loadWebviewApps({})).toEqual([])
  })

  it('returns a registered HTTPS app', () => {
    expect(load([app])).toEqual([app])
  })

  it('normalizes accepted URL schemes for the miniapp launcher', () => {
    expect(load([{ ...app, entryUrl: 'HTTPS://demo.example.com/home' }])[0].entryUrl).toBe(app.entryUrl)
  })

  it('rejects duplicate app identifiers', () => {
    expect(() => load([app, { ...app, name: 'another' }])).toThrow()
  })

  it('rejects a mismatched origin', () => {
    expect(() => load([{ ...app, origin: 'https://other.example.com' }])).toThrow()
  })

  it('rejects an ordinary HTTP origin', () => {
    expect(() => load([{ ...app, entryUrl: 'http://demo.example.com/home', origin: 'http://demo.example.com' }])).toThrow()
  })

  it('allows an explicitly configured HTTP loopback app', () => {
    const local = { appId: 'local', name: '本地示例', entryUrl: 'http://localhost:3000/webview/demo', origin: 'http://localhost:3000' }
    expect(load([local])).toEqual([local])
  })
})
