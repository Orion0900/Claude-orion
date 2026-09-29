import { SFX_RULES, VoiceLimiter, type SfxRule } from './limiter'

const rule = (over: Partial<SfxRule> = {}): SfxRule => ({
  rate: 1000,
  burst: 1000,
  voices: 100,
  priority: 1,
  length: 10,
  vary: 0,
  ...over,
})

describe('VoiceLimiter', () => {
  it('caps bonks to their rate when a horde is hit at once', () => {
    const limiter = new VoiceLimiter(SFX_RULES)
    let started = 0
    // 1000 hits spread over one second.
    for (let i = 0; i < 1000; i++) if (limiter.request('bonk', i / 1000) > 0) started++
    expect(started).toBeLessThanOrEqual(SFX_RULES.bonk.rate + SFX_RULES.bonk.burst)
    expect(started).toBeGreaterThanOrEqual(SFX_RULES.bonk.rate - 2)
  })

  it('lets a burst through at the same instant, then drops', () => {
    const limiter = new VoiceLimiter(SFX_RULES)
    let started = 0
    for (let i = 0; i < 50; i++) if (limiter.request('bonk', 3)) started++
    expect(started).toBe(SFX_RULES.bonk.burst)
  })

  it('refills over time', () => {
    const limiter = new VoiceLimiter({ a: rule({ rate: 10, burst: 1 }) })
    expect(limiter.request('a', 0)).toBeGreaterThan(0)
    expect(limiter.request('a', 0.05)).toBe(0)
    expect(limiter.request('a', 0.11)).toBeGreaterThan(0)
  })

  it('cuts the oldest voice of the same id past its voice cap', () => {
    const limiter = new VoiceLimiter({ xp: rule({ voices: 2 }) })
    const a = limiter.request('xp', 0)
    const b = limiter.request('xp', 0.01)
    expect(limiter.stolen).toEqual([])
    const c = limiter.request('xp', 0.02)
    expect(c).toBeGreaterThan(0)
    expect(limiter.stolen).toEqual([a])
    expect(limiter.activeOf('xp')).toBe(2)
    limiter.request('xp', 0.03)
    expect(limiter.stolen).toEqual([b])
  })

  it('keeps the global cap and lets important sounds cut minor ones', () => {
    const limiter = new VoiceLimiter({ minor: rule({ priority: 1 }), major: rule({ priority: 5 }) }, 4)
    const first = limiter.request('minor', 0)
    for (let i = 1; i < 4; i++) limiter.request('minor', i * 0.01)
    expect(limiter.active).toBe(4)
    expect(limiter.request('major', 0.1)).toBeGreaterThan(0)
    expect(limiter.stolen).toEqual([first])
    expect(limiter.active).toBe(4)
  })

  it('drops a minor sound when every voice is more important', () => {
    const limiter = new VoiceLimiter({ minor: rule({ priority: 1 }), major: rule({ priority: 5 }) }, 3)
    for (let i = 0; i < 3; i++) limiter.request('major', i * 0.01)
    expect(limiter.request('minor', 0.1)).toBe(0)
    expect(limiter.stolen).toEqual([])
    expect(limiter.active).toBe(3)
  })

  it('cuts the lowest priority before an older, more important voice', () => {
    const limiter = new VoiceLimiter({ low: rule({ priority: 1 }), mid: rule({ priority: 3 }), top: rule({ priority: 9 }) }, 2)
    limiter.request('mid', 0)
    const low = limiter.request('low', 0.5)
    limiter.request('top', 1)
    expect(limiter.stolen).toEqual([low])
  })

  it('frees voices once they have rung out', () => {
    const limiter = new VoiceLimiter({ a: rule({ length: 0.2 }) }, 2)
    limiter.request('a', 0)
    limiter.request('a', 0)
    expect(limiter.active).toBe(2)
    limiter.prune(0.25)
    expect(limiter.active).toBe(0)
  })

  it('never hands out the same handle twice', () => {
    const limiter = new VoiceLimiter({ a: rule({ voices: 1 }) })
    const seen = new Set<number>()
    for (let i = 0; i < 100; i++) seen.add(limiter.request('a', i))
    expect(seen.size).toBe(100)
  })

  it('ignores unknown ids and broken clocks', () => {
    const limiter = new VoiceLimiter(SFX_RULES)
    expect(limiter.request('nope', 0)).toBe(0)
    expect(limiter.request('bonk', Number.NaN)).toBe(0)
  })
})

describe('SFX_RULES', () => {
  it('has sane numbers for every sound', () => {
    for (const r of Object.values(SFX_RULES)) {
      expect(r.rate).toBeGreaterThan(0)
      expect(r.burst).toBeGreaterThanOrEqual(1)
      expect(r.voices).toBeGreaterThanOrEqual(1)
      expect(r.length).toBeGreaterThan(0)
      expect(r.vary).toBeGreaterThanOrEqual(0)
      expect(r.vary).toBeLessThan(0.2)
    }
    expect(Object.keys(SFX_RULES)).toHaveLength(25)
  })

  it('keeps the busiest sounds within budget', () => {
    expect(SFX_RULES.bonk.rate).toBeLessThanOrEqual(25)
    expect(SFX_RULES.xp.rate).toBeLessThanOrEqual(20)
    expect(SFX_RULES.uiSelect.priority).toBeGreaterThan(SFX_RULES.bonk.priority)
  })
})
