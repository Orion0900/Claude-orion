import { afterEach, describe, expect, it, vi } from 'vitest'
import { appleMapsUrl, gpxFilename, isAppleDevice, shareRoute } from './share'
import { buildProfile } from './elevation'
import { destination } from './geo'
import type { RouteResult } from './routeSearch'

const start = { lat: 42.3601, lng: -71.0589 }
const path = Array.from({ length: 12 }, (_, i) => destination(start, 90, i * 100))

const route: RouteResult = {
  id: 'r1',
  path,
  distance: 1100,
  profile: buildProfile(path.filter((_, i) => i % 3 === 0), [10, 20, 30, 20]),
  outboundBearing: 90,
  turns: 5,
  meetsCriteria: true,
  distanceError: 0.01,
  score: 0.02,
}

afterEach(() => vi.unstubAllGlobals())

describe('gpxFilename', () => {
  it('makes a tidy filename from a route name', () => {
    expect(gpxFilename('5.02 mi NE loop')).toBe('502-mi-ne-loop.gpx')
  })

  it('strips characters a filesystem would reject', () => {
    expect(gpxFilename('Tom & "Jerry"/run')).toBe('tom-jerryrun.gpx')
  })

  it('falls back to a default when nothing usable is left', () => {
    expect(gpxFilename('***')).toBe('route.gpx')
  })
})

describe('appleMapsUrl', () => {
  it('asks for walking directions to the start point', () => {
    const url = appleMapsUrl(start)
    expect(url.startsWith('https://maps.apple.com/?')).toBe(true)
    expect(url).toContain('daddr=42.360100%2C-71.058900')
    expect(url).toContain('dirflg=w')
  })

  it('carries a readable label', () => {
    expect(appleMapsUrl(start, 'Morning loop')).toContain('q=Morning+loop')
  })
})

describe('isAppleDevice', () => {
  it('recognises an iPhone', () => {
    expect(isAppleDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true)
  })

  it('recognises an iPad that claims to be a Mac', () => {
    expect(isAppleDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
  })

  it('does not mistake a desktop Mac for a touch device', () => {
    expect(isAppleDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
  })

  it('does not match Android', () => {
    expect(isAppleDevice('Mozilla/5.0 (Linux; Android 14)', 5)).toBe(false)
  })
})

describe('shareRoute', () => {
  function stubDom() {
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', {
      createElement: () => link,
      body: { appendChild: vi.fn() },
    })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
    return link
  }

  it('uses the phone share sheet when files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, canShare: () => true })

    await expect(shareRoute(route, 'Morning loop')).resolves.toBe('shared')
    expect(share).toHaveBeenCalledOnce()
    const shared = share.mock.calls[0][0]
    expect(shared.files[0].name).toBe('morning-loop.gpx')
  })

  it('treats a dismissed share sheet as a cancellation, not an error', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(abort), canShare: () => true })

    await expect(shareRoute(route, 'Morning loop')).resolves.toBe('cancelled')
  })

  it('falls back to a download when the share sheet rejects the file', async () => {
    const link = stubDom()
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new Error('not allowed')),
      canShare: () => true,
    })

    await expect(shareRoute(route, 'Morning loop')).resolves.toBe('downloaded')
    expect(link.click).toHaveBeenCalledOnce()
    expect(link.download).toBe('morning-loop.gpx')
  })

  it('downloads directly on a browser with no share sheet', async () => {
    const link = stubDom()
    vi.stubGlobal('navigator', {})

    await expect(shareRoute(route, 'Morning loop')).resolves.toBe('downloaded')
    expect(link.click).toHaveBeenCalledOnce()
  })

  it('downloads when the browser shares links but not files', async () => {
    const link = stubDom()
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => false })

    await expect(shareRoute(route, 'Morning loop')).resolves.toBe('downloaded')
    expect(link.click).toHaveBeenCalledOnce()
  })
})
