import {
  activeLift,
  activeWordIndex,
  breakLines,
  DURATION,
  easeOutBack,
  easeOutCubic,
  emojiMotion,
  flicker,
  glideProgress,
  greedyLineCount,
  pageMotion,
  popBump,
  restingMotion,
  swipeProgress,
  wordMotion,
  wordProgress,
} from './layout'

describe('breakLines', () => {
  it('keeps a page on one line when it fits', () => {
    const r = breakLines([100, 80, 120], 20, 400, 2)
    expect(r.starts).toEqual([0])
    expect(r.widths).toEqual([340])
    expect(r.scale).toBe(1)
  })

  it('uses as few lines as fit, then evens them out instead of leaving a straggler', () => {
    // Greedy filling would give [100 100 100 | 100]; balanced gives two lines of two.
    const r = breakLines([100, 100, 100, 100], 10, 330, 3)
    expect(r.starts).toEqual([0, 2])
    expect(r.widths).toEqual([210, 210])
    expect(r.scale).toBe(1)
  })

  it('never exceeds maxLines, asking for a smaller font instead', () => {
    const widths = [200, 200, 200, 200, 200, 200]
    const r = breakLines(widths, 0, 400, 2)
    expect(r.starts).toHaveLength(2)
    expect(r.starts).toEqual([0, 3])
    expect(r.scale).toBeCloseTo(400 / 600)
    // Every line fits once scaled.
    for (const w of r.widths) expect(w * r.scale).toBeLessThanOrEqual(400 + 1e-9)
  })

  it('shrinks a single word wider than the frame', () => {
    const r = breakLines([900], 10, 450, 2)
    expect(r.starts).toEqual([0])
    expect(r.scale).toBeCloseTo(0.5)
  })

  it('minimises the widest line when it must squeeze', () => {
    // One long word: the best two-line split keeps it alone.
    const r = breakLines([50, 50, 50, 500], 10, 300, 2)
    expect(r.starts).toEqual([0, 3])
    expect(r.widths).toEqual([170, 500])
  })

  it('handles empty pages and silly maxLines', () => {
    expect(breakLines([], 10, 100, 2)).toEqual({ starts: [], widths: [], scale: 1 })
    expect(breakLines([10, 10], 5, 100, 0).starts).toEqual([0])
    expect(breakLines([60, 60, 60], 5, 100, Number.NaN).starts).toEqual([0])
  })

  it('counts greedy lines', () => {
    expect(greedyLineCount([], 1, 10)).toBe(0)
    expect(greedyLineCount([5, 5, 5], 1, 11)).toBe(2)
    expect(greedyLineCount([5, 5, 5], 1, 17)).toBe(1)
  })
})

describe('activeWordIndex', () => {
  const words = [
    { start: 1, end: 1.3 },
    { start: 1.3, end: 1.6 },
    { start: 2.2, end: 2.5 },
  ]

  it('is -1 before anything is said', () => {
    expect(activeWordIndex(words, 0.5)).toBe(-1)
  })

  it('picks the word whose span holds t', () => {
    expect(activeWordIndex(words, 1)).toBe(0)
    expect(activeWordIndex(words, 1.29)).toBe(0)
    expect(activeWordIndex(words, 1.3)).toBe(1)
  })

  it('stays on the last spoken word through a pause and after the end', () => {
    expect(activeWordIndex(words, 1.9)).toBe(1)
    expect(activeWordIndex(words, 9)).toBe(2)
  })
})

describe('easing', () => {
  it('starts at 0 and ends at 1', () => {
    for (const f of [easeOutCubic, (x: number) => easeOutBack(x)]) {
      expect(f(0)).toBeCloseTo(0)
      expect(f(1)).toBeCloseTo(1)
      expect(f(-5)).toBeCloseTo(0)
      expect(f(5)).toBeCloseTo(1)
    }
  })

  it('easeOutCubic never overshoots and easeOutBack does', () => {
    let maxCubic = 0
    let maxBack = 0
    for (let x = 0; x <= 1; x += 0.01) {
      maxCubic = Math.max(maxCubic, easeOutCubic(x))
      maxBack = Math.max(maxBack, easeOutBack(x))
    }
    expect(maxCubic).toBeLessThanOrEqual(1)
    expect(maxBack).toBeGreaterThan(1.05)
    expect(maxBack).toBeLessThan(1.15)
  })
})

