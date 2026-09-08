import { describe, expect, it } from 'vitest'
import { insights } from './coach'
import { DEFAULT_PROFILE } from './profile'
import type { Shot } from './shots'
import { yardsToMeters } from './units'

const yd = yardsToMeters
function shot(over: Partial<Shot>): Shot {
  return {
    id: Math.random().toString(36),
    roundId: 'r',
    hole: 1,
    number: 1,
    club: '7i',
    lie: 'fairway',
    start: { lat: 0, lng: 0 },
    end: { lat: 0, lng: 0 },
    distance: yd(140),
    manual: false,
    toHole: null,
    plan: null,
    timestamp: 0,
    ...over,
  }
}

describe('insights', () => {
  it('asks for shots when there are none', () => {
    expect(insights([], DEFAULT_PROFILE)[0].kind).toBe('progress')
  })

  it('notices a club that runs shorter than the chart', () => {
    const shots = Array.from({ length: 6 }, () => shot({ distance: yd(130) }))
    const found = insights(shots, DEFAULT_PROFILE).find((i) => i.kind === 'distance')
    expect(found?.club).toBe('7i')
    expect(found?.body).toContain('shorter')
  })

  it('notices a habit of coming up short', () => {
    const shots = Array.from({ length: 6 }, () =>
      shot({ toHole: yd(150), distance: yd(138), plan: { club: '7i', mode: 'attack', expected: yd(145), aim: yd(150) } }),
    )
    const found = insights(shots, DEFAULT_PROFILE).find((i) => i.kind === 'tendency')
    expect(found?.title).toContain('Short')
  })

  it('recommends the tighter long club', () => {
    const driver = [230, 180, 260, 200, 250, 190].map((d) => shot({ club: 'D', distance: yd(d), lie: 'tee' }))
    const threeWood = [210, 214, 208, 212, 211].map((d) => shot({ club: '3W', distance: yd(d), lie: 'tee' }))
    const found = insights([...driver, ...threeWood], DEFAULT_PROFILE).find((i) => i.kind === 'consistency')
    expect(found?.title).toBe('3 wood over driver')
  })
})
