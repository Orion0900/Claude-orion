import { BASE_STATS } from '../progression/stats'
import type { StatBlock, WeaponStats } from '../game/types'
import {
  MIN_COOLDOWN,
  MIN_UPGRADED_COOLDOWN,
  applyUpgrade,
  blankStats,
  critMultiplier,
  critTiers,
  describeWeaponChange,
  effectiveStats,
} from './weaponMath'

const base: WeaponStats = {
  damage: 10,
  cooldown: 1,
  count: 1,
  size: 2,
  speed: 20,
  duration: 3,
  pierce: 2,
  bounces: 1,
  range: 10,
  knockback: 4,
  critChance: 0.1,
}

function player(overrides: Partial<StatBlock> = {}): StatBlock {
  return { ...BASE_STATS, ...overrides }
}

describe('effectiveStats', () => {
  it('leaves a weapon unchanged at base player stats (except crit, which adds the base 5%)', () => {
    const eff = effectiveStats(base, player(), 'bow')
    expect(eff).toEqual({ ...base, critChance: 0.1 + BASE_STATS.critChance })
  })

  it('scales each number by its stat', () => {
    const eff = effectiveStats(
      base,
      player({
        damage: 1.5,
        attackSpeed: 2,
        projectiles: 2,
        size: 1.5,
        projectileSpeed: 1.2,
        duration: 2,
        bounces: 3,
        knockback: 0.5,
        critChance: 0.3,
      }),
      'bow',
    )
    expect(eff.damage).toBeCloseTo(15)
    expect(eff.cooldown).toBeCloseTo(0.5)
    expect(eff.count).toBe(3)
    expect(eff.size).toBeCloseTo(3)
    expect(eff.speed).toBeCloseTo(24)
    expect(eff.duration).toBeCloseTo(6)
    expect(eff.bounces).toBe(4)
    expect(eff.knockback).toBeCloseTo(2)
    expect(eff.critChance).toBeCloseTo(0.4)
    expect(eff.pierce).toBe(2)
    expect(eff.range).toBe(10)
  })

  it('never lets cooldown drop below the floor', () => {
    const eff = effectiveStats({ ...base, cooldown: 0.2 }, player({ attackSpeed: 10 }), 'bow')
    expect(eff.cooldown).toBe(MIN_COOLDOWN)
  })

  it('keeps a single aura however many projectiles the player has', () => {
    expect(effectiveStats(base, player({ projectiles: 5 }), 'aura').count).toBe(1)
    expect(effectiveStats(base, player({ projectiles: 5 }), 'chunkers').count).toBe(6)
  })

  it('grows melee reach gently with size, and leaves aimed range alone', () => {
    const big = player({ size: 4 })
    expect(effectiveStats(base, big, 'sword').range).toBeCloseTo(20)
    expect(effectiveStats(base, big, 'katana').range).toBeCloseTo(20)
    expect(effectiveStats(base, big, 'firestaff').range).toBe(10)
  })

  it('keeps infinite pierce infinite', () => {
    expect(effectiveStats({ ...base, pierce: Infinity }, player(), 'sword').pierce).toBe(Infinity)
  })

  it('scales a pulling (negative) knockback into a stronger pull', () => {
    expect(effectiveStats({ ...base, knockback: -4 }, player({ knockback: 1.5 }), 'tornado').knockback).toBeCloseTo(-6)
  })

  it('writes into the given object without allocating a new one', () => {
    const out = blankStats()
    expect(effectiveStats(base, player(), 'bow', out)).toBe(out)
  })

  it('survives a broken attack speed without NaN', () => {
    const eff = effectiveStats(base, player({ attackSpeed: 0 }), 'bow')
    expect(Number.isFinite(eff.cooldown)).toBe(true)
  })
})

describe('critTiers', () => {
  it('never crits at zero or invalid chance', () => {
    expect(critTiers(0, 0)).toBe(0)
    expect(critTiers(-1, 0)).toBe(0)
    expect(critTiers(Number.NaN, 0)).toBe(0)
  })

  it('crits when the roll is under the chance', () => {
    expect(critTiers(0.25, 0.1)).toBe(1)
    expect(critTiers(0.25, 0.3)).toBe(0)
  })

  it('always crits at 100%', () => {
    expect(critTiers(1, 0)).toBe(1)
    expect(critTiers(1, 0.999)).toBe(1)
  })

  it('overcrits: a guaranteed crit plus (chance − 1) for a second', () => {
    expect(critTiers(1.4, 0.3)).toBe(2)
    expect(critTiers(1.4, 0.5)).toBe(1)
    expect(critTiers(2.25, 0.2)).toBe(3)
    expect(critTiers(2.25, 0.9)).toBe(2)
  })

  it('crits at the expected rate', () => {
    let total = 0
    const n = 10000
    for (let i = 0; i < n; i++) total += critTiers(1.3, (i + 0.5) / n)
    expect(total / n).toBeCloseTo(1.3, 2)
  })
})

describe('critMultiplier', () => {
  it('multiplies once per tier', () => {
    expect(critMultiplier(0, 2)).toBe(1)
    expect(critMultiplier(1, 2)).toBe(2)
    expect(critMultiplier(2, 2.5)).toBeCloseTo(6.25)
  })

  it('never lets a crit lower damage', () => {
    expect(critMultiplier(1, 0.5)).toBe(1)
  })
})

describe('applyUpgrade', () => {
  it('adds each change to the stat', () => {
    const s = applyUpgrade({ ...base }, { damage: 3, size: 0.35, count: 1 })
    expect(s.damage).toBe(13)
    expect(s.size).toBeCloseTo(2.35)
    expect(s.count).toBe(2)
    expect(s.speed).toBe(20)
  })

  it('applies negative cooldown steps down to a floor', () => {
    const s = { ...base }
    applyUpgrade(s, { cooldown: -0.08 })
    expect(s.cooldown).toBeCloseTo(0.92)
    for (let i = 0; i < 40; i++) applyUpgrade(s, { cooldown: -0.08 })
    expect(s.cooldown).toBe(MIN_UPGRADED_COOLDOWN)
  })

  it('keeps counts whole and infinite pierce infinite', () => {
    const s = applyUpgrade({ ...base, pierce: Infinity }, { count: 1.6, bounces: 1.2, pierce: 1 })
    expect(s.count).toBe(3)
    expect(s.bounces).toBe(2)
    expect(s.pierce).toBe(Infinity)
  })

  it('ignores missing and non-finite changes', () => {
    const s = applyUpgrade({ ...base }, { damage: Number.NaN, range: undefined })
    expect(s.damage).toBe(10)
    expect(s.range).toBe(10)
  })

  it('mutates and returns the same object', () => {
    const s = { ...base }
    expect(applyUpgrade(s, { damage: 1 })).toBe(s)
  })
})

describe('describeWeaponChange', () => {
  it('reads like a card line', () => {
    expect(describeWeaponChange('damage', 3)).toBe('+3 Damage')
    expect(describeWeaponChange('cooldown', -0.08)).toBe('-0.08s Cooldown')
    expect(describeWeaponChange('critChance', 0.04)).toBe('+4% Crit Chance')
    expect(describeWeaponChange('count', 1)).toBe('+1 Projectiles')
    expect(describeWeaponChange('size', 0.35)).toBe('+0.35 Size')
  })
})
