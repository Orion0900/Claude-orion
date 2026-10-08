import { SPECIES_IDS } from '../data/dex'
import { move } from '../data/moves'
import { ABILITY_IDS, ALL_ABILITIES, ability, SPECIES_ABILITY } from './abilities'
import { Battle } from './Battle'
import { maxHp } from './creature'
import { ALL_31, beast, lastPrompt, makeBag, texts } from './testkit'
import type { BattleEvent, BattleSetup, Creature } from './types'

function wild(party: Creature[], foe: Creature, extra: Partial<BattleSetup> = {}): Battle {
  return new Battle({ kind: 'wild', playerName: 'ORI', party, bag: makeBag(), foes: [foe], seed: 1, ...extra })
}

/** A beast that only knows `moves`. */
function knowing(id: Parameters<typeof beast>[0], level: number, moves: string[], seed = 1): Creature {
  return beast(id, level, { ivs: ALL_31, moves, seed })
}

/** Runs `turns` turns using slot 0 for the player (the foe picks for itself). */
function turns(b: Battle, n: number): BattleEvent[] {
  const out = b.start()
  for (let i = 0; i < n; i++) {
    const p = lastPrompt(out)
    if (p.kind !== 'action') break
    out.push(...b.choose({ kind: 'move', slot: 0 }))
  }
  return out
}

describe('ability data', () => {
  it('gives every species an ability with a name and a description', () => {
    for (const id of SPECIES_IDS) {
      const a = ability(SPECIES_ABILITY[id])
      expect(a.name.length).toBeLessThanOrEqual(11)
      expect(a.desc.length).toBeGreaterThan(10)
    }
    expect(new Set(ALL_ABILITIES.map((a) => a.name)).size).toBe(ABILITY_IDS.length)
  })

  it('gives the three starter lines a pinch boost for their own type', () => {
    expect(ability(SPECIES_ABILITY.leafolin).pinch).toBe('leaf')
    expect(ability(SPECIES_ABILITY.kindlet).pinch).toBe('flame')
    expect(ability(SPECIES_ABILITY.narlet).pinch).toBe('tide')
  })
})

