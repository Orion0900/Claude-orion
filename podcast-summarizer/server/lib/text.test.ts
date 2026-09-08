import { describe, expect, it } from 'vitest'
import { formatTimestamp, normalizeTitle, parseDuration, similarity, stripHtml } from './text.js'

describe('text helpers', () => {
  it('normalizes episode-number noise', () => {
    expect(normalizeTitle('Ep. 12: The Thing!')).toBe('12 the thing')
    expect(normalizeTitle('#12 — The Thing')).toBe('12 the thing')
  })
  it('scores similar titles high and different ones low', () => {
    expect(similarity('Ep 5: Sleep and Dreams', 'Sleep and Dreams')).toBeGreaterThan(0.8)
    expect(similarity('Sleep and Dreams', 'Tax law for founders')).toBeLessThan(0.2)
  })
  it('parses durations', () => {
    expect(parseDuration('1:02:05')).toBe(3725)
    expect(parseDuration('62:05')).toBe(3725)
    expect(parseDuration('3725')).toBe(3725)
    expect(parseDuration('abc')).toBeUndefined()
  })
  it('formats timestamps', () => {
    expect(formatTimestamp(65)).toBe('1:05')
    expect(formatTimestamp(3725)).toBe('1:02:05')
  })
  it('strips html', () => {
    expect(stripHtml('<p>Hi &amp; bye</p><br/>there')).toBe('Hi & bye\n\nthere')
  })
})
