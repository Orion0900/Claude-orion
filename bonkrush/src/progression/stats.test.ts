import { BASE_STATS, computeStats, describeMod, scaleMod } from './stats'

describe('computeStats', () => {
  it('returns the base with no mods', () => {
    expect(computeStats([])).toEqual(BASE_STATS)
  })

  it('adds, then multiplies, in any order', () => {
    const a = computeStats([
      { stat: 'damage', op: 'add', value: 0.5 },
      { stat: 'damage', op: 'mul', value: 2 },
    ])
    const b = computeStats([
      { stat: 'damage', op: 'mul', value: 2 },
      { stat: 'damage', op: 'add', value: 0.5 },
    ])
    expect(a.damage).toBeCloseTo(3)
    expect(b.damage).toBeCloseTo(3)
  })

  it('caps armor and evasion', () => {
    const s = computeStats([
      { stat: 'armor', op: 'add', value: 5 },
      { stat: 'evasion', op: 'add', value: 5 },
    ])
    expect(s.armor).toBe(0.8)
    expect(s.evasion).toBe(0.75)
  })

  it('keeps counts whole', () => {
    const s = computeStats([{ stat: 'projectiles', op: 'add', value: 1.6 }])
    expect(s.projectiles).toBe(1)
  })
})

describe('scaleMod', () => {
  it('scales additive mods by the rarity multiplier', () => {
    expect(scaleMod({ stat: 'damage', op: 'add', value: 0.1 }, 2).value).toBeCloseTo(0.2)
  })

  it('never rounds a count upgrade down to nothing', () => {
    expect(scaleMod({ stat: 'projectiles', op: 'add', value: 1 }, 1.2).value).toBe(1)
    expect(scaleMod({ stat: 'projectiles', op: 'add', value: 1 }, 2).value).toBe(2)
  })

  it('scales the bonus part of a multiplier', () => {
    expect(scaleMod({ stat: 'damage', op: 'mul', value: 1.1 }, 2).value).toBeCloseTo(1.2)
  })
})

describe('describeMod', () => {
  it('reads like a card', () => {
    expect(describeMod({ stat: 'damage', op: 'add', value: 0.12 })).toBe('+12% Damage')
    expect(describeMod({ stat: 'projectiles', op: 'add', value: 1 })).toBe('+1 Projectiles')
    expect(describeMod({ stat: 'maxHp', op: 'add', value: 25 })).toBe('+25 Max HP')
  })
})
