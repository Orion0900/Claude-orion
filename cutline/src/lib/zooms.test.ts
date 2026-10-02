import { describe, expect, it } from 'vitest'
import { autoZooms, zoomAt, type EasedZoomMark } from './zooms'
import type { TimedWord, ZoomMark } from './types'

const word = (text: string, start: number, end: number, emphasis = false): TimedWord => ({
  id: `${text}@${start}`,
  text,
  start,
  end,
  emphasis,
})
const S = 0.12

describe('autoZooms', () => {
  it('does nothing without strength or a video', () => {
    const input = { words: [word('WOW', 1, 1.5)], cutPoints: [2], duration: 5 }
    expect(autoZooms({ ...input, strength: 0 })).toEqual([])
    expect(autoZooms({ ...input, strength: NaN })).toEqual([])
    expect(autoZooms({ ...input, strength: S, duration: 0 })).toEqual([])
  })

  it('alternates the framing at jump cuts, snapping exactly on them', () => {
    expect(autoZooms({ words: [], cutPoints: [3, 6, 9, 12], duration: 15, strength: S })).toEqual([
      { start: 3, end: 6, amount: S * 0.6, snapIn: true, snapOut: true },
      { start: 9, end: 12, amount: S * 0.6, snapIn: true, snapOut: true },
    ])
  })

  it('lets cuts that come too soon go by without a change', () => {
    const marks = autoZooms({ words: [], cutPoints: [1, 1.5, 2, 4, 4.5, 8], duration: 10, strength: S })
    expect(marks.map((m) => [m.start, m.end])).toEqual([
      [1, 4],
      [8, 10],
    ])
  })

  it('eases out of a zoomed shot that has run ~6 s with no cut to end it', () => {
    expect(autoZooms({ words: [], cutPoints: [2, 20], duration: 30, strength: S })).toEqual([
      { start: 2, end: 8, amount: S * 0.6, snapIn: true, snapOut: false },
      { start: 20, end: 26, amount: S * 0.6, snapIn: true, snapOut: false },
    ])
  })

  it('punches in on an emphasised word, reaching full zoom as it starts', () => {
    const marks = autoZooms({ words: [word('this', 1, 1.2), word('matters', 1.25, 1.6, true)], cutPoints: [], duration: 5, strength: S })
    expect(marks).toEqual([{ start: 1.25 - 0.12, end: 1.6 + 0.9, amount: S, snapIn: false, snapOut: false }])
    expect(zoomAt(marks, 1.25)).toBeCloseTo(S, 9)
  })

  it('punches on exclamations and shouted words too, but not on plain ones', () => {
    const at = (w: TimedWord) => autoZooms({ words: [word('so', 0.5, 0.7), w], cutPoints: [], duration: 5, strength: S })
    expect(at(word('wow!', 1, 1.3))).toHaveLength(1)
    expect(at(word('HUGE', 1, 1.3))).toHaveLength(1)
    expect(at(word('I', 1, 1.3))).toHaveLength(0)
    expect(at(word('plain', 1, 1.3))).toHaveLength(0)
  })

  it('punches in with a cut that lands on its word, and out at the next cut', () => {
    const marks = autoZooms({ words: [word('wow!', 3, 3.3)], cutPoints: [3, 3.9], duration: 6, strength: S })
    expect(marks).toEqual([{ start: 3, end: 3.9, amount: S, snapIn: true, snapOut: true }])
  })

  it('gives a quiet stretch an occasional gentler punch at a sentence start', () => {
    const words: TimedWord[] = []
    for (let t = 0; t < 30; t += 3) words.push(word('Here', t, t + 0.3), word('it', t + 0.35, t + 0.5), word('is.', t + 0.55, t + 0.9))
    const marks = autoZooms({ words, cutPoints: [], duration: 31, strength: S })
    expect(marks.length).toBeGreaterThanOrEqual(3)
    marks.forEach((m, i) => {
      expect(m.amount).toBeCloseTo(S * 0.7, 9)
      if (i) expect(m.start - marks[i - 1].start).toBeGreaterThanOrEqual(6)
    })
  })

  it('never zooms in more often than every 2.5 s, never overlaps and stays inside the video', () => {
    const words: TimedWord[] = []
    const cutPoints: number[] = []
    for (let i = 0; i < 200; i++) {
      const t = i * 0.37
      words.push(word(i % 3 ? 'word' : 'BIG!', t, t + 0.3, i % 5 === 0))
      if (i % 4 === 0) cutPoints.push(t + 0.33)
    }
    const duration = 200 * 0.37
    const marks = autoZooms({ words, cutPoints, duration, strength: S })
    expect(marks.length).toBeGreaterThan(10)
    marks.forEach((m, i) => {
      expect(m.start).toBeGreaterThanOrEqual(0)
      expect(m.end).toBeLessThanOrEqual(duration)
      expect(m.end).toBeGreaterThan(m.start)
      if (i) {
        expect(m.start - marks[i - 1].start).toBeGreaterThanOrEqual(2.5 - 1e-9)
        expect(m.start).toBeGreaterThanOrEqual(marks[i - 1].end)
      }
    })
    // The same input always gives the same marks.
    expect(autoZooms({ words, cutPoints, duration, strength: S })).toEqual(marks)
  })

  it('ignores cut points outside the video, repeats and disorder', () => {
    const tidy = autoZooms({ words: [], cutPoints: [3, 6], duration: 8, strength: S })
    expect(autoZooms({ words: [], cutPoints: [6, -1, 3, 3, 0, 8, 12], duration: 8, strength: S })).toEqual(tidy)
  })
})

