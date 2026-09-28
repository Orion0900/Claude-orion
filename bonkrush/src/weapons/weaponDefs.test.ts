import { WEAPONS, WEAPON_BY_ID } from './weaponDefs'
import { WEAPON_STAT_KEYS } from './weaponMath'

const IDS = [
  'sword',
  'bone',
  'firestaff',
  'lightning',
  'aura',
  'chunkers',
  'bow',
  'revolver',
  'katana',
  'bananarang',
  'frostwalker',
  'flamewalker',
  'axe',
  'mines',
  'tornado',
  'dagger',
]

describe('WEAPONS', () => {
  it('has exactly the sixteen designed weapons', () => {
    expect(WEAPONS.map((w) => w.id).sort()).toEqual([...IDS].sort())
  })

  it('indexes every weapon by id', () => {
    for (const w of WEAPONS) expect(WEAPON_BY_ID[w.id]).toBe(w)
  })

  it('uses the weapon id as its behavior key', () => {
    for (const w of WEAPONS) expect(w.behavior).toBe(w.id)
  })

  it('fills every base stat with a number', () => {
    for (const w of WEAPONS) {
      for (const key of WEAPON_STAT_KEYS) expect(typeof w.base[key]).toBe('number')
      expect(w.base.cooldown).toBeGreaterThan(0)
      expect(w.base.count).toBeGreaterThanOrEqual(1)
      expect(w.base.size).toBeGreaterThan(0)
    }
  })

  it('has display data for cards and VFX', () => {
    for (const w of WEAPONS) {
      expect(w.name.length).toBeGreaterThan(0)
      expect(w.icon.length).toBeGreaterThan(0)
      expect(w.description.length).toBeGreaterThan(10)
      expect(w.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(Object.keys(w.upgrades).length).toBeGreaterThan(0)
    }
  })

  it('matches the design table', () => {
    expect(WEAPON_BY_ID.sword.name).toBe('Bonk Sword')
    expect(WEAPON_BY_ID.sword.base).toMatchObject({ damage: 16, cooldown: 1.1, size: 3.2, range: 4, knockback: 6 })
    expect(WEAPON_BY_ID.sword.base.pierce).toBe(Infinity)
    expect(WEAPON_BY_ID.bone.base).toMatchObject({ damage: 11, speed: 18, pierce: 1, bounces: 3, range: 20 })
    expect(WEAPON_BY_ID.lightning.name).toBe('Storm Rod')
    expect(WEAPON_BY_ID.chunkers.base).toMatchObject({ count: 2, speed: 2.4, range: 2.8, cooldown: 0.35 })
    expect(WEAPON_BY_ID.tornado.base.knockback).toBe(-4)
    expect(WEAPON_BY_ID.dagger.base.count).toBe(2)
    expect(WEAPON_BY_ID.mines.base).toMatchObject({ damage: 26, duration: 12, range: 1.2, size: 3 })
    expect(WEAPON_BY_ID.katana.base.critChance).toBe(0.25)
    expect(WEAPON_BY_ID.bow.base.critChance).toBe(0)
  })

  it('stores upgrade steps as signed stat deltas', () => {
    expect(WEAPON_BY_ID.firestaff.upgrades).toEqual({ damage: 3, size: 0.35, count: 1, cooldown: -0.08 })
    expect(WEAPON_BY_ID.lightning.upgrades.cooldown).toBe(-0.1)
    expect(WEAPON_BY_ID.aura.upgrades).toEqual({ damage: 1.4, size: 0.35 })
    expect(WEAPON_BY_ID.bow.upgrades.pierce).toBe(1)
  })
})
