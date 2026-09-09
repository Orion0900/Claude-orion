import { describe, expect, it } from 'vitest'
import { bookmarkletUrl } from './bookmarklet'

const decode = (base: string) => decodeURIComponent(bookmarkletUrl(base).slice('javascript:'.length))

describe('bookmarkletUrl', () => {
  it('produces an installable javascript: URL with the API baked in', () => {
    const url = bookmarkletUrl('https://podbrief.example.com')
    expect(url.startsWith('javascript:')).toBe(true)
    // Safari bookmarks choke on raw spaces and quotes; everything is encoded.
    expect(url).not.toMatch(/[ "<>]/)
    expect(decode('https://podbrief.example.com')).toContain("const BASE = 'https://podbrief.example.com'")
  })

  it('trims trailing slashes so the built URLs are not doubled', () => {
    expect(decode('https://x.example.com///')).toContain("const BASE = 'https://x.example.com'")
  })

  it('leaves no placeholder behind and posts link and transcript together', () => {
    const code = decode('https://x.example.com')
    expect(code).not.toContain('__API_BASE__')
    expect(code).toContain("BASE + '/api/jobs'")
    expect(code).toContain('transcript: text')
    // One request carries both, so nothing races the server's caption hunt.
    expect(code).not.toContain("'/transcript'")
  })

  it('reads captions itself rather than relying on the transcript panel', () => {
    const code = decode('https://x.example.com')
    // Relative paths: m.youtube.com and www.youtube.com are separate origins,
    // so only a relative URL stays same-origin and readable.
    expect(code).toContain("'/watch?v=' + id")
    // The absolute youtube.com URL is only the canonical link handed to
    // PodBrief; nothing is ever *fetched* from an absolute YouTube origin.
    expect(code).not.toMatch(/fetch\(\s*['"`]https:\/\/(?:www\.|m\.)?youtube\.com/)
    expect(code).toContain('ytInitialPlayerResponse')
    expect(code).toContain('fmt=json3')
    // The panel remains a fallback, not the requirement.
    expect(code).toContain('ytd-transcript-segment-renderer')
  })

  it('asks YouTube\u2019s own player endpoint when the page blob has no tracks', () => {
    const code = decode('https://x.example.com')
    expect(code).toContain('/youtubei/v1/player')
    // The page's own client identity is reused so the call looks native.
    expect(code).toContain('INNERTUBE_API_KEY')
    expect(code).toContain('INNERTUBE_CLIENT_NAME')
    expect(code).toContain('INNERTUBE_CLIENT_VERSION')
  })

  it('matches transcript rows by shape, not just desktop element names', () => {
    const code = decode('https://x.example.com')
    expect(code).toContain('ytd-transcript-segment-renderer')
    expect(code).toContain('ytm-transcript-segment-renderer')
    expect(code).toContain('transcript-segment')
  })

  it('reports what it tried when it finds nothing', () => {
    const code = decode('https://x.example.com')
    expect(code).toContain('No captions found.')
    expect(code).toContain("trail.push('page: '")
    expect(code).toContain("trail.push('player: '")
    expect(code).toContain("trail.push('panel: '")
  })

  it('refuses to run anywhere but YouTube', () => {
    expect(decode('https://x.example.com')).toContain('youtube')
  })
})
