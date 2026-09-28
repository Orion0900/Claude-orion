import {
  conditionalMultiplier,
  idleBonus,
  lifestealHeal,
  mergeMod,
  procChance,
  soulCount,
  stackMods,
  vacuumInterval,
  type ConditionalStacks,
  type HitConditions,
} from './itemMath'

describe('procChance', () => {
  it('is the base chance for one stack at zero luck', () => {
    expect(procChance(0.12, 1, 0)).toBeCloseTo(0.12)
  })

  it('stacks like independent rolls and never reaches certainty', () => {
    expect(procChance(0.1, 2, 0)).toBeCloseTo(0.19)
    expect(procChance(0.1, 10, 0)).toBeLessThan(1)
  })

  it('luck scales it, capped at 1', () => {
    expect(procChance(0.1, 1, 1)).toBeCloseTo(0.2)
    expect(procChance(0.5, 3, 5)).toBe(1)
  })

  it('is zero without the item and ignores negative luck', () => {
    expect(procChance(0.5, 0, 1)).toBe(0)
    expect(procChance(0.1, 1, -3)).toBeCloseTo(0.1)
  })
})

describe('lifestealHeal', () => {
  it('rolls the fraction', () => {
    expect(lifestealHeal(0.3, 0.2)).toBe(1)
    expect(lifestealHeal(0.3, 0.5)).toBe(0)
  })

  it('always heals the whole part past 1', () => {
    expect(lifestealHeal(1.5, 0.9)).toBe(1)
    expect(lifestealHeal(1.5, 0.1)).toBe(2)
    expect(lifestealHeal(1.3, 0.2)).toBe(2)
    expect(lifestealHeal(1.3, 0.5)).toBe(1)
    expect(lifestealHeal(2, 0.99)).toBe(2)
    expect(lifestealHeal(5, 0)).toBe(5)
    expect(lifestealHeal(0, 0)).toBe(0)
  })
})

describe('item scaling', () => {
  it('idle juice ramps to +50% per stack over two seconds', () => {
    expect(idleBonus(0, 1)).toBe(0)
    expect(idleBonus(1, 1)).toBeCloseTo(0.25)
    expect(idleBonus(10, 2)).toBeCloseTo(1)
  })

  it('vacuum gets faster per stack down to 5 s', () => {
    expect(vacuumInterval(1)).toBe(15)
    expect(vacuumInterval(2)).toBe(13)
    expect(vacuumInterval(50)).toBe(5)
  })

  it('soul reaper adds a soul for every two extra stacks', () => {
    expect([0, 1, 2, 3, 4, 5].map(soulCount)).toEqual([0, 1, 1, 2, 2, 3])
  })
})

describe('conditionalMultiplier', () => {
  const none: ConditionalStacks = { glasses: 0, scarf: 0, knuckles: 0, idle: 0, beefy: 0, shroud: 0 }
  const hit: HitConditions = {
    enemyHpFrac: 1,
    airborne: true,
    distance: 2,
    stillSeconds: 5,
    maxHp: 200,
    shroudActive: true,
  }

  it('is 1 without items', () => {
    expect(conditionalMultiplier(none, hit)).toBe(1)
  })

  it('applies each item only under its condition', () => {
    expect(conditionalMultiplier({ ...none, glasses: 1 }, hit)).toBeCloseTo(1.25)
    expect(conditionalMultiplier({ ...none, glasses: 1 }, { ...hit, enemyHpFrac: 0.5 })).toBe(1)
    expect(conditionalMultiplier({ ...none, scarf: 1 }, { ...hit, airborne: false })).toBe(1)
    expect(conditionalMultiplier({ ...none, knuckles: 2 }, hit)).toBeCloseTo(1.5)
    expect(conditionalMultiplier({ ...none, knuckles: 2 }, { ...hit, distance: 6 })).toBe(1)
    expect(conditionalMultiplier({ ...none, beefy: 1 }, hit)).toBeCloseTo(1.2)
    expect(conditionalMultiplier({ ...none, shroud: 1 }, hit)).toBeCloseTo(2)
    expect(conditionalMultiplier({ ...none, shroud: 1 }, { ...hit, shroudActive: false })).toBe(1)
  })

  it('multiplies conditions together', () => {
    const m = conditionalMultiplier({ ...none, glasses: 1, scarf: 1 }, hit)
    expect(m).toBeCloseTo(1.25 * 1.3)
  })

  it('never returns NaN for a zero-HP build', () => {
    expect(conditionalMultiplier({ ...none, beefy: 1 }, { ...hit, maxHp: 0 })).toBe(1)
  })
})

describe('mods', () => {
  it('stacks adds linearly and multipliers by power', () => {
    const out = stackMods(
      [
        { stat: 'damage', op: 'add', value: 0.1 },
        { stat: 'size', op: 'mul', value: 1.1 },
      ],
      3,
    )
    expect(out[0].value).toBeCloseTo(0.3)
    expect(out[1].value).toBeCloseTo(1.331)
    expect(stackMods([{ stat: 'damage', op: 'add', value: 1 }], 0)).toEqual([])
  })

  it('merges same stat and op into one entry without touching the input', () => {
    const src = { stat: 'damage' as const, op: 'add' as const, value: 0.1 }
    const list = mergeMod(mergeMod([], src), src)
    mergeMod(list, { stat: 'luck', op: 'add', value: 0.07 })
    expect(list).toHaveLength(2)
    expect(list[0].value).toBeCloseTo(0.2)
    expect(src.value).toBe(0.1)
  })
})
