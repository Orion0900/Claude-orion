import { IFRAMES, SHIELD_DELAY, knockbackSpeed, rechargeShield, resolveHeal, resolveHit } from './vitals'

describe('vitals', () => {
  it('applies armor, then the shield', () => {
    expect(resolveHit(100, 0.25, 0)).toEqual({ total: 75, absorbed: 0, toHp: 75 })
    expect(resolveHit(100, 0, 30)).toEqual({ total: 100, absorbed: 30, toHp: 70 })
    expect(resolveHit(20, 0.5, 30)).toEqual({ total: 10, absorbed: 10, toHp: 0 })
  })

  it('caps armor at 80% and ignores bad input', () => {
    expect(resolveHit(100, 5, 0).total).toBeCloseTo(20)
    expect(resolveHit(-5, 0, 10)).toEqual({ total: 0, absorbed: 0, toHp: 0 })
    expect(resolveHit(Number.NaN, Number.NaN, Number.NaN)).toEqual({ total: 0, absorbed: 0, toHp: 0 })
  })

  it('heals to max and turns overflow into shield with overheal', () => {
    expect(resolveHeal(90, 100, 0, 25, 0)).toEqual({ hp: 100, shield: 0, healed: 10, shieldGained: 0 })
    const over = resolveHeal(90, 100, 0, 25, 0.5)
    expect(over.hp).toBe(100)
    expect(over.shield).toBeCloseTo(7.5)
  })

  it('never lets overheal push the shield past max HP, but keeps a bigger natural shield', () => {
    expect(resolveHeal(100, 100, 95, 1000, 1).shield).toBe(100)
    expect(resolveHeal(100, 100, 150, 1000, 1).shield).toBe(150)
    expect(resolveHeal(50, 100, 0, 0, 1)).toEqual({ hp: 50, shield: 0, healed: 0, shieldGained: 0 })
  })

  it('recharges the shield only after the delay, at 20%/s', () => {
    expect(rechargeShield(0, 50, SHIELD_DELAY - 0.1, 1)).toBe(0)
    expect(rechargeShield(0, 50, SHIELD_DELAY, 1)).toBeCloseTo(10)
    expect(rechargeShield(45, 50, 10, 1)).toBe(50)
    expect(rechargeShield(80, 50, 10, 1)).toBe(80)
    expect(rechargeShield(0, 0, 10, 1)).toBe(0)
  })

  it('knocks harder for bigger hits, within limits', () => {
    expect(knockbackSpeed(0)).toBeGreaterThan(0)
    expect(knockbackSpeed(30)).toBeGreaterThan(knockbackSpeed(5))
    expect(knockbackSpeed(1e6)).toBeLessThanOrEqual(10)
    expect(IFRAMES).toBe(0.5)
  })
})
