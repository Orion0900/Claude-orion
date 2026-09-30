import { Rng } from '../core/rng'
import type { Offer } from '../game/types'
import {
  assignShrineKinds,
  challengeSize,
  CHARGE_TIME,
  chargeSpeed,
  chargeText,
  chestCost,
  forceLegendary,
  keyFreeChance,
  pickNearest,
  ringOffsets,
  rollPotLoot,
  SHRINE_COUNTS,
  stepCharge,
} from './rules'

describe('chestCost', () => {
  it('follows the design curve 25, 34, 43, 53', () => {
    expect([0, 1, 2, 3].map(chestCost)).toEqual([25, 34, 43, 53])
  })

  it('always rises', () => {
    for (let i = 0; i < 40; i++) expect(chestCost(i + 1)).toBeGreaterThan(chestCost(i))
  })

  it('treats bad input as zero paid', () => {
    expect(chestCost(-3)).toBe(25)
  })
})

describe('keyFreeChance', () => {
  it('is zero without keys and k/(k+1) with them', () => {
    expect(keyFreeChance(0)).toBe(0)
    expect(keyFreeChance(1)).toBeCloseTo(0.1 / 1.1)
    expect(keyFreeChance(10)).toBeCloseTo(0.5)
    expect(keyFreeChance(1000)).toBeLessThan(1)
    expect(keyFreeChance(NaN)).toBe(0)
  })
})

describe('charge shrines', () => {
  it('fill in three seconds inside the ring', () => {
    let p = 0
    for (let i = 0; i < 180; i++) p = stepCharge(p, true, 1 / 60)
    expect(p).toBeCloseTo(1, 5)
    expect(CHARGE_TIME).toBe(3)
  })

  it('drain twice as fast as they fill', () => {
    let p = 1
    for (let i = 0; i < 45; i++) p = stepCharge(p, false, 1 / 60)
    expect(p).toBeCloseTo(0.5, 5)
    expect(stepCharge(0.1, false, 1)).toBe(0)
  })

  it('never move on a zero or negative time step (a stray negative frame once filled every shrine)', () => {
    expect(stepCharge(0, false, -1.9)).toBe(0)
    expect(stepCharge(0.4, true, 0)).toBe(0.4)
    expect(stepCharge(0.4, false, Number.NaN)).toBe(0.4)
  })

  it('charge faster with the Wrench', () => {
    expect(chargeSpeed(0)).toBe(1)
    expect(chargeSpeed(1)).toBeCloseTo(1.2)
    expect(chargeSpeed(2)).toBeCloseTo(1.44)
    expect(stepCharge(0, true, 1, chargeSpeed(1))).toBeCloseTo(0.4)
  })

  it('never leaves 0..1', () => {
    expect(stepCharge(0.99, true, 10, 5)).toBe(1)
    expect(stepCharge(0, false, 10)).toBe(0)
  })

  it('shows whole percentages', () => {
    expect(chargeText(0.456)).toBe('Charging… 45%')
    expect(chargeText(1.2)).toBe('Charging… 100%')
  })
})

describe('rollPotLoot', () => {
  it('matches the design odds', () => {
    const rng = new Rng(3)
    const counts = { gold: 0, xp: 0, health: 0, none: 0 }
    const n = 20000
    for (let i = 0; i < n; i++) {
      const loot = rollPotLoot(rng, false)
      if (!loot) counts.none++
      else if (loot.kind === 'gold') {
        counts.gold++
        expect(loot.amount).toBeGreaterThanOrEqual(2)
        expect(loot.amount).toBeLessThanOrEqual(6)
      } else if (loot.kind === 'xp') {
        counts.xp++
        expect(loot.amount).toBe(5)
      } else if (loot.kind === 'health') {
        counts.health++
        expect(loot.amount).toBe(20)
      } else throw new Error('regular pots never drop silver')
    }
    expect(counts.gold / n).toBeCloseTo(0.6, 1)
    expect(counts.xp / n).toBeCloseTo(0.2, 1)
    expect(counts.health / n).toBeCloseTo(0.1, 1)
    expect(counts.none / n).toBeCloseTo(0.1, 1)
  })

  it('silver pots drop 1–3 silver', () => {
    const rng = new Rng(8)
    for (let i = 0; i < 500; i++) {
      const loot = rollPotLoot(rng, true)
      expect(loot?.kind).toBe('silver')
      expect(loot!.amount).toBeGreaterThanOrEqual(1)
      expect(loot!.amount).toBeLessThanOrEqual(3)
    }
  })
})

