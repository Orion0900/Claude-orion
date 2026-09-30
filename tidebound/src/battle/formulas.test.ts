import { Rng } from '../core/rng'
import {
  accuracyMultiplier,
  baseDamage,
  catchProbability,
  catchValue,
  critChance,
  critStages,
  damage,
  damageRange,
  hitChance,
  hpStat,
  levelForXp,
  multiHitCount,
  otherStat,
  rollCatch,
  runChance,
  shakeThreshold,
  stageMultiplier,
  statusCatchBonus,
  xpForLevel,
  xpShare,
  xpYield,
} from './formulas'

describe('stats', () => {
  it('HP = ⌊(2·base + IV)·L/100⌋ + L + 10', () => {
    expect(hpStat(50, 31, 50)).toBe(Math.floor((131 * 50) / 100) + 60)
    expect(hpStat(50, 31, 50)).toBe(125)
    expect(hpStat(1, 0, 1)).toBe(11)
    expect(hpStat(120, 31, 100)).toBe(271 + 110)
  })

  it('other stats = ⌊(2·base + IV)·L/100⌋ + 5', () => {
    expect(otherStat(100, 0, 100)).toBe(205)
    expect(otherStat(45, 15, 5)).toBe(10)
    expect(otherStat(62, 31, 5)).toBe(Math.floor((155 * 5) / 100) + 5)
  })
})

describe('stages', () => {
  it('uses halves for battle stats', () => {
    expect(stageMultiplier(0)).toBe(1)
    expect(stageMultiplier(1)).toBe(1.5)
    expect(stageMultiplier(2)).toBe(2)
    expect(stageMultiplier(6)).toBe(4)
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3)
    expect(stageMultiplier(-2)).toBe(0.5)
    expect(stageMultiplier(-6)).toBe(0.25)
    expect(stageMultiplier(9)).toBe(4)
  })

  it('uses thirds for accuracy and evasion', () => {
    expect(accuracyMultiplier(0)).toBe(1)
    expect(accuracyMultiplier(1)).toBeCloseTo(4 / 3)
    expect(accuracyMultiplier(-1)).toBe(0.75)
    expect(accuracyMultiplier(6)).toBe(3)
    expect(accuracyMultiplier(-6)).toBeCloseTo(1 / 3)
  })

  it('combines accuracy against evasion', () => {
    expect(hitChance(0, -6, 6)).toBe(1)
    expect(hitChance(100, 0, 0)).toBe(1)
    expect(hitChance(90, 0, 0)).toBeCloseTo(0.9)
    expect(hitChance(100, -1, 0)).toBe(0.75)
    expect(hitChance(100, 0, 1)).toBe(0.75)
    expect(hitChance(75, 1, 0)).toBe(1)
  })
})

describe('damage', () => {
  const base = { level: 50, power: 80, atk: 100, def: 100, stab: false, eff: 1, crit: false, burned: false }

  it('computes the base with the nested floors', () => {
    // ⌊2·50/5 + 2⌋ = 22; ⌊22·80·100/100⌋ = 1760; ⌊1760/50⌋ = 35; +2
    expect(baseDamage(50, 80, 100, 100)).toBe(37)
    expect(baseDamage(5, 40, 11, 10)).toBe(Math.floor(Math.floor((4 * 40 * 11) / 10) / 50) + 2)
  })

  it('applies STAB, effectiveness, criticals, the roll and burn in order', () => {
    expect(damage({ ...base, roll: 100 })).toBe(37)
    expect(damage({ ...base, stab: true, roll: 100 })).toBe(55)
    expect(damage({ ...base, stab: true, eff: 2, roll: 100 })).toBe(110)
    expect(damage({ ...base, stab: true, eff: 2, crit: true, roll: 100 })).toBe(220)
    expect(damage({ ...base, stab: true, eff: 2, crit: true, roll: 85 })).toBe(187)
    expect(damage({ ...base, stab: true, eff: 2, crit: true, burned: true, roll: 85 })).toBe(93)
    expect(damage({ ...base, eff: 0.5, roll: 100 })).toBe(18)
    expect(damage({ ...base, eff: 0.25, roll: 100 })).toBe(9)
  })

  it('ranges over 85–100% of the top roll', () => {
    const [lo, hi] = damageRange({ ...base, stab: true })
    expect(hi).toBe(55)
    expect(lo).toBe(Math.floor(55 * 0.85))
    for (let roll = 85; roll <= 100; roll++) {
      const d = damage({ ...base, stab: true, roll })
      expect(d).toBeGreaterThanOrEqual(lo)
      expect(d).toBeLessThanOrEqual(hi)
    }
  })

  it('STAB is 1.5x and a critical hit doubles', () => {
    const plain = damage({ ...base, roll: 100 })
    expect(damage({ ...base, stab: true, roll: 100 })).toBe(Math.floor(plain * 1.5))
    expect(damage({ ...base, crit: true, roll: 100 })).toBe(plain * 2)
  })

  it('is at least 1 unless the type has no effect', () => {
    expect(damage({ level: 1, power: 10, atk: 5, def: 400, stab: false, eff: 0.25, crit: false, burned: true, roll: 85 })).toBe(1)
    expect(damage({ ...base, eff: 0, roll: 100 })).toBe(0)
  })

  it('crits ignore the attacker\'s drops and the defender\'s boosts, but keep the rest', () => {
    expect(critStages(-2, 3)).toEqual([0, 0])
    expect(critStages(2, -3)).toEqual([2, -3])
    expect(critStages(-1, -1)).toEqual([0, -1])
  })

  it('crits land 1 in 16, or 1 in 8 for high-crit moves', () => {
    expect(critChance(false)).toBe(1 / 16)
    expect(critChance(true)).toBe(1 / 8)
  })
})

