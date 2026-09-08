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

  it('leaves no placeholder behind and calls both API steps', () => {
    const code = decode('https://x.example.com')
    expect(code).not.toContain('__API_BASE__')
    expect(code).toContain("post('/api/jobs'")
    expect(code).toContain("'/api/jobs/' + job.id + '/transcript'")
    // Newlines between a timestamp and its line must be real, not escaped:
    // the server's panel parser keys off them.
    expect(code).toContain("t.trim() + '\\n' + x.trim()")
  })
})
