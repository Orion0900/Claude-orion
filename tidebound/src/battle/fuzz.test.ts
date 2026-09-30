import { Rng } from '../core/rng'
import { SPECIES_IDS } from '../data/dex'
import { item, ITEM_IDS, type ItemId } from '../data/items'
import { move } from '../data/moves'
import { species } from '../data/species'
import { Battle } from './Battle'
import { createCreature, itemWouldWork, maxHp } from './creature'
import { xpForLevel } from './formulas'
import { checkBatch, lastPrompt, makeBag, type TestBag } from './testkit'
import type { BattleEvent, BattleSetup, Choice, Creature, Prompt, StatusId, TrainerInfo } from './types'

const STATUSES: StatusId[] = ['psn', 'tox', 'brn', 'par', 'slp', 'frz']
const BATTLE_ITEMS: ItemId[] = ['salve', 'superSalve', 'hyperSalve', 'fullSalve', 'remedy', 'revivalSeed', 'ppDrop', 'orb', 'superOrb', 'hyperOrb', 'tideOrb', 'duskOrb']

interface Case {
  setup: BattleSetup
  party: Creature[]
  foes: Creature[]
  bag: TestBag
}

function randomCase(rng: Rng, seed: number): Case {
  const kind = rng.chance(0.55) ? 'wild' : 'trainer'
  const mk = () => createCreature(rng.pick(SPECIES_IDS), rng.int(2, 60), rng)
  const party = Array.from({ length: rng.int(1, 6) }, mk)
  for (let i = 1; i < party.length; i++) if (rng.chance(0.15)) party[i].hp = 0
  for (const c of party) {
    if (c.hp > 0 && rng.chance(0.2)) c.hp = rng.int(1, maxHp(c))
    if (c.hp > 0 && rng.chance(0.1)) {
      c.status = rng.pick(STATUSES)
      if (c.status === 'slp') c.sleepTurns = rng.int(1, 3)
    }
    if (rng.chance(0.1)) for (const s of c.moves) s.pp = rng.int(0, 2)
    // Many sit just short of a level, so battles level them up (and ask about moves).
    if (c.level < 100 && rng.chance(0.6)) c.xp = xpForLevel(species(c.species).growth, c.level + 1) - rng.int(1, 30)
  }
  const foes = kind === 'wild' ? [mk()] : Array.from({ length: rng.int(1, 6) }, mk)
  if (rng.chance(0.1)) for (const s of foes[0].moves) s.pp = rng.int(0, 1)
  const counts: Partial<Record<ItemId, number>> = {}
  for (const id of BATTLE_ITEMS) if (rng.chance(0.5)) counts[id] = rng.int(1, 3)
  const bag = makeBag(counts)
  const trainer: TrainerInfo | undefined =
    kind === 'trainer'
      ? {
          className: 'SAILOR',
          name: 'FUZZ',
          prize: rng.int(0, 120),
          ai: rng.chance(0.5) ? 'smart' : 'basic',
          items: (['salve', 'superSalve', 'hyperSalve', 'fullSalve', 'remedy'] as ItemId[]).filter(() => rng.chance(0.3)),
          loseText: 'Well played!',
        }
      : undefined
  const setup: BattleSetup = {
    kind,
    playerName: 'ORI',
    party,
    bag,
    foes,
    trainer,
    dark: rng.chance(0.3),
    noRun: kind === 'wild' && rng.chance(0.1),
    seed,
    playerMoney: rng.chance(0.5) ? rng.int(0, 5000) : undefined,
  }
  return { setup, party, foes, bag }
}

/** Any choice the menus could offer for this prompt. */
function randomChoice(rng: Rng, p: Prompt, b: Battle, c: Case): Choice {
  const v = b.view()
  if (p.kind === 'learn') return { kind: 'learn', forgetSlot: rng.chance(0.3) ? null : rng.int(0, 3) }
  const healthy = c.party.map((_, i) => i).filter((i) => c.party[i].hp > 0 && i !== v.active)
  if (p.kind === 'switch') return { kind: 'switch', partyIndex: rng.pick(healthy) }
  const r = rng.next()
  if (r < 0.08 && healthy.length) return { kind: 'switch', partyIndex: rng.pick(healthy) }
  if (r < 0.18) {
    const options: Choice[] = []
    for (const id of ITEM_IDS) {
      if (c.bag.count(id) <= 0 || !item(id).battle) continue
      if (item(id).use.kind === 'orb') {
        if (v.canCatch) options.push({ kind: 'item', item: id })
      } else {
        c.party.forEach((m, i) => {
          if (itemWouldWork(m, id)) options.push({ kind: 'item', item: id, partyIndex: i })
        })
      }
    }
    if (options.length) return rng.pick(options)
  }
  if (r < 0.22 && v.canRun) return { kind: 'run' }
  const withPp = v.moves.map((_, i) => i).filter((i) => v.moves[i].pp > 0)
  return { kind: 'move', slot: withPp.length ? rng.pick(withPp) : rng.int(0, 3) }
}

