import { Battle } from './Battle'
import { maxHp } from './creature'
import { xpYield } from './formulas'
import { move } from '../data/moves'
import { species } from '../data/species'
import { ALL_31, beast, lastPrompt, makeBag, play, strongest, texts } from './testkit'
import type { BattleEvent, BattleSetup, Creature } from './types'

function wild(party: Creature[], foe: Creature, extra: Partial<BattleSetup> = {}): Battle {
  return new Battle({ kind: 'wild', playerName: 'ORI', party, bag: makeBag(), foes: [foe], seed: 1, ...extra })
}

function knowing(id: Parameters<typeof beast>[0], level: number, moves: string[], extra: { seed?: number; item?: Creature['item'] } = {}): Creature {
  return beast(id, level, { ivs: ALL_31, moves, seed: extra.seed ?? 1, item: extra.item ?? null })
}

function turns(b: Battle, n: number): BattleEvent[] {
  const out = b.start()
  for (let i = 0; i < n; i++) {
    if (lastPrompt(out).kind !== 'action') break
    out.push(...b.choose({ kind: 'move', slot: 0 }))
  }
  return out
}

describe('held items', () => {
  it('a REEF BERRY is eaten once HP falls to half', () => {
    const foe = knowing('tubbara', 30, ['scowl'], { item: 'reefBerry' })
    const b = wild([knowing('volcaram', 34, ['bump'])], foe)
    const ev = turns(b, 6)
    expect(texts(ev).some((t) => t.includes('ate its REEF BERRY and regained HP'))).toBe(true)
    expect(foe.item).toBeNull()
    expect(ev.some((e) => e.t === 'item' && e.side === 'foe' && e.item === 'reefBerry')).toBe(true)
  })

  it('a MINT BERRY cures a status the moment it strikes', () => {
    const me = knowing('tubbara', 30, ['bump'], { item: 'mintBerry' })
    const b = wild([me], knowing('leafolin', 30, ['dozeDust']))
    let cured = false
    const ev = b.start()
    for (let i = 0; i < 8 && !cured; i++) {
      ev.push(...b.choose({ kind: 'move', slot: 0 }))
      cured = texts(ev).some((t) => t.includes('ate its MINT BERRY'))
    }
    expect(cured).toBe(true)
    expect(me.status).toBeNull()
    expect(me.item).toBeNull()
  })

  it('a MOSS WRAP restores a little HP every turn', () => {
    const me = knowing('tubbara', 30, ['scowl'], { item: 'mossWrap' })
    me.hp = Math.floor(maxHp(me) / 2)
    const b = wild([me], knowing('tubbara', 30, ['scowl']))
    const ev = turns(b, 2)
    expect(texts(ev).filter((t) => t.includes('with its MOSS WRAP')).length).toBe(2)
    expect(me.item).toBe('mossWrap')
  })

  it('a type booster powers up moves of its type', () => {
    const plain = wild([knowing('volcaram', 80, ['kilnBlast'])], knowing('wombastion', 80, ['bump']))
    plain.start()
    const boosted = wild([knowing('volcaram', 80, ['kilnBlast'], { item: 'cinderstone' })], knowing('wombastion', 80, ['bump']))
    boosted.start()
    const ratio = boosted.expectedDamage('player', move('kilnBlast')) / plain.expectedDamage('player', move('kilnBlast'))
    expect(ratio).toBeGreaterThan(1.05)
    expect(ratio).toBeLessThan(1.15)
  })

  it('a SHARE SHELL holder sitting out still earns half the experience', () => {
    const fighter = knowing('volcaram', 50, ['bump'])
    const bench = knowing('narlet', 10, ['bump'], { item: 'shareShell', seed: 2 })
    const foe = knowing('tubbara', 20, ['scowl'])
    const b = wild([fighter, bench], foe, { seed: 4 })
    const xp0 = bench.xp
    const r = play(b, strongest([fighter, bench]))
    expect(r.end.outcome).toBe('win')
    const total = xpYield(species('tubbara').xpYield, 20, false)
    expect(texts(r.events)).toContain(`NARLET gained ${Math.max(1, total - Math.floor(total / 2))} XP!`)
    expect(bench.xp).toBeGreaterThan(xp0)
    expect(Object.values(bench.evs).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })
})
