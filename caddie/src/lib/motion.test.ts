import { describe, expect, it } from 'vitest'
import { confettiBurst, easeOutBack, easeOutCubic, worthFlagging } from './motion'

describe('easing', () => {
  it('starts at 0 and ends at 1', () => {
    for (const ease of [easeOutCubic, easeOutBack]) {
      expect(ease(0)).toBeCloseTo(0, 6)
      expect(ease(1)).toBe(1)
    }
  })

  it('clamps input outside 0-1', () => {
    expect(easeOutCubic(-3)).toBe(0)
    expect(easeOutCubic(4)).toBe(1)
  })

  it('decelerates: more than half the distance is covered in the first half', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })

  it('overshoots on the way out, which is what makes it bouncy', () => {
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(easeOutBack))).toBeGreaterThan(1)
  })
})

describe('worthFlagging', () => {
  it('ignores the GPS breathing', () => {
    expect(worthFlagging(150, 151)).toBe(false)
  })

  it('flags a real change, in either direction', () => {
    expect(worthFlagging(150, 130)).toBe(true)
    expect(worthFlagging(130, 150)).toBe(true)
  })

  it('says nothing when there is no number yet', () => {
    expect(worthFlagging(null, 150)).toBe(false)
    expect(worthFlagging(150, null)).toBe(false)
  })
})

describe('confettiBurst', () => {
  it('makes the number of pieces asked for', () => {
    expect(confettiBurst(24)).toHaveLength(24)
  })

  it('is deterministic for a seed, and different for another', () => {
    expect(confettiBurst(6, 7)).toEqual(confettiBurst(6, 7))
    expect(confettiBurst(6, 7)).not.toEqual(confettiBurst(6, 8))
  })

  it('keeps every piece on screen and in the palette', () => {
    for (const piece of confettiBurst(60, 3)) {
      expect(piece.x).toBeGreaterThanOrEqual(0)
      expect(piece.x).toBeLessThanOrEqual(100)
      expect(piece.color).toBeGreaterThanOrEqual(0)
      expect(piece.color).toBeLessThan(5)
      expect(piece.duration).toBeGreaterThan(0)
    }
  })
})
