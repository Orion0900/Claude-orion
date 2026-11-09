import { Rng } from '../core/rng'
import type { ItemId } from '../data/items'
import { move as moveData } from '../data/moves'
import { Battle } from './Battle'
import { calcStats, gainXp, makeCritter, maxHp, restore } from './creature'
import { calcHpStat, calcStat, critChance, damage, hitChance, hpDv, levelForXp, rollCatch, stageMultiplier, xpForLevel } from './formulas'
import type { BattleEvent, BattleSetup, Critter, Prompt } from './types'

const bag = (items: Partial<Record<ItemId, number>> = {}) => {
  const counts: Partial<Record<ItemId, number>> = { ...items }
  return {
    count: (id: ItemId) => counts[id] ?? 0,
    remove: (id: ItemId, n = 1) => {
      counts[id] = (counts[id] ?? 0) - n
    },
    counts,
  }
}

const mk = (id: Parameters<typeof makeCritter>[0], level: number, seed = 1, moves?: Parameters<typeof makeCritter>[2]['moves']) =>
  makeCritter(id, level, { rng: new Rng(seed), moves, dvs: { atk: 8, def: 8, spd: 8, spc: 8 }, shiny: false })

function setup(party: Critter[], foes: Critter[], extra: Partial<BattleSetup> = {}): BattleSetup {
  return { kind: 'wild', playerName: 'ORION', party, foes, bag: bag(), seed: 42, ...extra }
}

function lastPrompt(events: BattleEvent[]): Prompt {
  const e = events[events.length - 1]
  if (e.t !== 'prompt') throw new Error(`expected a prompt, got ${e.t}`)
  return e.prompt
}

const texts = (events: BattleEvent[]) => events.filter((e) => e.t === 'msg').map((e) => (e as { text: string }).text)

/** Plays a battle by always picking the first move (or the first healthy switch) until it ends. */
function autoplay(b: Battle, maxTurns = 300): { events: BattleEvent[]; end: Prompt } {
  let all = b.start()
  for (let i = 0; i < maxTurns; i++) {
    const p = lastPrompt(all)
    if (p.kind === 'end') return { events: all, end: p }
    let ev: BattleEvent[]
    if (p.kind === 'action') {
      // The strongest move with PP left.
      const moves = b.view().moves
      let slot = 0
      moves.forEach((m, i) => {
        if (m.pp > 0 && (moves[slot].pp <= 0 || moveData(m.id).power > moveData(moves[slot].id).power)) slot = i
      })
      ev = b.choose({ kind: 'move', slot })
    } else if (p.kind === 'switch') {
      const idx = (b as unknown as { s: BattleSetup }).s.party.findIndex((c, j) => c.hp > 0 && j !== b.view().active)
      ev = b.choose({ kind: 'switch', partyIndex: idx })
    } else ev = b.choose({ kind: 'learn', forgetSlot: null })
    all = all.concat(ev)
  }
  throw new Error('battle did not end')
}

describe('formulas', () => {
  it('builds the HP determinant from the low bits', () => {
    expect(hpDv({ atk: 15, def: 14, spd: 13, spc: 12 })).toBe(0b1010)
    expect(hpDv({ atk: 1, def: 1, spd: 1, spc: 1 })).toBe(15)
  })

  it('computes stats the classic way', () => {
    // Base 100, DV 15, no stat exp, level 50: ((100+15)*2)*50/100 + 5 = 120.
    expect(calcStat(100, 15, 0, 50)).toBe(120)
    expect(calcHpStat(100, 15, 0, 50)).toBe(115 + 50 + 10)
    // Maxed stat exp adds 64 points before scaling.
    expect(calcStat(100, 15, 65535, 100)).toBe(Math.floor(((115 * 2 + 64) * 100) / 100) + 5)
  })

  it('has experience curves that agree with their inverses', () => {
    for (const g of ['fast', 'mediumFast', 'mediumSlow', 'slow'] as const) {
      expect(xpForLevel(g, 1)).toBe(0)
      for (let lv = 2; lv <= 100; lv++) {
        expect(xpForLevel(g, lv)).toBeGreaterThan(xpForLevel(g, lv - 1))
        expect(levelForXp(g, xpForLevel(g, lv))).toBe(lv)
        expect(levelForXp(g, xpForLevel(g, lv) - 1)).toBe(lv - 1)
      }
    }
    expect(xpForLevel('mediumFast', 100)).toBe(1_000_000)
  })

  it('deals more damage with type advantage, STAB and crits', () => {
    const base = { level: 30, power: 60, attack: 60, defense: 60, stab: false, eff: 1, crit: false, roll: 255 }
    const plain = damage(base)
    expect(damage({ ...base, stab: true })).toBeGreaterThan(plain)
    expect(damage({ ...base, eff: 2 })).toBeGreaterThan(plain)
    expect(damage({ ...base, eff: 0.5 })).toBeLessThan(plain)
    expect(damage({ ...base, crit: true })).toBeGreaterThan(plain * 1.6)
    expect(damage({ ...base, eff: 0 })).toBe(0)
    expect(damage({ ...base, roll: 217 })).toBeLessThan(plain)
  })

  it('uses the stage table', () => {
    expect(stageMultiplier(0)).toBe(1)
    expect(stageMultiplier(2)).toBe(2)
    expect(stageMultiplier(-2)).toBe(0.5)
    expect(stageMultiplier(9)).toBe(4)
    expect(hitChance(100, 0, 0)).toBe(1)
    expect(hitChance(100, -1, 0)).toBeCloseTo(0.66)
    expect(hitChance(0, -6, 6)).toBe(1)
  })

  it('makes fast critters land more critical hits', () => {
    expect(critChance(100, false, false)).toBeCloseTo(50 / 256)
    expect(critChance(40, false, false)).toBeLessThan(critChance(100, false, false))
    expect(critChance(100, true, false)).toBeCloseTo(255 / 256)
  })

  it('catches more easily when the critter is weak', () => {
    const rng = new Rng(7)
    let full = 0
    let low = 0
    for (let i = 0; i < 2000; i++) {
      if (rollCatch(100, 100, 45, 1, null, rng).caught) full++
      if (rollCatch(100, 1, 45, 1, 'slp', rng).caught) low++
    }
    expect(low).toBeGreaterThan(full * 3)
    expect(rollCatch(100, 100, 3, 0, null, rng)).toEqual({ shakes: 3, caught: true })
  })
})