describe('assignShrineKinds', () => {
  it('places the design counts on a full map', () => {
    const kinds = assignShrineKinds(24, new Rng(1))
    expect(kinds).toHaveLength(24)
    for (const [kind, count] of Object.entries(SHRINE_COUNTS)) {
      expect(kinds.filter((k) => k === kind)).toHaveLength(count)
    }
  })

  it('keeps one of every kind on a small map', () => {
    const kinds = assignShrineKinds(6, new Rng(2))
    expect(kinds).toHaveLength(6)
    for (const kind of Object.keys(SHRINE_COUNTS)) expect(kinds).toContain(kind)
  })

  it('never places more than the design total', () => {
    expect(assignShrineKinds(40, new Rng(3))).toHaveLength(24)
    expect(assignShrineKinds(0, new Rng(3))).toHaveLength(0)
  })

  it('is deterministic per seed', () => {
    expect(assignShrineKinds(24, new Rng(5))).toEqual(assignShrineKinds(24, new Rng(5)))
  })
})

describe('challengeSize', () => {
  it('is 6 + 3 per stage', () => {
    expect([0, 1, 2].map(challengeSize)).toEqual([6, 9, 12])
  })
})

describe('forceLegendary', () => {
  it('rescales stat boons from their rolled rarity to legendary', () => {
    const offer: Offer = {
      type: 'stat',
      rarity: 'rare',
      label: 'Damage',
      mods: [
        { stat: 'damage', op: 'add', value: 0.08 * 1.4 },
        { stat: 'projectiles', op: 'add', value: 1 },
      ],
    }
    const out = forceLegendary(offer)
    expect(out.rarity).toBe('legendary')
    if (out.type !== 'stat') throw new Error('type changed')
    expect(out.mods[0].value).toBeCloseTo(0.16)
    expect(out.mods[1].value).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(out.mods[1].value)).toBe(true)
    // The input is left alone.
    expect(offer.rarity).toBe('rare')
    expect(offer.mods[0].value).toBeCloseTo(0.112)
  })

  it('leaves legendary offers untouched and relabels the rest', () => {
    const legendary: Offer = { type: 'item', id: 'anvil', rarity: 'legendary' }
    expect(forceLegendary(legendary)).toBe(legendary)
    expect(forceLegendary({ type: 'newTome', id: 'luck', rarity: 'common' }).rarity).toBe('legendary')
    const gold = forceLegendary({ type: 'gold', amount: 50, rarity: 'common' })
    expect(gold.type === 'gold' && gold.amount).toBe(100)
  })
})

describe('pickNearest', () => {
  it('picks the nearest usable thing within its own reach', () => {
    const a = { id: 'a', dist: 2, reach: 2.6, usable: true }
    const b = { id: 'b', dist: 1, reach: 2.6, usable: false }
    const c = { id: 'c', dist: 2.9, reach: 3, usable: true }
    const d = { id: 'd', dist: 1.5, reach: 1, usable: true }
    expect(pickNearest([a, b, c, d])?.id).toBe('a')
    expect(pickNearest([c, d])?.id).toBe('c')
    expect(pickNearest([b, d])).toBeNull()
  })

  it('ignores NaN and infinite distances', () => {
    expect(pickNearest([{ dist: NaN, reach: 3, usable: true }])).toBeNull()
    expect(pickNearest([{ dist: Infinity, reach: 3, usable: true }])).toBeNull()
  })
})

describe('ringOffsets', () => {
  it('spreads n points evenly at the radius', () => {
    const pts = ringOffsets(4, 2)
    expect(pts).toHaveLength(4)
    for (const [x, z] of pts) expect(Math.hypot(x, z)).toBeCloseTo(2)
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        expect(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])).toBeGreaterThan(2)
  })

  it('handles zero', () => {
    expect(ringOffsets(0, 3)).toEqual([])
  })
})