function checkEvents(events: BattleEvent[], c: Case): void {
  checkBatch(events)
  for (const e of events) {
    switch (e.t) {
      case 'hp':
        expect(e.from).toBeGreaterThanOrEqual(0)
        expect(e.to).toBeGreaterThanOrEqual(0)
        expect(e.from).toBeLessThanOrEqual(e.maxHp)
        expect(e.to).toBeLessThanOrEqual(e.maxHp)
        expect(e.from).not.toBe(e.to)
        break
      case 'xp':
        expect(e.from).toBeGreaterThanOrEqual(0)
        expect(e.to).toBeLessThanOrEqual(1)
        expect(e.to).toBeGreaterThanOrEqual(e.from)
        break
      case 'stat':
        expect(e.delta).not.toBe(0)
        expect(Math.abs(e.delta)).toBeLessThanOrEqual(12)
        break
      case 'send':
        expect((e.side === 'player' ? c.party : c.foes)[e.partyIndex]).toBeDefined()
        expect(e.view.hp).toBeGreaterThan(0)
        break
      case 'orb':
        expect(e.shakes).toBeGreaterThanOrEqual(0)
        expect(e.shakes).toBeLessThanOrEqual(3)
        break
      case 'msg':
        expect(e.text.length).toBeGreaterThan(0)
        expect(e.text).not.toMatch(/undefined|NaN|null/)
        break
      default:
        break
    }
  }
}

function checkState(b: Battle, c: Case): void {
  for (const m of [...c.party, ...c.foes]) {
    expect(m.hp).toBeGreaterThanOrEqual(0)
    expect(m.hp).toBeLessThanOrEqual(maxHp(m))
    expect(m.moves.length).toBeGreaterThanOrEqual(1)
    expect(m.moves.length).toBeLessThanOrEqual(4)
    expect(new Set(m.moves.map((s) => s.id)).size).toBe(m.moves.length)
    for (const s of m.moves) {
      expect(s.pp).toBeGreaterThanOrEqual(0)
      expect(s.pp).toBeLessThanOrEqual(move(s.id).pp)
    }
    if (m.status !== 'slp') expect(m.sleepTurns).toBe(0)
  }
  const v = b.view()
  expect(c.party[v.active]).toBeDefined()
  expect(v.moves.length).toBe(c.party[v.active].moves.length)
}

describe('fuzz', () => {
  it('always ends with an end prompt, never throws, and keeps every invariant', () => {
    const outcomes: Record<string, number> = {}
    let learnPrompts = 0
    let forcedSwitches = 0
    for (let n = 0; n < 400; n++) {
      const rng = new Rng(0xbeef + n * 7919)
      const c = randomCase(rng, n)
      const b = new Battle(c.setup)
      let events = b.start()
      checkEvents(events, c)
      checkState(b, c)
      let p = lastPrompt(events)
      let steps = 0
      while (p.kind !== 'end') {
        if (++steps > 5000) throw new Error(`battle ${n} did not end`)
        if (p.kind === 'learn') learnPrompts++
        if (p.kind === 'switch') {
          expect(p.forced).toBe(true)
          forcedSwitches++
        }
        events = b.choose(randomChoice(rng, p, b, c))
        checkEvents(events, c)
        checkState(b, c)
        p = lastPrompt(events)
      }
      outcomes[p.outcome] = (outcomes[p.outcome] ?? 0) + 1

      // The outcome agrees with the state.
      const alive = (list: Creature[]) => list.some((m) => m.hp > 0)
      if (p.outcome === 'win') expect(alive(c.foes)).toBe(false)
      if (p.outcome === 'lose') {
        expect(alive(c.party)).toBe(false)
        expect(alive(c.foes)).toBe(true)
        expect(p.money).toBe(c.setup.playerMoney ? -Math.floor(c.setup.playerMoney / 2) || 0 : 0)
      }
      if (p.outcome === 'caught') {
        expect(c.setup.kind).toBe('wild')
        expect(c.foes).toContain(p.caught)
        expect(p.caught?.ot).toBe('ORI')
      } else expect(p.caught).toBeUndefined()
      if (p.outcome === 'fled') expect(c.setup.kind).toBe('wild')
      if (p.outcome === 'win' && c.setup.kind === 'trainer') expect(p.money).toBe(c.setup.trainer!.prize * c.foes[c.foes.length - 1].level)
      else if (p.outcome !== 'lose') expect(p.money).toBe(0)
      expect(p.leveled).toEqual([...new Set(p.leveled)].sort((x, y) => x - y))
      for (const i of p.leveled) expect(c.party[i]).toBeDefined()
      expect(c.party.some((m) => m.status === 'tox')).toBe(false)

      // Once over, it stays over.
      expect(b.choose({ kind: 'move', slot: 0 })).toEqual([{ t: 'prompt', prompt: p }])
      expect(b.start()).toEqual([{ t: 'prompt', prompt: p }])
    }
    // The random battles really did cover the ground.
    for (const o of ['win', 'lose', 'fled', 'caught']) expect(outcomes[o], o).toBeGreaterThan(0)
    expect(learnPrompts).toBeGreaterThan(0)
    expect(forcedSwitches).toBeGreaterThan(0)
  })
})
