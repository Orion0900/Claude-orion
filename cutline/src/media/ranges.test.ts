import { buildTimeline, frameCount, frameSourceTimes, normalizeRanges, segmentIndexAt, sourceTimeAt } from './ranges'

const RANGES = [
  { start: 0.4, end: 6 },
  { start: 8, end: 14.2 },
  { start: 15.5, end: 25 },
]

describe('normalizeRanges', () => {
  it('sorts, clamps, drops empty spans and merges overlapping or touching ones', () => {
    expect(
      normalizeRanges(
        [
          { start: 10, end: 12 },
          { start: -1, end: 2 },
          { start: 2, end: 3 },
          { start: 5, end: 5 },
          { start: 11, end: 15 },
          { start: 29, end: 40 },
        ],
        30,
      ),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 10, end: 15 },
      { start: 29, end: 30 },
    ])
  })

  it('leaves the caller’s ranges alone', () => {
    const input = [{ start: 1, end: 2 }]
    normalizeRanges(input, 1.5)
    expect(input).toEqual([{ start: 1, end: 2 }])
  })
})

describe('buildTimeline', () => {
  it('places the kept spans back to back', () => {
    const tl = buildTimeline(RANGES)
    const offsets = tl.segments.map((s) => s.offset)
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBeCloseTo(5.6, 12)
    expect(offsets[2]).toBeCloseTo(11.8, 12)
    expect(tl.duration).toBeCloseTo(21.3, 10)
  })

  it('maps edited time to source time, half-open at each cut', () => {
    const tl = buildTimeline(RANGES)
    expect(sourceTimeAt(tl, 0)).toBeCloseTo(0.4)
    expect(sourceTimeAt(tl, 5.5)).toBeCloseTo(5.9)
    expect(segmentIndexAt(tl, 5.6)).toBe(1)
    expect(sourceTimeAt(tl, 5.6)).toBeCloseTo(8)
    expect(sourceTimeAt(tl, 11.8)).toBeCloseTo(15.5)
    expect(sourceTimeAt(tl, 21.3)).toBeCloseTo(25)
    expect(sourceTimeAt(tl, 99)).toBeCloseTo(25)
  })
})

describe('frameSourceTimes', () => {
  it('fetches every output frame from the right moment of the right span', () => {
    const tl = buildTimeline(RANGES)
    const count = frameCount(tl.duration, 30)
    expect(count).toBe(639)
    const times = frameSourceTimes(tl, 30, count)
    expect(times[0]).toBeCloseTo(0.4, 9)
    expect(times[167]).toBeCloseTo(0.4 + 167 / 30, 9)
    expect(times[168]).toBeCloseTo(8, 9) // edited 5.6 s: first frame after the first cut
    expect(times[354]).toBeCloseTo(15.5, 9) // edited 11.8 s
    expect(times[638]).toBeCloseTo(15.5 + 638 / 30 - 11.8, 9)
    for (let k = 1; k < count; k++) expect(times[k]).toBeGreaterThan(times[k - 1])
    for (const t of times) expect(RANGES.some((r) => t >= r.start && t < r.end)).toBe(true)
  })

  it('nudges lookups past millisecond-rounded frame stamps without leaving the span', () => {
    // WebM stores 30 fps frame times rounded to the millisecond.
    const stamps = Array.from({ length: 800 }, (_, j) => Math.round((j * 1000) / 30) / 1000)
    const frameAt = (t: number) => {
      let j = 0
      while (j + 1 < stamps.length && stamps[j + 1] <= t) j++
      return j
    }
    const tl = buildTimeline(RANGES)
    const exact = frameSourceTimes(tl, 30)
    const nudged = frameSourceTimes(tl, 30, undefined, 0.001)
    let wrongWithout = 0
    for (let k = 0; k < exact.length; k++) {
      const intended = Math.round(exact[k] * 30)
      if (frameAt(exact[k]) !== intended) wrongWithout++
      expect(frameAt(nudged[k])).toBe(intended)
    }
    expect(wrongWithout).toBeGreaterThan(0)

    const tight = buildTimeline([{ start: 1, end: 1.0335 }])
    for (const t of frameSourceTimes(tight, 30, 2, 0.01)) expect(t).toBeLessThan(1.0335)
  })

  it('rounds the frame count so audio padded to it stays within half a frame', () => {
    expect(frameCount(10, 30)).toBe(300)
    expect(frameCount(10.01, 30)).toBe(300)
    expect(frameCount(10.02, 30)).toBe(301)
    expect(frameCount(0, 30)).toBe(1)
  })
})