describe('critters', () => {
  it('start with the last four moves of their learnset', () => {
    const c = mk('pandle', 13)
    expect(c.moves.map((m) => m.id)).toEqual(['swipe', 'snarl', 'cinder', 'quickDash'])
    expect(c.hp).toBe(maxHp(c))
  })

  it('level up with experience and keep the HP they lost', () => {
    const c = mk('marmlet', 5)
    c.hp -= 3
    const steps = gainXp(c, 1000)
    expect(steps.length).toBeGreaterThan(0)
    expect(c.level).toBe(steps[steps.length - 1].level)
    expect(maxHp(c) - c.hp).toBe(3)
    restore(c)
    expect(c.hp).toBe(calcStats(c).hp)
  })
})

describe('battle', () => {
  it('opens a wild battle and asks for an action', () => {
    const b = new Battle(setup([mk('pandle', 5)], [mk('rooklet', 3, 2)]))
    const ev = b.start()
    expect(texts(ev)[0]).toBe('A wild ROOKLET appeared!')
    expect(texts(ev)).toContain('Go, PANDLE!')
    expect(lastPrompt(ev)).toEqual({ kind: 'action' })
  })

  it('opens a trainer battle with the trainer and their party', () => {
    const b = new Battle(
      setup([mk('pandle', 5)], [mk('rooklet', 3, 2), mk('marmlet', 4, 3)], {
        kind: 'trainer',
        trainer: { className: 'YOUNGSTER', name: 'JORY', prize: 15, ai: 'basic', loseText: 'Aw, man!' },
      }),
    )
    const ev = b.start()
    expect(ev[0]).toMatchObject({ t: 'trainerParty', alive: [true, true] })
    expect(texts(ev)[0]).toBe('YOUNGSTER JORY is up for a battle!')
  })

  it('plays wild battles to the end and awards experience', () => {
    const me = mk('pandle', 12)
    const b = new Battle(setup([me], [mk('rooklet', 3, 9)]))
    const xp = me.xp
    const { end, events } = autoplay(b)
    expect(end).toMatchObject({ kind: 'end', outcome: 'win' })
    expect(me.xp).toBeGreaterThan(xp)
    expect(texts(events).some((t) => t.includes('earned') && t.includes('XP'))).toBe(true)
  })

  it('pays out prize money for beating a trainer', () => {
    const b = new Battle(
      setup([mk('pandle', 20)], [mk('rooklet', 5, 2), mk('marmlet', 6, 3)], {
        kind: 'trainer',
        trainer: { className: 'YOUNGSTER', name: 'JORY', prize: 15, ai: 'basic', loseText: 'Aw, man!' },
      }),
    )
    const { end, events } = autoplay(b)
    expect(end).toMatchObject({ kind: 'end', outcome: 'win', money: 15 * 6 })
    expect(texts(events)).toContain('Aw, man!')
  })

  it('makes the player switch after a faint, and loses when nothing is left', () => {
    const party = [mk('grublet', 2), mk('grublet', 2, 5)]
    const b = new Battle(setup(party, [mk('pyronda', 60, 3)], { playerMoney: 1000 }))
    const { end, events } = autoplay(b)
    expect(events.some((e) => e.t === 'prompt' && e.prompt.kind === 'switch')).toBe(true)
    expect(end).toMatchObject({ kind: 'end', outcome: 'lose', money: -500 })
  })

  it('catches a weakened critter with a capsule', () => {
    const items = bag({ omniCapsule: 1 })
    const b = new Battle(setup([mk('pandle', 10)], [mk('rooklet', 4, 2)], { bag: items }))
    b.start()
    const ev = b.choose({ kind: 'item', item: 'omniCapsule' })
    const end = lastPrompt(ev)
    expect(end.kind).toBe('end')
    if (end.kind === 'end') {
      expect(end.outcome).toBe('caught')
      expect(end.caught?.species).toBe('rooklet')
    }
    expect(items.counts.omniCapsule).toBe(0)
  })

  it("won't let a capsule take a trainer's critter", () => {
    const items = bag({ capsule: 2 })
    const b = new Battle(
      setup([mk('pandle', 10)], [mk('rooklet', 4, 2)], {
        kind: 'trainer',
        bag: items,
        trainer: { className: 'LASS', name: 'MIRA', prize: 15, ai: 'basic', loseText: '' },
      }),
    )
    b.start()
    const ev = b.choose({ kind: 'item', item: 'capsule' })
    expect(texts(ev).join(' ')).toContain('knocked it away')
    expect(lastPrompt(ev).kind).toBe('action')
  })

  it('refuses to run from trainers but lets you flee wild critters', () => {
    const t = new Battle(
      setup([mk('pandle', 10)], [mk('rooklet', 4, 2)], { kind: 'trainer', trainer: { className: 'LASS', name: 'MIRA', prize: 15, ai: 'basic', loseText: '' } }),
    )
    t.start()
    expect(texts(t.choose({ kind: 'run' }))).toContain("You can't run from a trainer!")
    const w = new Battle(setup([mk('amparoo', 40)], [mk('grublet', 2, 2)]))
    w.start()
    const ev = w.choose({ kind: 'run' })
    expect(lastPrompt(ev)).toMatchObject({ kind: 'end', outcome: 'fled' })
  })

  it('asks before replacing a move when four are known', () => {
    // MARMLET learns CHOMP at 14; give it four moves first.
    const me = mk('marmlet', 13, 1, ['bump', 'stare', 'quickDash', 'focus'])
    const b = new Battle(setup([me], [mk('rooklet', 12, 5)]))
    let ev = b.start()
    let asked = false
    for (let i = 0; i < 100; i++) {
      const p = lastPrompt(ev)
      if (p.kind === 'end') break
      if (p.kind === 'learn') {
        asked = true
        expect(p.move).toBe('chomp')
        ev = b.choose({ kind: 'learn', forgetSlot: 1 })
        continue
      }
      if (p.kind === 'switch') throw new Error('unexpected switch')
      ev = b.choose({ kind: 'move', slot: 0 })
    }
    if (me.level >= 14) {
      expect(asked).toBe(true)
      expect(me.moves.map((m) => m.id)).toEqual(['bump', 'chomp', 'quickDash', 'focus'])
    }
  })

  it('never crashes in long random battles', () => {
    const rng = new Rng(99)
    const ids = ['pandle', 'dipple', 'sproth', 'rooklet', 'glimwisp', 'musebox', 'hoardling', 'coilet', 'tarsight', 'punchrimp'] as const
    for (let n = 0; n < 60; n++) {
      const party = [0, 1, 2].map((k) => makeCritter(rng.pick(ids), rng.int(5, 60), { rng: rng.fork(n * 7 + k) }))
      const foes = [0, 1].map((k) => makeCritter(rng.pick(ids), rng.int(5, 60), { rng: rng.fork(n * 13 + k) }))
      const b = new Battle(
        setup(party, foes, {
          kind: n % 2 ? 'trainer' : 'wild',
          seed: n,
          trainer: n % 2 ? { className: 'ACE', name: 'TEST', prize: 50, ai: n % 4 === 1 ? 'smart' : 'basic', items: ['superTonic'], loseText: '' } : undefined,
          bag: bag({ tonic: 5 }),
        }),
      )
      if (n % 2 === 0) b['s'].foes.splice(1)
      let ev = b.start()
      for (let i = 0; i < 400; i++) {
        const p = lastPrompt(ev)
        if (p.kind === 'end') break
        if (p.kind === 'action') {
          const r = rng.int(0, 9)
          const v = b.view()
          if (r === 0) ev = b.choose({ kind: 'item', item: 'tonic', partyIndex: v.active })
          else if (r === 1) {
            const k = party.findIndex((c, j) => c.hp > 0 && j !== v.active)
            ev = k >= 0 ? b.choose({ kind: 'switch', partyIndex: k }) : b.choose({ kind: 'move', slot: 0 })
          } else ev = b.choose({ kind: 'move', slot: rng.int(0, v.moves.length - 1) })
        } else if (p.kind === 'switch') ev = b.choose({ kind: 'switch', partyIndex: party.findIndex((c) => c.hp > 0) })
        else ev = b.choose({ kind: 'learn', forgetSlot: rng.chance(0.5) ? 0 : null })
        for (const e of ev) if (e.t === 'hp') expect(e.to).toBeGreaterThanOrEqual(0)
      }
      for (const c of [...party, ...foes]) {
        expect(c.hp).toBeGreaterThanOrEqual(0)
        expect(c.hp).toBeLessThanOrEqual(maxHp(c))
      }
    }
  })
})