describe('abilities in battle', () => {
  it('MENACE lowers the foe ATTACK as it comes out', () => {
    const b = wild([knowing('brandger', 20, ['bump'])], knowing('tubbara', 20, ['bump']))
    const ev = b.start()
    expect(ev).toContainEqual({ t: 'stat', side: 'foe', stat: 'atk', delta: -1 })
    expect(texts(ev).some((t) => t.includes('MENACE'))).toBe(true)
  })

  it('STEELNERVE shrugs off MENACE and stat-lowering moves', () => {
    const b = wild([knowing('brandger', 20, ['bump'])], knowing('sawfry', 20, ['bump']))
    const ev = b.start()
    expect(ev.some((e) => e.t === 'stat')).toBe(false)
    expect(texts(ev).some((t) => t.includes('STEELNERVE prevents stat loss'))).toBe(true)
  })

  it('STORMCALLER brings rain, which powers up TIDE moves', () => {
    const me = knowing('narlet', 30, ['spritz'])
    const dry = wild([me], knowing('tubbara', 30, ['bump']))
    dry.start()
    const plain = dry.expectedDamage('player', move('spritz'))
    const wet = wild([knowing('narlet', 30, ['spritz'])], knowing('tempestwyrm', 30, ['bump']))
    const ev = wet.start()
    expect(ev).toContainEqual({ t: 'weather', weather: 'rain' })
    // Against a different foe, so compare through the weather multiplier on a neutral target instead.
    expect(plain).toBeGreaterThan(0)
    const tub = knowing('tubbara', 30, ['bump'])
    const rainy = wild([knowing('narlet', 30, ['downpour', 'spritz'])], tub)
    rainy.start()
    const before = rainy.expectedDamage('player', move('spritz'))
    rainy.choose({ kind: 'move', slot: 0 })
    const after = rainy.expectedDamage('player', move('spritz'))
    expect(after).toBeGreaterThan(before * 1.3)
  })

  it('SOAKUP turns TIDE moves into healing', () => {
    const foe = knowing('clionette', 20, ['bump'])
    foe.hp = Math.floor(maxHp(foe) / 2)
    const b = wild([knowing('narlet', 30, ['spritz'])], foe)
    const ev = turns(b, 1)
    const healed = ev.filter((e) => e.t === 'hp' && e.side === 'foe')
    expect(healed.length).toBeGreaterThan(0)
    expect(foe.hp).toBeGreaterThan(Math.floor(maxHp(foe) / 2))
    expect(texts(ev).some((t) => t.includes('SOAKUP'))).toBe(true)
  })

  it('HOVER floats clear of EARTH moves', () => {
    const foe = knowing('tatterling', 20, ['bump'])
    const b = wild([knowing('wombit', 30, ['tremor'])], foe)
    const hp = foe.hp
    const ev = turns(b, 1)
    expect(foe.hp).toBe(hp)
    expect(texts(ev).some((t) => t.includes('HOVER'))).toBe(true)
  })

  it('WAKEFUL cannot be put to sleep', () => {
    const foe = knowing('lumigrub', 20, ['bump'])
    const b = wild([knowing('leafolin', 30, ['dozeDust'])], foe)
    const ev = turns(b, 3)
    expect(foe.status).not.toBe('slp')
    expect(texts(ev).some((t) => t.includes('keeps it awake'))).toBe(true)
  })

  it('STEADFAST holds on at 1 HP from full health', () => {
    const foe = knowing('pebblit', 5, ['bump'])
    const b = wild([knowing('volcaram', 70, ['tremor'])], foe)
    const ev = turns(b, 1)
    expect(foe.hp).toBe(1)
    expect(texts(ev).some((t) => t.includes('held on with STEADFAST'))).toBe(true)
  })

  it('HARDSHELL never takes a lucky strike', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const foe = knowing('wombastion', 60, ['bump'], seed)
      const b = wild([knowing('frondolin', 40, ['frondSlash'], seed)], foe, { seed })
      const ev = turns(b, 4)
      expect(ev.some((e) => e.t === 'hp' && e.side === 'foe' && e.crit)).toBe(false)
    }
  })

  it('SPARKSKIN can paralyse a beast that touches it', () => {
    let paralysed = 0
    for (let seed = 1; seed <= 40; seed++) {
      const me = knowing('tubbara', 40, ['bump'], seed)
      const b = wild([me], knowing('zappet', 40, ['bump'], seed), { seed })
      turns(b, 2)
      if (me.status === 'par') paralysed++
    }
    expect(paralysed).toBeGreaterThan(3)
    expect(paralysed).toBeLessThan(35)
  })

  it('QUICKENING raises SPEED every turn', () => {
    const b = wild([knowing('volcaram', 60, ['bump'])], knowing('driftwyrm', 60, ['scowl']))
    const ev = turns(b, 2)
    expect(ev.filter((e) => e.t === 'stat' && e.side === 'foe' && e.stat === 'spe' && e.delta === 1).length).toBe(2)
  })

  it('pinch abilities hit 1.5x harder at a third of max HP', () => {
    const me = knowing('leafolin', 30, ['seedFlick'])
    const b = wild([me], knowing('tubbara', 30, ['bump']))
    b.start()
    const full = b.expectedDamage('player', move('seedFlick'))
    me.hp = Math.floor(maxHp(me) / 3)
    const low = b.expectedDamage('player', move('seedFlick'))
    expect(low / full).toBeGreaterThan(1.35)
  })
})

describe('weather', () => {
  it('DOWNPOUR rains for five turns, then stops', () => {
    const b = wild([knowing('narwhelm', 40, ['downpour'])], knowing('tubbara', 40, ['scowl']))
    const ev = turns(b, 6)
    expect(texts(ev)).toContain('It started to rain!')
    expect(texts(ev)).toContain('The rain stopped.')
    expect(ev).toContainEqual({ t: 'weather', weather: null })
  })

  it('DEWDRINKER slowly heals in the rain', () => {
    const me = knowing('dugling', 40, ['downpour'])
    me.hp = Math.floor(maxHp(me) / 2)
    const b = wild([me], knowing('tubbara', 40, ['scowl']))
    const hp = me.hp
    turns(b, 2)
    expect(me.hp).toBeGreaterThan(hp)
  })

  it('SUNBATHE heals more under harsh sun', () => {
    const me = knowing('frondolin', 40, ['dryspell', 'sunbathe'])
    const b = wild([me], knowing('tubbara', 40, ['scowl']))
    b.start()
    b.choose({ kind: 'move', slot: 0 })
    me.hp = 1
    const ev = b.choose({ kind: 'move', slot: 1 })
    const heal = ev.find((e) => e.t === 'hp' && e.side === 'player' && e.to > e.from)
    expect(heal && heal.t === 'hp' ? heal.to - heal.from : 0).toBe(Math.floor((maxHp(me) * 2) / 3))
  })
})

describe('ability text', () => {
  it('every description fits the two lines the summary gives it', async () => {
    const { wrap } = await import('../ui/font')
    const { ABILITY_TEXT_W } = await import('../scenes/SummaryScene')
    for (const a of ALL_ABILITIES) expect(wrap(a.desc, ABILITY_TEXT_W).length, a.id).toBeLessThanOrEqual(2)
  })
})
