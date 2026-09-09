import { describe, expect, it } from 'vitest'
import { advise, type Situation } from './advisor'
import { DEFAULT_PROFILE, type Profile } from './profile'
import type { Shot } from './shots'
import { yardsToMeters } from './units'

const yd = yardsToMeters
const situation = (over: Partial<Situation>): Situation => ({ distance: yd(150), lie: 'fairway', hazards: [], green: null, ...over })
const profile = (over: Partial<Profile>): Profile => ({ ...DEFAULT_PROFILE, ...over })

describe('advise', () => {
  it('pitches inside a full wedge, with the most lofted club in the bag', () => {
    const pitch = advise(situation({ distance: yd(40) }), DEFAULT_PROFILE, [])
    expect(pitch.mode).toBe('pitch')
    expect(pitch.club).toBe('SW')
    expect(advise(situation({ distance: yd(40) }), profile({ bag: ['D', '7i', 'PW', 'P'] }), []).club).toBe('PW')
  })

  it('putts on the green', () => {
    expect(advise(situation({ lie: 'green', distance: 8 }), DEFAULT_PROFILE, []).club).toBe('P')
  })

  it('picks the club whose chart number matches the yardage', () => {
    const advice = advise(situation({ distance: yd(145) }), DEFAULT_PROFILE, [])
    expect(advice.club).toBe('7i')
    expect(advice.mode).toBe('attack')
  })

  it('never pulls driver off the fairway, but does from the tee', () => {
    expect(advise(situation({ distance: yd(400), lie: 'fairway' }), DEFAULT_PROFILE, []).club).toBe('3W')
    expect(advise(situation({ distance: yd(400), lie: 'tee' }), DEFAULT_PROFILE, []).club).toBe('D')
  })

  it('takes more club from the rough', () => {
    const fairway = advise(situation({ distance: yd(145), lie: 'fairway' }), DEFAULT_PROFILE, [])
    const rough = advise(situation({ distance: yd(145), lie: 'rough' }), DEFAULT_PROFILE, [])
    expect(fairway.club).toBe('7i')
    expect(rough.club).toBe('6i')
  })

  it('lays up short of water a safe player cannot carry', () => {
    // Water 135–165 yd out, green at 175: a 5-iron lands right in it.
    const s = situation({ distance: yd(175), hazards: [{ kind: 'water', from: yd(135), to: yd(165) }] })
    const safe = advise(s, profile({ aggressiveness: 'conservative' }), [])
    expect(safe.mode).toBe('layup')
    expect(safe.expected).toBeLessThan(yd(135))

    const aggressive = advise(s, profile({ aggressiveness: 'aggressive' }), [])
    expect(aggressive.mode).toBe('attack')
  })

  it('leaves a full wedge when laying up safe', () => {
    const s = situation({ distance: yd(280), lie: 'fairway' })
    const safe = advise(s, profile({ aggressiveness: 'conservative' }), [])
    expect(safe.mode).toBe('layup')
    // 280 - PW (112) = 168 → nearest club to leaving 112 in is the 5-iron (165).
    expect(safe.club).toBe('5i')
    const bold = advise(s, profile({ aggressiveness: 'aggressive' }), [])
    expect(bold.club).toBe('3W')
  })

  it('aims for the middle of the green when playing safe', () => {
    const s = situation({ distance: yd(160), green: { front: yd(150), back: yd(170) } })
    // Intermediate 6i = 155, 5i = 165: both 5 off. Balanced leans long, safe leans short.
    expect(advise(s, DEFAULT_PROFILE, []).club).toBe('5i')
    expect(advise(s, profile({ aggressiveness: 'conservative' }), []).club).toBe('6i')
    const tucked = situation({ distance: yd(168), green: { front: yd(150), back: yd(170) } })
    const safe = advise(tucked, profile({ aggressiveness: 'conservative' }), [])
    expect(safe.aim).toBeCloseTo(yd(160), 3)
    expect(safe.club).toBe('6i')
  })

  it('plans with the player’s learned distance', () => {
    const shots: Shot[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      roundId: 'r',
      hole: 1,
      number: 1,
      club: '7i',
      lie: 'fairway',
      start: { lat: 0, lng: 0 },
      end: { lat: 0, lng: 0 },
      distance: yd(158),
      manual: false,
      toHole: null,
      plan: null,
      timestamp: 0,
    }))
    const advice = advise(situation({ distance: yd(157) }), DEFAULT_PROFILE, shots)
    expect(advice.club).toBe('7i')
    expect(advice.tips.some((t) => t.text === 'Your 10 shots')).toBe(true)
  })
})
