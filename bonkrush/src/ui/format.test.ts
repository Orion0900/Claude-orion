import type { DefLookups } from './format'
import {
  barShares,
  bestStageLabel,
  controlsHint,
  describeOffer,
  describeWeaponChange,
  formatCount,
  formatNumber,
  formatTime,
  fraction,
  objectiveLabel,
  promptLabel,
  sumMods,
  timerKey,
  timerLabel,
  weaponChangeLines,
  weaponStatRows,
} from './format'
import type { WeaponStats } from '../game/types'

const BASE: WeaponStats = {
  damage: 14,
  cooldown: 1.4,
  count: 1,
  size: 2.5,
  speed: 16,
  duration: 3,
  pierce: 1,
  bounces: 0,
  range: 25,
  knockback: 4,
  critChance: 0,
}

const LOOK: DefLookups = {
  weapon: (id) =>
    id === 'firestaff' ? { name: 'Firestaff', icon: '🔥', description: 'Fireball at target.', base: BASE } : undefined,
  tome: (id) =>
    id === 'damage'
      ? { name: 'Tome of Might', icon: '📕', description: '', perLevel: [{ stat: 'damage', op: 'add', value: 0.08 }] }
      : id === 'chaos'
        ? { name: 'Tome of Chaos', icon: '🌀', description: '+1 random stat step each level', perLevel: [] }
        : undefined,
  item: (id) => (id === 'clover' ? { name: 'Four-Leaf Clover', icon: '🍀', description: 'luck +7%' } : undefined),
  weaponLevel: (id) => (id === 'firestaff' ? 3 : 0),
  tomeLevel: (id) => (id === 'damage' ? 5 : 0),
  itemStacks: (id) => (id === 'clover' ? 2 : 0),
}

describe('formatTime', () => {
  it('pads seconds and drops hours under an hour', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(65.9)).toBe('1:05')
    expect(formatTime(600)).toBe('10:00')
  })

  it('shows hours for long runs', () => {
    expect(formatTime(3723)).toBe('1:02:03')
  })

  it('treats negative and broken input as zero', () => {
    expect(formatTime(-4)).toBe('0:00')
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(Infinity)).toBe('0:00')
  })
})

describe('formatCount', () => {
  it('keeps small numbers whole', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(12.9)).toBe('12')
  })

  it('abbreviates thousands and millions, rounding down', () => {
    expect(formatCount(1000)).toBe('1k')
    expect(formatCount(1500)).toBe('1.5k')
    expect(formatCount(12345)).toBe('12.3k')
    expect(formatCount(4100)).toBe('4.1k')
    expect(formatCount(1999)).toBe('1.9k')
    expect(formatCount(123456)).toBe('123k')
    expect(formatCount(999999)).toBe('999k')
    expect(formatCount(1234567)).toBe('1.2M')
    expect(formatCount(2.5e9)).toBe('2.5B')
  })

  it('handles negatives and garbage', () => {
    expect(formatCount(-1500)).toBe('-1.5k')
    expect(formatCount(NaN)).toBe('0')
  })
})

describe('formatNumber / fraction', () => {
  it('trims to two decimals', () => {
    expect(formatNumber(3)).toBe('3')
    expect(formatNumber(2.5)).toBe('2.5')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(1.234)).toBe('1.23')
    expect(formatNumber(Infinity)).toBe('∞')
    expect(formatNumber(-0.001)).toBe('0')
  })

  it('clamps bar fractions and survives a zero maximum', () => {
    expect(fraction(50, 100)).toBe(0.5)
    expect(fraction(150, 100)).toBe(1)
    expect(fraction(-5, 100)).toBe(0)
    expect(fraction(5, 0)).toBe(0)
    expect(fraction(NaN, 10)).toBe(0)
  })
})

describe('timer', () => {
  it('counts down in whole seconds, starting at the full duration', () => {
    expect(timerKey(0, 600)).toBe(600)
    expect(timerKey(0.2, 600)).toBe(600)
    expect(timerKey(1, 600)).toBe(599)
    expect(timerLabel(timerKey(0, 600)).text).toBe('10:00')
    expect(timerLabel(timerKey(599.5, 600)).text).toBe('0:01')
  })

  it('flags the last half minute as urgent', () => {
    expect(timerLabel(31).urgent).toBe(false)
    expect(timerLabel(30).urgent).toBe(true)
  })

  it('switches to the final swarm at zero and counts up', () => {
    const atZero = timerLabel(timerKey(600, 600))
    expect(atZero.swarm).toBe(true)
    expect(atZero.text).toBe('FINAL SWARM')
    expect(atZero.sub).toBe('+0:00')
    expect(timerLabel(timerKey(600 + 83.4, 600)).sub).toBe('+1:23')
    // Each displayed second is a distinct key.
    expect(timerKey(600.5, 600)).not.toBe(timerKey(601.5, 600))
  })
})

