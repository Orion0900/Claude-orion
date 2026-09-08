import { describe, expect, it } from 'vitest'
import { parseJsonTranscript, parseSrtOrVtt, parseTranscriptFile, parseYouTubePanel, renderTranscript, wordCount } from './transcribe.js'

describe('transcript parsing', () => {
  it('parses SRT with speakers', () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,000\nHost: Welcome back.\n\n2\n00:00:04,500 --> 00:00:09,000\nGuest: Thanks for having me.\n`
    expect(parseSrtOrVtt(srt)).toEqual([
      { start: 1, end: 4, speaker: 'Host', text: 'Welcome back.' },
      { start: 4.5, end: 9, speaker: 'Guest', text: 'Thanks for having me.' },
    ])
  })
  it('parses WebVTT with cue settings and tags', () => {
    const vtt = `WEBVTT\n\n00:01.000 --> 00:03.000 align:start\n<v Host>Hello <i>there</i>\n\n01:00:00.000 --> 01:00:02.000\nAn hour in.`
    const segs = parseSrtOrVtt(vtt)
    expect(segs[0]).toMatchObject({ start: 1, end: 3, text: 'Hello there' })
    expect(segs[1]).toMatchObject({ start: 3600, text: 'An hour in.' })
  })
  it('parses the Podcasting 2.0 JSON shape', () => {
    const json = JSON.stringify({ segments: [{ startTime: 0.5, endTime: 2, speaker: 'A', body: 'Hi' }, { startTime: 2, body: '  ' }] })
    expect(parseJsonTranscript(json)).toEqual([{ start: 0.5, end: 2, speaker: 'A', text: 'Hi' }])
  })
  it('routes by type and falls back to plain text', () => {
    expect(parseTranscriptFile('<p>Just words here</p>', 'text/html')).toEqual([{ start: 0, text: 'Just words here' }])
    expect(parseTranscriptFile('1\n00:00:00,000 --> 00:00:01,000\nx', undefined, 'https://x/y.srt')).toHaveLength(1)
  })
})

describe('parseYouTubePanel', () => {
  it('reads timestamps on their own line', () => {
    expect(parseYouTubePanel('0:00\nWelcome back\n0:04\nToday we talk\n1:02:05\nAn hour in')).toEqual([
      { start: 0, text: 'Welcome back' },
      { start: 4, text: 'Today we talk' },
      { start: 3725, text: 'An hour in' },
    ])
  })
  it('reads inline timestamps', () => {
    expect(parseYouTubePanel('0:00 Welcome back\n0:04 Today we talk')).toEqual([
      { start: 0, text: 'Welcome back' },
      { start: 4, text: 'Today we talk' },
    ])
  })
  it('joins wrapped continuation lines', () => {
    expect(parseYouTubePanel('0:00\nWelcome back\nto the show\n0:10\nNext')).toEqual([
      { start: 0, text: 'Welcome back to the show' },
      { start: 10, text: 'Next' },
    ])
  })
  it('is used by parseTranscriptFile in preference to flattening', () => {
    const segs = parseTranscriptFile('0:00\nOne\n0:05\nTwo')
    expect(segs).toHaveLength(2)
    expect(segs[1]).toEqual({ start: 5, text: 'Two' })
    // Prose with no timings still falls back to a single segment.
    expect(parseTranscriptFile('Just some prose about things.')).toEqual([{ start: 0, text: 'Just some prose about things.' }])
  })
})

describe('renderTranscript', () => {
  it('merges captions into timestamped paragraphs and splits on speaker change', () => {
    const segs = [
      { start: 0, text: 'One.', speaker: 'A' },
      { start: 5, text: 'Two.', speaker: 'A' },
      { start: 10, text: 'Three.', speaker: 'B' },
      { start: 70, text: 'Four.', speaker: 'B' },
    ]
    expect(renderTranscript(segs, 45)).toBe('[0:00] A: One. Two.\n\n[0:10] B: Three.\n\n[1:10] B: Four.')
  })
  it('counts words', () => {
    expect(wordCount([{ start: 0, text: 'a b  c' }, { start: 1, text: 'd' }])).toBe(4)
  })
})
