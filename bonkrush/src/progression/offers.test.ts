import { Rng } from '../core/rng'
import type { ItemDef, Offer, Rarity, TomeDef, WeaponDef, WeaponStats } from '../game/types'
import {
  banishKey,
  cooldownFloor,
  levelUpCandidates,
  rollChestItem,
  rollLevelUpOffers,
  rollShrineOffers,
  rollWeaponUpgrade,
  upgradeStep,
  WEAPON_MAX_LEVEL,
  type LevelUpInput,
  type OwnedWeapon,
} from './offers'
import { RARITY_MULT } from './rarity'
import { TOMES } from './tomeDefs'

const baseStats: WeaponStats = {
  damage: 10,
  cooldown: 1,
  count: 1,
  size: 1,
  speed: 10,
  duration: 1,
  pierce: 1,
  bounces: 0,
  range: 20,
  knockback: 1,
  critChance: 0,
}

function weapon(id: string, upgrades: WeaponDef['upgrades'], extra: Partial<WeaponDef> = {}): WeaponDef {
  return {
    id,
    name: id,
    icon: '*',
    color: '#fff',
    description: '',
    behavior: 'test',
    base: { ...baseStats },
    upgrades,
    ...extra,
  }
}

const WEAPONS: WeaponDef[] = [
  weapon('sword', { damage: 3, size: 0.3, critChance: 0.04, count: 1 }),
  weapon('bow', { damage: 3, pierce: 1, count: 1, critChance: 0.04 }),
  weapon('staff', { damage: 3, size: 0.35, count: 1, cooldown: -0.08 }),
  weapon('aura', { damage: 1.4, size: 0.35 }),
  weapon('secret', { damage: 1 }, { locked: true }),
]

const owned = (def: WeaponDef, level = 1, stats: Partial<WeaponStats> = {}): OwnedWeapon => ({
  def,
  level,
  stats: { ...def.base, ...stats },
})

function input(over: Partial<LevelUpInput> = {}): LevelUpInput {
  return {
    weaponPool: WEAPONS,
    tomePool: TOMES,
    weapons: [owned(WEAPONS[0])],
    maxWeapons: 4,
    tomes: [],
    maxTomes: 4,
    banished: new Set(),
    luck: 0,
    anvil: false,
    level: 5,
    maxHp: 100,
    ...over,
  }
}

const target = (o: Offer) => banishKey(o) ?? o.type

describe('level-up offers', () => {
  it('offers 3 cards, 4 at 100% luck', () => {
    expect(rollLevelUpOffers(input(), new Rng(1))).toHaveLength(3)
    expect(rollLevelUpOffers(input({ luck: 1 }), new Rng(1))).toHaveLength(4)
  })

  it('never repeats a target in one roll', () => {
    const rng = new Rng(2)
    for (let i = 0; i < 300; i++) {
      const offers = rollLevelUpOffers(input({ luck: 1 }), rng)
      expect(new Set(offers.map(target)).size).toBe(offers.length)
    }
  })

  it('weights owned things double', () => {
    const c = levelUpCandidates(input({ tomes: [{ def: TOMES[0], level: 3 }] }))
    expect(c.find((x) => x.id === 'sword')).toMatchObject({ type: 'weaponUpgrade', weight: 2 })
    expect(c.find((x) => x.id === 'damage')).toMatchObject({ type: 'tomeUpgrade', weight: 2 })
    expect(c.find((x) => x.id === 'bow')).toMatchObject({ type: 'newWeapon', weight: 1 })
    expect(c.find((x) => x.id === 'luck')).toMatchObject({ type: 'newTome', weight: 1 })
  })

  it('skips new weapons and tomes once the slots are full', () => {
    const full = input({
      weapons: WEAPONS.slice(0, 4).map((w) => owned(w)),
      tomes: TOMES.slice(0, 4).map((def) => ({ def, level: 1 })),
    })
    const types = new Set(levelUpCandidates(full).map((c) => c.type))
    expect(types.has('newWeapon')).toBe(false)
    expect(types.has('newTome')).toBe(false)
    expect(types.has('weaponUpgrade')).toBe(true)
    expect(types.has('tomeUpgrade')).toBe(true)
  })

  it('leaves out locked, banished and maxed things', () => {
    const plenty = TOMES.find((t) => t.id === 'quantity')!
    const c = levelUpCandidates(
      input({
        weapons: [owned(WEAPONS[0], WEAPON_MAX_LEVEL)],
        tomes: [{ def: plenty, level: 10 }],
        banished: new Set(['weapon:bow', 'tome:luck']),
      }),
    )
    const ids = c.map((x) => x.id)
    expect(ids).not.toContain('secret')
    expect(ids).not.toContain('bow')
    expect(ids).not.toContain('luck')
    expect(ids).not.toContain('sword')
    expect(ids).not.toContain('quantity')
  })

  it('falls back to gold and a heal when nothing is left', () => {
    const offers = rollLevelUpOffers(
      input({
        weaponPool: [WEAPONS[0]],
        tomePool: [TOMES[0]],
        weapons: [owned(WEAPONS[0], WEAPON_MAX_LEVEL)],
        tomes: [{ def: TOMES[0], level: 99 }],
      }),
      new Rng(5),
    )
    expect(offers.map((o) => o.type)).toEqual(['gold', 'heal'])
    for (const o of offers) if (o.type === 'gold' || o.type === 'heal') expect(o.amount).toBeGreaterThan(0)
  })

  it('is reproducible from the seed', () => {
    expect(rollLevelUpOffers(input(), new Rng(77))).toEqual(rollLevelUpOffers(input(), new Rng(77)))
  })
})