describe('zoomAt', () => {
  const plain: ZoomMark = { start: 1, end: 3, amount: 0.1 }
  const snapped: EasedZoomMark = { start: 4, end: 6, amount: 0.08, snapIn: true, snapOut: true }

  it('is 0 with no marks and outside them', () => {
    expect(zoomAt([], 1)).toBe(0)
    expect(zoomAt([plain], 0.5)).toBe(0)
    expect(zoomAt([plain], 3)).toBe(0)
    expect(zoomAt([plain], 3.5)).toBe(0)
  })

  it('eases a plain mark in fast and out softly', () => {
    expect(zoomAt([plain], 1)).toBe(0)
    expect(zoomAt([plain], 1.06)).toBeGreaterThan(0.08)
    expect(zoomAt([plain], 1.12)).toBeCloseTo(0.1, 9)
    expect(zoomAt([plain], 2)).toBe(0.1)
    expect(zoomAt([plain], 2.7)).toBeCloseTo(0.1, 9)
    expect(zoomAt([plain], 2.85)).toBeCloseTo(0.05, 9)
    expect(zoomAt([plain], 3 - 1e-6)).toBeLessThan(1e-6)
  })

  it('snaps exactly at jump cuts', () => {
    expect(zoomAt([snapped], 4 - 1e-9)).toBe(0)
    expect(zoomAt([snapped], 4)).toBe(0.08)
    expect(zoomAt([snapped], 6 - 1e-9)).toBe(0.08)
    expect(zoomAt([snapped], 6)).toBe(0)
  })

  it('takes the bigger zoom where marks overlap', () => {
    expect(zoomAt([plain, { start: 2, end: 2.5, amount: 0.3, snapIn: true, snapOut: true } as EasedZoomMark], 2.2)).toBe(0.3)
    expect(zoomAt([plain, { start: 2, end: 2.5, amount: 0.01 }], 2.2)).toBe(0.1)
  })

  it('rises and falls smoothly even on a very short mark', () => {
    const short: ZoomMark = { start: 1, end: 1.1, amount: 0.1 }
    let prev = 0
    for (let t = 1; t <= 1.1; t += 0.001) {
      const z = zoomAt([short], t)
      expect(Math.abs(z - prev)).toBeLessThan(0.01)
      prev = z
    }
  })

  it('only jumps where a mark snaps on a cut', () => {
    const words: TimedWord[] = []
    for (let i = 0; i < 60; i++) words.push(word(i % 7 === 3 ? 'AMAZING!' : 'word', i * 0.4, i * 0.4 + 0.35, i % 11 === 0))
    const cutPoints = [2.1, 5.3, 9.9, 13.2, 17.6, 21]
    const marks = autoZooms({ words, cutPoints, duration: 24, strength: S }) as EasedZoomMark[]
    const snaps = marks.flatMap((m) => [...(m.snapIn ? [m.start] : []), ...(m.snapOut ? [m.end] : [])])
    expect(snaps.length).toBeGreaterThan(0)
    const dt = 0.001
    let prev = zoomAt(marks, 0)
    for (let i = 1; i <= 24 / dt; i++) {
      const t = i * dt
      const z = zoomAt(marks, t)
      if (Math.abs(z - prev) > S * 0.04) expect(snaps.some((s) => s > t - dt - 1e-9 && s <= t + 1e-9), `jump at ${t}`).toBe(true)
      prev = z
    }
  })
})