describe('promptLabel', () => {
  it('names the key and the cost', () => {
    expect(promptLabel({ text: 'Open chest', cost: 34 }, false, 50)).toEqual({
      text: 'E — Open chest · 34 🪙',
      affordable: true,
    })
  })

  it('is unaffordable when gold is short, and says Tap on touch', () => {
    const p = promptLabel({ text: 'Open chest', cost: 34 }, true, 33.9)
    expect(p.text).toBe('Tap ✋ — Open chest · 34 🪙')
    expect(p.affordable).toBe(false)
  })

  it('leaves the cost out for free things', () => {
    expect(promptLabel({ text: 'Summon the boss' }, false, 0)).toEqual({ text: 'E — Summon the boss', affordable: true })
    expect(promptLabel({ text: 'Open chest', cost: 0 }, false, 0).text).toBe('E — Open chest')
  })
})

describe('weapon lines', () => {
  it('describes each change with units', () => {
    expect(describeWeaponChange('damage', 3)).toBe('+3 Damage')
    expect(describeWeaponChange('count', 1)).toBe('+1 Projectiles')
    expect(describeWeaponChange('cooldown', -0.08)).toBe('-0.08s Cooldown')
    expect(describeWeaponChange('critChance', 0.04)).toBe('+4% Crit Chance')
    expect(describeWeaponChange('size', 0.42)).toBe('+0.42 Size')
  })

  it('lists changes in a stable order and skips zeros', () => {
    expect(weaponChangeLines({ size: 0.3, damage: 3.6, bounces: 0 })).toEqual(['+3.6 Damage', '+0.3 Size'])
  })

  it('makes stat rows without zero entries', () => {
    const rows = weaponStatRows({ ...BASE, pierce: Infinity })
    expect(rows[0]).toEqual(['Damage', '14'])
    expect(rows).toContainEqual(['Cooldown', '1.4s'])
    expect(rows).toContainEqual(['Pierce', '∞'])
    expect(rows.find(([l]) => l === 'Bounces')).toBeUndefined()
  })
})

describe('sumMods', () => {
  it('folds adds and muls per stat', () => {
    expect(
      sumMods([
        { stat: 'damage', op: 'add', value: 0.08 },
        { stat: 'damage', op: 'add', value: 0.1 },
        { stat: 'size', op: 'mul', value: 1.1 },
        { stat: 'size', op: 'mul', value: 1.1 },
      ]).map((m) => [m.stat, m.op, Math.round(m.value * 1000) / 1000]),
    ).toEqual([
      ['damage', 'add', 0.18],
      ['size', 'mul', 1.21],
    ])
  })

  it('does not mutate its input', () => {
    const mods = [{ stat: 'luck' as const, op: 'add' as const, value: 1 }]
    sumMods([...mods, ...mods])
    expect(mods[0].value).toBe(1)
  })
})