describe('experience', () => {
  it('follows the three curves', () => {
    expect(xpForLevel('medium', 10)).toBe(1000)
    expect(xpForLevel('fast', 10)).toBe(800)
    expect(xpForLevel('slow', 10)).toBe(1250)
    expect(xpForLevel('medium', 100)).toBe(1_000_000)
    expect(xpForLevel('slow', 100)).toBe(1_250_000)
    expect(xpForLevel('fast', 1)).toBe(0)
  })

  it('maps experience back to levels', () => {
    for (const g of ['fast', 'medium', 'slow'] as const) {
      for (let lv = 1; lv <= 100; lv++) {
        expect(levelForXp(g, xpForLevel(g, lv))).toBe(lv)
        if (lv > 1) expect(levelForXp(g, xpForLevel(g, lv) - 1)).toBe(lv - 1)
      }
      expect(levelForXp(g, 0)).toBe(1)
      expect(levelForXp(g, 99_999_999)).toBe(100)
    }
  })

  it('yields ⌊base·level/7⌋, ×1.5 from trainers, split among participants', () => {
    expect(xpYield(64, 5, false)).toBe(45)
    expect(xpYield(64, 5, true)).toBe(67)
    expect(xpShare(67, 2)).toBe(33)
    expect(xpShare(1, 3)).toBe(1)
    expect(xpShare(10, 0)).toBe(0)
  })
})

describe('catching', () => {
  it('computes a with the orb and status bonuses', () => {
    // Full HP: (3M − 2M)·rate/(3M) = rate/3.
    expect(catchValue(90, 90, 45, 1, null)).toBe(15)
    expect(catchValue(90, 90, 45, 2, null)).toBe(30)
    // One HP left nearly triples it.
    expect(catchValue(90, 1, 45, 1, null)).toBe(Math.floor((268 * 45) / 270))
    expect(catchValue(90, 1, 45, 1, 'par')).toBe(Math.floor(44 * 1.5))
    expect(catchValue(90, 1, 45, 1, 'slp')).toBe(88)
    expect(statusCatchBonus('frz')).toBe(2)
    expect(statusCatchBonus('psn')).toBe(1.5)
    expect(statusCatchBonus(null)).toBe(1)
  })

  it('catches for sure when a ≥ 255', () => {
    const rng = new Rng(1)
    const before = rng.next()
    const rng2 = new Rng(1)
    expect(rollCatch(255, rng2)).toEqual({ shakes: 3, caught: true })
    // No rolls are used for a sure catch.
    expect(rng2.next()).toBe(before)
    expect(catchValue(40, 1, 255, 1, 'slp')).toBeGreaterThanOrEqual(255)
    expect(catchProbability(300)).toBe(1)
  })

  it('has a shake threshold that rises with a', () => {
    expect(shakeThreshold(0)).toBe(0)
    let prev = 0
    for (let a = 1; a < 255; a++) {
      const b = shakeThreshold(a)
      expect(b).toBeGreaterThanOrEqual(prev)
      prev = b
    }
    expect(shakeThreshold(1)).toBe(Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680))))
  })

  it('lower HP and a status make a catch more likely', () => {
    const full = catchProbability(catchValue(100, 100, 45, 1, null))
    const low = catchProbability(catchValue(100, 5, 45, 1, null))
    const lowAsleep = catchProbability(catchValue(100, 5, 45, 1, 'slp'))
    expect(low).toBeGreaterThan(full)
    expect(lowAsleep).toBeGreaterThan(low)
    // The legendary barely budges at full HP with a plain orb.
    expect(catchProbability(catchValue(300, 300, 3, 1, null))).toBeLessThan(0.01)
  })

  it('matches the shake maths statistically', () => {
    const rng = new Rng(12345)
    for (const a of [5, 30, 120]) {
      const n = 20000
      let caught = 0
      const shakes = [0, 0, 0, 0]
      for (let i = 0; i < n; i++) {
        const r = rollCatch(a, rng)
        if (r.caught) caught++
        else shakes[r.shakes]++
        expect(r.shakes).toBeLessThanOrEqual(3)
      }
      expect(Math.abs(caught / n - catchProbability(a))).toBeLessThan(0.015)
      const p = shakeThreshold(a) / 65536
      // Breaking out after exactly k shakes has chance p^k·(1−p).
      for (let k = 0; k < 4; k++) expect(Math.abs(shakes[k] / n - p ** k * (1 - p))).toBeLessThan(0.015)
    }
  })
})

describe('running', () => {
  it('always works when you are at least as fast', () => {
    expect(runChance(50, 50, 1)).toBe(1)
    expect(runChance(80, 20, 1)).toBe(1)
  })

  it('otherwise improves with each attempt', () => {
    expect(runChance(50, 100, 1)).toBe((64 + 30) / 256)
    expect(runChance(50, 100, 2)).toBe((64 + 60) / 256)
    expect(runChance(10, 200, 9)).toBe(1)
  })
})

describe('multi-hit', () => {
  it('spreads 2–5 hits as 3:3:1:1', () => {
    const rng = new Rng(99)
    const counts: Record<number, number> = { 2: 0, 3: 0, 4: 0, 5: 0 }
    const n = 16000
    for (let i = 0; i < n; i++) counts[multiHitCount(2, 5, rng)]++
    expect(Math.abs(counts[2] / n - 3 / 8)).toBeLessThan(0.02)
    expect(Math.abs(counts[3] / n - 3 / 8)).toBeLessThan(0.02)
    expect(Math.abs(counts[4] / n - 1 / 8)).toBeLessThan(0.02)
    expect(Math.abs(counts[5] / n - 1 / 8)).toBeLessThan(0.02)
    expect(multiHitCount(2, 2, rng)).toBe(2)
  })
})
