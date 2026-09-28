import { buildWebviewUrl, createWebviewLauncher } from './launch'
import { WEBVIEW_APPS_PATH } from '../navigation/routes'
import { safeReturnTarget } from '../navigation/guard'

const entryUrl = 'https://demo.example.com/view?from=miniapp#section'
const ticket = { entryUrl, ticket: 'a+b/=', expiresIn: 60 }

describe('WebView launch', () => {
  it('preserves an existing query and fragment while encoding ticket values', () => {
    expect(buildWebviewUrl(entryUrl, 'app 1', ticket.ticket)).toBe('https://demo.example.com/view?from=miniapp&appId=app%201&ticket=a%2Bb%2F%3D#section')
  })

  it('rejects invalid or untrusted URL schemes', () => {
    expect(() => buildWebviewUrl('javascript:alert(1)', 'demo', 'ticket')).toThrow()
    expect(() => buildWebviewUrl('http://evil.example.com', 'demo', 'ticket')).toThrow()
  })

  it('adds exactly three GCJ-02 coordinate parameters', () => {
    expect(buildWebviewUrl('https://demo.example.com/view', 'demo', 'ticket', { latitude: 30.2, longitude: 120.1, coordinateSystem: 'gcj02' }))
      .toBe('https://demo.example.com/view?appId=demo&ticket=ticket&latitude=30.2&longitude=120.1&coordinateSystem=gcj02')
  })

  it.each(['denied', 'cancelled', 'unavailable', 'failed'] as const)('opens without coordinates when location is %s', async (status) => {
    const sequence: string[] = []
    const launcher = createWebviewLauncher({
      getCurrentLocation: async () => { sequence.push('location'); return { status } },
      issueTicket: async () => { sequence.push('ticket'); return ticket }
    })
    const url = await launcher.open('demo', true)
    expect(sequence).toEqual(['location', 'ticket'])
    expect(url).toContain('ticket=a%2Bb%2F%3D')
    expect(url).not.toContain('latitude=')
    expect(url).not.toContain('longitude=')
    expect(url).not.toContain('coordinateSystem=')
  })

  it('does not request location unless selected', async () => {
    const getCurrentLocation = jest.fn(async () => ({ status: 'failed' as const }))
    const launcher = createWebviewLauncher({ getCurrentLocation, issueTicket: async () => ticket })
    expect(await launcher.open('demo', false)).toContain('ticket=')
    expect(getCurrentLocation).not.toHaveBeenCalled()
  })

  it('allows only the fixed app list as a login return target', () => {
    expect(safeReturnTarget(WEBVIEW_APPS_PATH)).toBe(WEBVIEW_APPS_PATH)
    expect(safeReturnTarget(`${WEBVIEW_APPS_PATH}?url=https://evil.example`)).toBe('/pages/portal/index')
  })
})