describe('weapon upgrades', () => {
  const sword = WEAPONS[0]
  const staff = WEAPONS[2]

  it('common raises 1–2 stats, better rarities 2, Anvil 3', () => {
    const rng = new Rng(3)
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) seen.add(Object.keys(rollWeaponUpgrade(sword, sword.base, 'common', rng, false)).length)
    expect([...seen].sort()).toEqual([1, 2])
    for (const r of ['uncommon', 'rare', 'epic', 'legendary'] as Rarity[])
      expect(Object.keys(rollWeaponUpgrade(sword, sword.base, r, rng, false))).toHaveLength(2)
    expect(Object.keys(rollWeaponUpgrade(sword, sword.base, 'common', rng, true))).toHaveLength(3)
  })

  it('scales steps by the rarity multiplier', () => {
    expect(upgradeStep(sword, sword.base, 'damage', 'rare')).toBeCloseTo(3 * RARITY_MULT.rare)
    expect(upgradeStep(sword, sword.base, 'size', 'epic')).toBeCloseTo(0.3 * RARITY_MULT.epic)
  })

  it('steps counts by 1, or 2 at legendary', () => {
    expect(upgradeStep(sword, sword.base, 'count', 'epic')).toBe(1)
    expect(upgradeStep(sword, sword.base, 'count', 'legendary')).toBe(2)
    expect(upgradeStep(WEAPONS[1], WEAPONS[1].base, 'pierce', 'common')).toBe(1)
  })

  it('never takes the cooldown under 20% of base', () => {
    const floor = cooldownFloor(staff)
    expect(upgradeStep(staff, { ...staff.base, cooldown: floor + 0.01 }, 'cooldown', 'legendary')).toBeCloseTo(-0.01)
    // At the floor the cooldown is no longer offered at all.
    const rng = new Rng(8)
    for (let i = 0; i < 100; i++) {
      const changes = rollWeaponUpgrade(staff, { ...staff.base, cooldown: floor }, 'legendary', rng, true)
      expect(changes.cooldown).toBeUndefined()
    }
  })

  it('drops pierce once it is infinite', () => {
    const bow = WEAPONS[1]
    const rng = new Rng(12)
    for (let i = 0; i < 100; i++)
      expect(rollWeaponUpgrade(bow, { ...bow.base, pierce: Infinity }, 'rare', rng, true).pierce).toBeUndefined()
  })
})

describe('shrine offers', () => {
  it('gives 3 distinct stat boons without curse, silver or projectiles', () => {
    const rng = new Rng(21)
    for (let i = 0; i < 200; i++) {
      const offers = rollShrineOffers({ tomePool: TOMES, banished: new Set(), luck: 0.3 }, rng)
      expect(offers).toHaveLength(3)
      const stats = offers.flatMap((o) => (o.type === 'stat' ? o.mods.map((m) => m.stat) : []))
      expect(new Set(stats).size).toBe(3)
      for (const s of stats) expect(['difficulty', 'silverGain', 'projectiles']).not.toContain(s)
    }
  })

  it('scales the tome step and labels it', () => {
    const might = TOMES.find((t) => t.id === 'damage')!
    const [offer] = rollShrineOffers({ tomePool: [might], banished: new Set(), luck: 0, forceRarity: 'legendary' }, new Rng(1))
    expect(offer).toMatchObject({ type: 'stat', rarity: 'legendary', label: '+16% Damage' })
    if (offer.type === 'stat') expect(offer.mods[0].value).toBeCloseTo(0.16)
  })

  it('wrench bumps the rarity', () => {
    const might: TomeDef[] = [TOMES[0]]
    const rng = new Rng(4)
    let bumped = 0
    for (let i = 0; i < 300; i++) {
      const [o] = rollShrineOffers({ tomePool: might, banished: new Set(), luck: 0, bumpChance: 1 }, rng)
      if (o.rarity !== 'common') bumped++
    }
    expect(bumped).toBe(300)
  })
})

describe('chest items', () => {
  const item = (id: string, rarity: Rarity, extra: Partial<ItemDef> = {}): ItemDef => ({
    id,
    name: id,
    icon: '*',
    rarity,
    description: '',
    ...extra,
  })

  it('picks an item of the rolled rarity', () => {
    const pool = [item('a', 'common'), item('b', 'rare'), item('c', 'epic'), item('d', 'legendary')]
    const rng = new Rng(6)
    for (let i = 0; i < 200; i++) {
      const o = rollChestItem({ itemPool: pool, banished: new Set(), luck: 0 }, rng)!
      expect(o.type).toBe('item')
      expect(pool.find((p) => o.type === 'item' && p.id === o.id)?.rarity).toBe(o.rarity)
    }
  })

  it('falls back to the nearest rarity that has items', () => {
    const rng = new Rng(7)
    for (let i = 0; i < 100; i++) {
      const o = rollChestItem({ itemPool: [item('only', 'rare')], banished: new Set(), luck: 0 }, rng)
      expect(o).toEqual({ type: 'item', id: 'only', rarity: 'rare' })
    }
  })

  it('never gives locked or banished items', () => {
    const pool = [item('a', 'common'), item('b', 'common', { locked: true }), item('c', 'common')]
    const rng = new Rng(8)
    for (let i = 0; i < 100; i++) {
      const o = rollChestItem({ itemPool: pool, banished: new Set(['item:c']), luck: 0 }, rng)
      expect(o).toMatchObject({ id: 'a' })
    }
    expect(rollChestItem({ itemPool: [], banished: new Set(), luck: 0 }, rng)).toBeNull()
  })
})