describe('motion curves', () => {
  it('pops pages in and settles at rest', () => {
    const start = pageMotion('pop', 0)
    expect(start.alpha).toBe(0)
    expect(start.scale).toBeLessThan(0.9)
    const mid = pageMotion('pop', DURATION.enter * 0.6)
    expect(mid.scale).toBeGreaterThan(1)
    expect(pageMotion('pop', 1)).toEqual(restingMotion())
  })

  it('fades, slides and karaoke-rises in, and leaves other pages alone', () => {
    expect(pageMotion('fade', 0).alpha).toBe(0)
    expect(pageMotion('fade', 0.1).alpha).toBeGreaterThan(0.5)
    expect(pageMotion('slide', 0).rise).toBeGreaterThan(0)
    expect(pageMotion('karaoke', 0.05).rise).toBeGreaterThan(0)
    for (const a of ['fade', 'slide', 'karaoke'] as const) expect(pageMotion(a, 2)).toEqual(restingMotion())
    for (const a of ['none', 'typewriter', 'bounce'] as const) expect(pageMotion(a, 0)).toEqual(restingMotion())
  })

  it('hides typewriter and bounce words until they are spoken', () => {
    expect(wordMotion('typewriter', -0.01).alpha).toBe(0)
    expect(wordMotion('bounce', -0.01).alpha).toBe(0)
    expect(wordMotion('pop', -0.01).alpha).toBe(1)
    expect(wordMotion('typewriter', 0.04).rise).toBeGreaterThan(0)
    expect(wordMotion('typewriter', 1)).toEqual(restingMotion())
  })

  it('bounces words in past full size before settling', () => {
    let peak = 0
    for (let age = 0; age < DURATION.bounce; age += 0.005) peak = Math.max(peak, wordMotion('bounce', age).scale)
    expect(peak).toBeGreaterThan(1.1)
    expect(peak).toBeLessThan(1.3)
    expect(wordMotion('bounce', 0).scale).toBeCloseTo(0.3)
    expect(wordMotion('bounce', 1).scale).toBeCloseTo(1)
  })

  it('pops a word up and back down', () => {
    expect(popBump(0)).toBe(0)
    expect(popBump(DURATION.pop)).toBe(0)
    expect(popBump(DURATION.pop / 4)).toBeCloseTo(1)
    expect(popBump(-1)).toBe(0)
  })

  it('lifts the active word and lets it back down from wherever it got to', () => {
    expect(activeLift(0.9, 1, 2)).toBe(0)
    expect(activeLift(1.5, 1, 2)).toBeCloseTo(1)
    expect(activeLift(2 + DURATION.settle, 1, 2)).toBeCloseTo(0)
    // Cut short by a quick next word: shrinks from its partial height, no jump.
    const reached = activeLift(1.05 - 1e-9, 1, 1.05)
    expect(activeLift(1.05, 1, 1.05)).toBeCloseTo(reached)
    expect(activeLift(5, 1, Infinity)).toBeCloseTo(1)
  })

  it('progresses karaoke fills, swipes and glides over time', () => {
    expect(wordProgress(1, 1, 2)).toBe(0)
    expect(wordProgress(1.5, 1, 2)).toBeCloseTo(0.5)
    expect(wordProgress(3, 1, 2)).toBe(1)
    expect(wordProgress(1, 1, 1)).toBe(0)
    expect(swipeProgress(1, 1, 3)).toBe(0)
    expect(swipeProgress(1.45, 1, 3)).toBeCloseTo(1)
    expect(glideProgress(1, 1)).toBe(0)
    expect(glideProgress(1 + DURATION.glide, 1)).toBeCloseTo(1)
  })

  it('flickers a neon page on and then holds', () => {
    expect(flicker(0.04)).toBeLessThan(0.5)
    expect(flicker(0.08)).toBe(1)
    expect(flicker(0.5)).toBe(1)
  })

  it('pops the emoji in from nothing', () => {
    const m = emojiMotion(0, { ...restingMotion(), angle: 0 })
    expect(m.scale).toBe(0)
    expect(m.alpha).toBe(0)
    const later = emojiMotion(1, { ...restingMotion(), angle: 0 })
    expect(later.scale).toBeCloseTo(1)
    expect(later.angle).toBeCloseTo(0)
  })

  it('is a pure function of time', () => {
    for (const a of ['pop', 'bounce', 'fade', 'slide', 'typewriter', 'karaoke', 'none'] as const) {
      for (const age of [0, 0.05, 0.13, 0.4]) {
        expect(pageMotion(a, age)).toEqual(pageMotion(a, age))
        expect(wordMotion(a, age)).toEqual(wordMotion(a, age))
      }
    }
  })
})