describe('describeOffer', () => {
  it('shows a new weapon with its headline numbers', () => {
    const v = describeOffer({ type: 'newWeapon', id: 'firestaff', rarity: 'common' }, LOOK)
    expect(v.name).toBe('Firestaff')
    expect(v.tag).toBe('NEW!')
    expect(v.isNew).toBe(true)
    expect(v.lines).toEqual(['14 Damage', '1.4s Cooldown'])
    expect(v.description).toBe('Fireball at target.')
  })

  it('shows a weapon upgrade as its level step and changes', () => {
    const v = describeOffer(
      { type: 'weaponUpgrade', id: 'firestaff', rarity: 'rare', changes: { damage: 4.2, count: 1 } },
      LOOK,
    )
    expect(v.tag).toBe('Lv 3 → 4')
    expect(v.lines).toEqual(['+4.2 Damage', '+1 Projectiles'])
    expect(v.rarity).toBe('rare')
  })

  it('scales tome mods by rarity', () => {
    const common = describeOffer({ type: 'newTome', id: 'damage', rarity: 'common' }, LOOK)
    expect(common.lines).toEqual(['+8% Damage'])
    const legendary = describeOffer({ type: 'tomeUpgrade', id: 'damage', rarity: 'legendary' }, LOOK)
    expect(legendary.lines).toEqual(['+16% Damage'])
    expect(legendary.tag).toBe('Lv 5 → 6')
  })

  it('falls back to the description for a tome without fixed mods', () => {
    const v = describeOffer({ type: 'newTome', id: 'chaos', rarity: 'epic' }, LOOK)
    expect(v.lines).toEqual([])
    expect(v.description).toBe('+1 random stat step each level')
  })

  it('describes shrine boons from their mods', () => {
    const v = describeOffer(
      { type: 'stat', rarity: 'epic', label: 'Might', mods: [{ stat: 'damage', op: 'add', value: 0.064 }] },
      LOOK,
    )
    // Named after the stat, not the label (which repeats the lines).
    expect(v.name).toBe('Damage')
    expect(v.icon).toBe('💪')
    expect(v.lines).toEqual(['+6.4% Damage'])
  })

  it('names multi-stat boons without repeating their lines', () => {
    const mods = [
      { stat: 'maxHp', op: 'add', value: 20 },
      { stat: 'regen', op: 'add', value: 0.5 },
    ] as const
    const v = describeOffer({ type: 'stat', rarity: 'rare', label: 'x', mods: [...mods] }, LOOK)
    expect(v.name).toBe('Max HP & HP Regen')
    expect(v.lines).toHaveLength(2)
    expect(describeOffer({ type: 'stat', rarity: 'rare', label: 'x', mods: [] }, LOOK).name).toBe('Boon')
  })

  it('shows item stacks, and NEW for a first copy', () => {
    expect(describeOffer({ type: 'item', id: 'clover', rarity: 'common' }, LOOK).tag).toBe('×2')
    const first = describeOffer({ type: 'item', id: 'unknown_thing', rarity: 'rare' }, LOOK)
    expect(first.tag).toBe('NEW!')
    expect(first.name).toBe('unknown_thing')
  })

  it('handles gold and heal offers', () => {
    expect(describeOffer({ type: 'gold', amount: 1500, rarity: 'common' }, LOOK).lines).toEqual(['+1.5k Gold'])
    expect(describeOffer({ type: 'heal', amount: 25, rarity: 'common' }, LOOK).lines).toEqual(['Heal 25 HP'])
  })

  it('survives unknown ids', () => {
    const v = describeOffer({ type: 'weaponUpgrade', id: 'nope', rarity: 'common', changes: {} }, LOOK)
    expect(v.name).toBe('nope')
    expect(v.tag).toBe('Upgrade')
    expect(v.lines).toEqual([])
  })
})

describe('objective and controls', () => {
  it('walks the stage goal from altar to boss to portal', () => {
    expect(objectiveLabel({ bossSpawned: false, portalOpen: false })).toEqual({ text: '☠ Altar: summon the boss', kind: 'altar' })
    expect(objectiveLabel({ bossSpawned: true, portalOpen: false }).kind).toBe('boss')
    expect(objectiveLabel({ bossSpawned: true, portalOpen: true })).toEqual({ text: 'Portal open!', kind: 'portal' })
  })

  it('lists every slide key and no longer mentions Ctrl', () => {
    const desk = controlsHint(false)
    expect(desk).toContain('Shift / C / right mouse slide')
    expect(desk).not.toMatch(/ctrl/i)
    expect(controlsHint(true)).toContain('slide')
  })
})

describe('misc', () => {
  it('scales damage bars to the largest value', () => {
    expect(barShares([50, 100, 0])).toEqual([0.5, 1, 0])
    expect(barShares([0, 0])).toEqual([0, 0])
    expect(barShares([])).toEqual([])
    expect(barShares([NaN, 10])).toEqual([0, 1])
  })

  it('names the best stage', () => {
    expect(bestStageLabel(0, 3, 0)).toBe('—')
    expect(bestStageLabel(0, 3, 2)).toBe('Stage 1')
    expect(bestStageLabel(2, 3, 5)).toBe('Stage 3')
    expect(bestStageLabel(3, 3, 5)).toBe('Victory!')
  })
})
