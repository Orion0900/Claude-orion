import { species } from '../data/species'
import { Battle } from './Battle'
import { maxHp } from './creature'
import { catchProbability, catchValue, xpForLevel, xpYield } from './formulas'
import { ALL_0, ALL_31, beast, lastPrompt, makeBag, play, strongest, texts, type Policy } from './testkit'
import type { BattleEvent, BattleSetup, Creature, Prompt, TrainerInfo } from './types'

const HECTOR: TrainerInfo = { className: 'SAILOR', name: 'HECTOR', prize: 30, ai: 'basic', loseText: 'Ahoy... you win.' }

function wild(party: Creature[], foe: Creature, extra: Partial<BattleSetup> = {}): Battle {
  return new Battle({ kind: 'wild', playerName: 'ORI', party, bag: makeBag(), foes: [foe], seed: 1, ...extra })
}

function versus(party: Creature[], foes: Creature[], trainer: TrainerInfo = HECTOR, extra: Partial<BattleSetup> = {}): Battle {
  return new Battle({ kind: 'trainer', playerName: 'ORI', party, bag: makeBag(), foes, trainer, seed: 1, ...extra })
}

const slot0: Policy = (p) => (p.kind === 'learn' ? { kind: 'learn', forgetSlot: null } : { kind: 'move', slot: 0 })

type EndPrompt = Extract<Prompt, { kind: 'end' }>
const asEnd = (p: Prompt): EndPrompt => {
  if (p.kind !== 'end') throw new Error(`expected end, got ${p.kind}`)
  return p
}

function hpEvents(events: BattleEvent[], side: 'player' | 'foe') {
  return events.filter((e): e is Extract<BattleEvent, { t: 'hp' }> => e.t === 'hp' && e.side === side)
}

describe('opening', () => {
  it('announces a wild beast, then sends out the first healthy party beast', () => {
    const fainted = beast('kindlet', 5)
    fainted.hp = 0
    const me = beast('narlet', 5)
    const foe = beast('tubbara', 3)
    const b = wild([fainted, me], foe)
    const ev = b.start()
    expect(ev.map((e) => e.t)).toEqual(['send', 'msg', 'msg', 'send', 'prompt'])
    expect(ev[0]).toMatchObject({ t: 'send', side: 'foe', partyIndex: 0, view: { name: 'TUBBARA', level: 3, xpFraction: 0 } })
    expect(texts(ev)).toEqual(['A wild TUBBARA leapt out!', 'Go for it, NARLET!'])
    expect(ev[3]).toMatchObject({ t: 'send', side: 'player', partyIndex: 1 })
    expect(lastPrompt(ev)).toEqual({ kind: 'action' })
    expect(b.view()).toMatchObject({ active: 1, canRun: true, canCatch: true, player: { name: 'NARLET' }, foe: { name: 'TUBBARA' } })
    expect(b.view().moves.map((m) => m.name)).toEqual(['BUMP', 'CHIRRUP', 'SPRITZ'])
    // Asking again just repeats the prompt.
    expect(b.start()).toEqual([{ t: 'prompt', prompt: { kind: 'action' } }])
  })

  it('opens a trainer battle with the challenge and the party balls', () => {
    const b = versus([beast('narlet', 8)], [beast('pufflet', 6), beast('tubbara', 7)])
    const ev = b.start()
    expect(texts(ev)).toEqual(['SAILOR HECTOR challenges you to a battle!', 'SAILOR HECTOR called out PUFFLET!', 'Go for it, NARLET!'])
    expect(ev).toContainEqual({ t: 'trainerParty', remaining: 2 })
    expect(b.view()).toMatchObject({ canRun: false, canCatch: false })
  })

  it('reports whether running is allowed', () => {
    expect(wild([beast('narlet', 8)], beast('atollus', 50), { noRun: true }).view().canRun).toBe(false)
  })
})

describe('wild battles', () => {
  it('wins, awarding experience to the beast that fought', () => {
    const me = beast('volcaram', 50, { ivs: ALL_31 })
    const foe = beast('tubbara', 3)
    const b = wild([me], foe, { seed: 7 })
    const xp0 = me.xp
    const r = play(b, strongest([me]))
    expect(r.end).toEqual({ kind: 'end', outcome: 'win', money: 0, leveled: [] })
    const t = texts(r.events)
    expect(t).toContain('VOLCARAM used MOLTEN RAM!')
    expect(t).toContain('Wild TUBBARA was knocked out!')
    const gain = xpYield(species('tubbara').xpYield, 3, false)
    expect(t).toContain(`VOLCARAM gained ${gain} XP!`)
    expect(me.xp).toBe(xp0 + gain)
    expect(r.events).toContainEqual({ t: 'faint', side: 'foe' })
    const xp = r.events.find((e) => e.t === 'xp')
    expect(xp).toMatchObject({ t: 'xp', partyIndex: 0, from: 0, level: 50 })
  })

  it('catches a weakened, sleeping beast for sure', () => {
    const me = beast('leafolin', 10)
    const foe = beast('tubbara', 5)
    foe.hp = 1
    foe.status = 'slp'
    foe.sleepTurns = 3
    const bag = makeBag({ orb: 3 })
    const b = wild([me], foe, { bag, seed: 11 })
    b.start()
    const ev = b.choose({ kind: 'item', item: 'orb' })
    expect(ev).toContainEqual({ t: 'orb', item: 'orb', shakes: 3, caught: true })
    expect(texts(ev)).toEqual(['ORI threw an ORB!', 'Yes! TUBBARA is yours!'])
    const end = asEnd(lastPrompt(ev))
    expect(end).toMatchObject({ outcome: 'caught', money: 0, leveled: [] })
    expect(end.caught).toBe(foe)
    expect(foe.ot).toBe('ORI')
    expect(bag.counts.orb).toBe(2)
    // The battle is over; further choices only repeat the end.
    expect(b.choose({ kind: 'run' })).toEqual([{ t: 'prompt', prompt: end }])
  })

  it('applies the TIDE ORB and DUSK ORB bonuses', () => {
    // A full-HP beast with catch rate 255 has a = 85 with a plain ORB; the bonus takes it to 255+.
    const tide = wild([beast('narlet', 10)], beast('twigling', 5), { bag: makeBag({ tideOrb: 1 }) })
    tide.start()
    expect(tide.choose({ kind: 'item', item: 'tideOrb' })).toContainEqual({ t: 'orb', item: 'tideOrb', shakes: 3, caught: true })
    const dusk = wild([beast('narlet', 10)], beast('tubbara', 5), { bag: makeBag({ duskOrb: 1 }), dark: true })
    dusk.start()
    expect(dusk.choose({ kind: 'item', item: 'duskOrb' })).toContainEqual({ t: 'orb', item: 'duskOrb', shakes: 3, caught: true })
  })

  it('catches about as often as the formula says', () => {
    const n = 400
    let caught = 0
    let a = 0
    for (let seed = 1; seed <= n; seed++) {
      const foe = beast('zappet', 8, { seed })
      a = catchValue(maxHp(foe), foe.hp, species('zappet').catchRate, 1, null)
      const b = wild([beast('narlet', 10, { seed })], foe, { bag: makeBag({ orb: 1 }), seed })
      b.start()
      const ev = b.choose({ kind: 'item', item: 'orb' })
      const orb = ev.find((e) => e.t === 'orb')
      expect(orb).toBeDefined()
      if (orb?.t === 'orb' && orb.caught) caught++
      if (orb?.t === 'orb' && !orb.caught) expect(texts(ev).some((t) => /burst|broke|wriggled|escaped/.test(t))).toBe(true)
    }
    expect(Math.abs(caught / n - catchProbability(a))).toBeLessThan(0.08)
  })

  it('runs from a slower foe at once', () => {
    const b = wild([beast('lemurge', 30, { ivs: ALL_31 })], beast('tubbara', 3))
    b.start()
    const ev = b.choose({ kind: 'run' })
    expect(texts(ev)).toEqual(['ORI slipped away safely!'])
    expect(lastPrompt(ev)).toEqual({ kind: 'end', outcome: 'fled', money: 0, leveled: [] })
  })

  it('gets away from a faster foe within a few tries', () => {
    const me = beast('tubbara', 5, { ivs: ALL_0 })
    const foe = beast('lemurge', 60, { ivs: ALL_31, moves: ['chirrup'] })
    const b = wild([me], foe, { seed: 4 })
    const r = play(b, () => ({ kind: 'run' }))
    expect(r.end.outcome).toBe('fled')
    const fails = texts(r.events).filter((t) => t === "Couldn't get away!").length
    expect(fails).toBeLessThanOrEqual(8)
    // Each failed attempt costs the turn.
    expect(texts(r.events).filter((t) => t === 'Wild LEMURGE used CHIRRUP!').length).toBe(fails)
  })

  it('refuses to run where it is not allowed, without using the turn', () => {
    const t = versus([beast('narlet', 10)], [beast('tubbara', 10)])
    t.start()
    expect(t.choose({ kind: 'run' })).toEqual([
      { t: 'msg', text: "You can't run from a trainer battle!" },
      { t: 'prompt', prompt: { kind: 'action' } },
    ])
    const legend = wild([beast('narlet', 10)], beast('atollus', 50), { noRun: true })
    legend.start()
    expect(texts(legend.choose({ kind: 'run' }))).toEqual(["There's no escape!"])
  })

  it('loses when the last beast faints', () => {
    const me = beast('tubbara', 2)
    const b = wild([me], beast('volcaram', 50))
    const r = play(b, strongest([me]))
    expect(r.end).toEqual({ kind: 'end', outcome: 'lose', money: 0, leveled: [] })
    // Without playerMoney the caller tells the blackout; the engine stops at the faint.
    const t = texts(r.events)
    expect(t[t.length - 1]).toBe('TUBBARA was knocked out!')
    expect(me.hp).toBe(0)
  })
})

describe('trainer battles', () => {
  it('fights three beasts, forcing a switch when the lead faints, then pays out', () => {
    const weak = beast('twigling', 3)
    const strong = beast('volcaram', 60, { ivs: ALL_31 })
    const party = [weak, strong]
    const foes = [beast('pufflet', 14), beast('tubbara', 15), beast('wombit', 16)]
    const b = versus(party, foes, HECTOR, { seed: 3 })
    const r = play(b, strongest(party))
    expect(r.prompts).toContainEqual({ kind: 'switch', forced: true })
    expect(weak.hp).toBe(0)
    const balls = r.events.filter((e) => e.t === 'trainerParty').map((e) => (e.t === 'trainerParty' ? e.remaining : -1))
    expect(balls).toEqual([3, 2, 1])
    const t = texts(r.events)
    expect(t).toContain('TWIGLING was knocked out!')
    expect(t).toContain('Go for it, VOLCARAM!')
    expect(t).toContain('SAILOR HECTOR called out TUBBARA!')
    expect(t).toContain('SAILOR HECTOR called out WOMBIT!')
    // Trainer battles give 1.5x, all of it to the one beast still standing.
    expect(t).toContain(`VOLCARAM gained ${xpYield(species('pufflet').xpYield, 14, true)} XP!`)
    // The engine names the defeated trainer; the scene shows the lose text and the prize.
    expect(t[t.length - 1]).toBe('ORI defeated SAILOR HECTOR!')
    expect(t).not.toContain('Ahoy... you win.')
    expect(r.end).toEqual({ kind: 'end', outcome: 'win', money: 30 * 16, leveled: [] })
    expect(foes.every((f) => f.hp === 0)).toBe(true)
  })

  it('reports half the player’s money as lost when told how much there is', () => {
    const me = beast('tubbara', 2)
    const b = versus([me], [beast('volcaram', 50)], { className: 'CAPTAIN', name: 'SCRAG', prize: 100, ai: 'smart', loseText: 'Blast!' }, { playerMoney: 1001 })
    const r = play(b, strongest([me]))
    expect(r.end).toEqual({ kind: 'end', outcome: 'lose', money: -500, leveled: [] })
    expect(texts(r.events).slice(-2)).toEqual(['ORI has no beasts left that can fight!', 'ORI dropped ¤500 in the scramble...'])
  })

  it('does not let the player steal a trainer’s beast', () => {
    const bag = makeBag({ orb: 2 })
    const b = versus([beast('narlet', 10)], [beast('tubbara', 10)], HECTOR, { bag })
    b.start()
    expect(b.choose({ kind: 'item', item: 'orb' })).toEqual([
      { t: 'msg', text: "You can't catch another trainer's beast!" },
      { t: 'prompt', prompt: { kind: 'action' } },
    ])
    expect(bag.counts.orb).toBe(2)
  })

  it('lets smart trainers heal once below a quarter HP; basic ones never do', () => {
    const smart: TrainerInfo = { className: 'WARDEN', name: 'BRECK', prize: 80, ai: 'smart', items: ['superSalve'], loseText: 'Solid work.' }
    const foe = beast('wombit', 20, { moves: ['chirrup'] })
    foe.hp = Math.floor(maxHp(foe) / 5)
    const gain = Math.min(60, maxHp(foe) - foe.hp)
    const b = versus([beast('tubbara', 20, { moves: ['chirrup'] })], [foe], smart)
    b.start()
    const ev = b.choose({ kind: 'move', slot: 0 })
    expect(texts(ev)[0]).toBe('WARDEN BRECK used SUPER SALVE!')
    expect(ev).toContainEqual({ t: 'item', side: 'foe', item: 'superSalve' })
    expect(texts(ev)).toContain(`Foe WOMBIT recovered ${gain} HP!`)
    foe.hp = 1
    const ev2 = b.choose({ kind: 'move', slot: 0 })
    expect(texts(ev2).some((t) => t.includes('used SUPER SALVE'))).toBe(false)

    const foe2 = beast('wombit', 20, { moves: ['chirrup'] })
    foe2.hp = 2
    const basic = versus([beast('tubbara', 20, { moves: ['chirrup'] })], [foe2], { ...smart, ai: 'basic' })
    basic.start()
    expect(texts(basic.choose({ kind: 'move', slot: 0 })).some((t) => t.includes('SUPER SALVE'))).toBe(false)
  })

  it('has trainers pick their most damaging move most of the time', () => {
    let best = 0
    const n = 60
    for (let seed = 1; seed <= n; seed++) {
      const foe = beast('narlet', 20, { seed, moves: ['chirrup', 'bump', 'riptide'] })
      const b = versus([beast('kindlet', 20, { seed, moves: ['chirrup'] })], [foe], HECTOR, { seed })
      b.start()
      if (texts(b.choose({ kind: 'move', slot: 0 })).includes('Foe NARLET used RIPTIDE!')) best++
    }
    expect(best / n).toBeGreaterThan(0.7)
  })
})

describe('experience and moves', () => {
  it('prompts to learn a fifth move and swaps it in', () => {
    const me = beast('leafolin', 16)
    me.xp = xpForLevel('medium', 17) - 1
    expect(me.moves.map((m) => m.id)).toEqual(['chirrup', 'seedFlick', 'sapSip', 'dozeDust'])
    const foe = beast('tubbara', 5)
    const b = wild([me], foe, { seed: 21 })
    const r = play(b, (p, bt) => (p.kind === 'learn' ? { kind: 'learn', forgetSlot: 1 } : strongest([me])(p, bt)))
    expect(r.prompts).toContainEqual({ kind: 'learn', partyIndex: 0, move: 'frondSlash' })
    const t = texts(r.events)
    expect(t).toContain('LEAFOLIN reached level 17!')
    // The scene asks the question itself, so the engine prints nothing about it first.
    expect(t.some((x) => x.includes('wants to learn'))).toBe(false)
    expect(t).toContain('LEAFOLIN forgot SEED FLICK...')
    expect(t).toContain('...and learned FROND SLASH!')
    expect(r.events).toContainEqual({ t: 'learned', partyIndex: 0, move: 'frondSlash' })
    expect(me.moves.map((m) => m.id)).toEqual(['chirrup', 'frondSlash', 'sapSip', 'dozeDust'])
    expect(me.moves[1].pp).toBe(20)
    expect(r.end).toMatchObject({ outcome: 'win', leveled: [0] })
    const level = r.events.find((e) => e.t === 'level')
    expect(level).toMatchObject({ t: 'level', partyIndex: 0, level: 17 })
    // The prompt is the last event of its batch, and the battle carries on after the answer.
    const i = r.batches.findIndex((bt) => lastPrompt(bt).kind === 'learn')
    expect(texts(r.batches[i + 1])).toEqual(['LEAFOLIN forgot SEED FLICK...', '...and learned FROND SLASH!'])
  })

  it('handles several level-ups with several prompts, learning or declining each', () => {
    const me = beast('leafolin', 12, { ivs: ALL_31 })
    expect(me.moves.map((m) => m.id)).toEqual(['bump', 'chirrup', 'seedFlick', 'sapSip'])
    const foe = beast('atollus', 50, { moves: ['chirrup'] })
    foe.hp = 1
    const b = versus([me], [foe], HECTOR, { seed: 5 })
    const answers = [0, null]
    const r = play(b, (p) => (p.kind === 'learn' ? { kind: 'learn', forgetSlot: answers.shift() ?? null } : { kind: 'move', slot: 0 }))
    const learnPrompts = r.prompts.filter((p) => p.kind === 'learn')
    expect(learnPrompts).toEqual([
      { kind: 'learn', partyIndex: 0, move: 'dozeDust' },
      { kind: 'learn', partyIndex: 0, move: 'frondSlash' },
    ])
    expect(me.level).toBe(17)
    expect(r.events.filter((e) => e.t === 'level').map((e) => (e.t === 'level' ? e.level : 0))).toEqual([13, 14, 15, 16, 17])
    expect(me.moves.map((m) => m.id)).toEqual(['dozeDust', 'chirrup', 'seedFlick', 'sapSip'])
    expect(texts(r.events)).toContain('LEAFOLIN did not learn FROND SLASH.')
    expect(r.end).toMatchObject({ outcome: 'win', leveled: [0], money: 30 * 50 })
    // The bar fills to the top at each level, and level-up stats match.
    for (const e of r.events) if (e.t === 'level') expect(e.after.hp).toBeGreaterThan(e.before.hp)
  })

  it('learns a move outright when there is room', () => {
    const me = beast('kindlet', 8)
    expect(me.moves).toHaveLength(3)
    me.xp = xpForLevel('medium', 9) - 1
    const r = play(wild([me], beast('tubbara', 4), { seed: 2 }), strongest([me]))
    expect(r.events).toContainEqual({ t: 'learned', partyIndex: 0, move: 'quickNip' })
    expect(texts(r.events)).toContain('KINDLET learned QUICK NIP!')
    expect(r.prompts.some((p) => p.kind === 'learn')).toBe(false)
    expect(me.moves.map((m) => m.id)).toEqual(['bump', 'scowl', 'cinderSpit', 'quickNip'])
  })

  it('splits experience between the beasts that fought', () => {
    const a = beast('volcaram', 30)
    const c = beast('tubbara', 30)
    const foe = beast('tubbara', 10)
    const b = wild([a, c], foe, { seed: 8 })
    b.start()
    const sw = b.choose({ kind: 'switch', partyIndex: 1 })
    expect(texts(sw).slice(0, 2)).toEqual(['VOLCARAM, return!', 'Go for it, TUBBARA!'])
    expect(sw.map((e) => e.t).slice(0, 4)).toEqual(['msg', 'recall', 'msg', 'send'])
    expect(b.view().active).toBe(1)
    const r = play(b, strongest([a, c]))
    const share = Math.floor(xpYield(species('tubbara').xpYield, 10, false) / 2)
    expect(texts(r.events)).toContain(`VOLCARAM gained ${share} XP!`)
    expect(texts(r.events)).toContain(`TUBBARA gained ${share} XP!`)
  })
})

describe('moves in battle', () => {
  it('says when a move is super effective, not very effective, or does nothing', () => {
    const se = wild([beast('narlet', 20, { moves: ['spritz'] })], beast('kindlet', 20, { moves: ['chirrup'] }))
    se.start()
    const ev = se.choose({ kind: 'move', slot: 0 })
    expect(texts(ev)).toContain('It hit a weak spot!')
    expect(hpEvents(ev, 'foe')[0]).toMatchObject({ eff: 2 })

    const nve = wild([beast('kindlet', 20, { moves: ['cinderSpit'] })], beast('narlet', 20, { moves: ['chirrup'] }))
    nve.start()
    expect(texts(nve.choose({ kind: 'move', slot: 0 }))).toContain('It barely left a mark...')

    const none = wild([beast('tubbara', 20, { moves: ['bump'] })], beast('tatterling', 20, { moves: ['scowl'] }))
    none.start()
    const ev3 = none.choose({ kind: 'move', slot: 0 })
    expect(texts(ev3)).toContain('It has no effect on Wild TATTERLING...')
    expect(ev3).toContainEqual({ t: 'miss', side: 'player' })
    expect(hpEvents(ev3, 'foe')).toHaveLength(0)
  })

  it('lands critical hits about 1 in 16, and 1 in 8 with a high-crit move', () => {
    const rate = (moveId: string) => {
      let crits = 0
      const n = 600
      for (let seed = 1; seed <= n; seed++) {
        const b = wild([beast('frondolin', 30, { seed, moves: [moveId], ivs: ALL_31 })], beast('capybaron', 60, { seed, moves: ['chirrup'] }), { seed })
        b.start()
        if (texts(b.choose({ kind: 'move', slot: 0 })).includes('A lucky strike!')) crits++
      }
      return crits / n
    }
    const plain = rate('seedFlick')
    const high = rate('frondSlash') / 0.95 // FROND SLASH can miss
    expect(Math.abs(plain - 1 / 16)).toBeLessThan(0.03)
    expect(Math.abs(high - 1 / 8)).toBeLessThan(0.04)
  })

  it('makes a blinded foe miss more', () => {
    const b = wild([beast('tatterling', 40, { moves: ['fogbank'], ivs: ALL_31 })], beast('pufflet', 5, { moves: ['wingSlap'] }), { seed: 31 })
    b.start()
    let misses = 0
    let turns = 0
    for (let turn = 0; turn < 20; turn++) {
      const ev = b.choose({ kind: 'move', slot: 0 })
      if (turn >= 6) {
        turns++
        if (texts(ev).includes("Wild PUFFLET's attack missed!")) misses++
      }
      expect(lastPrompt(ev).kind).toBe('action')
    }
    expect(turns).toBe(14)
    // At −6 accuracy a sure-hit move lands only a third of the time.
    expect(misses).toBeGreaterThanOrEqual(5)
  })

  it('lets priority moves go first whatever the speed', () => {
    const b = wild([beast('tubbara', 20, { moves: ['quickNip'], ivs: ALL_0 })], beast('lemurge', 20, { moves: ['chirrup'], ivs: ALL_31 }))
    b.start()
    const used = texts(b.choose({ kind: 'move', slot: 0 })).filter((t) => t.includes(' used '))
    expect(used).toEqual(['TUBBARA used QUICK NIP!', 'Wild LEMURGE used CHIRRUP!'])
  })

  it('raises and lowers stat stages, and stops at the limit', () => {
    const b = wild([beast('tubbara', 30, { moves: ['scowl'] })], beast('wombit', 30, { moves: ['digIn'] }), { seed: 3 })
    b.start()
    const ev = b.choose({ kind: 'move', slot: 0 })
    expect(texts(ev)).toContain("Wild WOMBIT's DEFENSE fell!")
    expect(texts(ev)).toContain("Wild WOMBIT's DEFENSE rose!")
    expect(texts(ev)).toContain("Wild WOMBIT's SP. DEF rose!")
    expect(ev).toContainEqual({ t: 'stat', side: 'foe', stat: 'def', delta: -1 })
    expect(ev).toContainEqual({ t: 'stat', side: 'foe', stat: 'spd', delta: 1 })
    let last: BattleEvent[] = []
    for (let i = 0; i < 12; i++) last = b.choose({ kind: 'move', slot: 0 })
    expect(texts(last)).toContain("Wild WOMBIT's SP. DEF won't go any higher!")
  })

  it('hits several times with a multi-hit move', () => {
    const b = wild([beast('zappet', 30, { moves: ['pawFlurry'], ivs: ALL_31 })], beast('wombastion', 60, { moves: ['digIn'] }), { seed: 12 })
    b.start()
    let found = false
    for (let i = 0; i < 10 && !found; i++) {
      const ev = b.choose({ kind: 'move', slot: 0 })
      const m = texts(ev).find((t) => /^Hit \d times?!$/.test(t))
      if (m) {
        const n = Number(m.split(' ')[1])
        expect(n).toBeGreaterThanOrEqual(2)
        expect(n).toBeLessThanOrEqual(5)
        expect(hpEvents(ev, 'foe').filter((e) => e.eff !== undefined)).toHaveLength(n)
        expect(ev.filter((e) => e.t === 'move' && e.side === 'player')).toHaveLength(n)
        found = true
      }
    }
    expect(found).toBe(true)
  })

  it('drains and recoils by a share of the damage dealt', () => {
    const drainer = beast('leafolin', 40, { moves: ['deepRoots'], ivs: ALL_31 })
    drainer.hp = 10
    const d = wild([drainer], beast('narlet', 40, { moves: ['chirrup'] }), { seed: 5 })
    d.start()
    const ev = d.choose({ kind: 'move', slot: 0 })
    const hit = hpEvents(ev, 'foe')[0]
    const heal = hpEvents(ev, 'player')[0]
    expect(heal.to - heal.from).toBe(Math.max(1, Math.floor((hit.from - hit.to) / 2)))
    expect(texts(ev)).toContain("Wild NARLET's strength was drained!")

    const ram = beast('volcaram', 40, { moves: ['fullTilt'] })
    const r = wild([ram], beast('capybaron', 60, { moves: ['chirrup'] }), { seed: 5 })
    r.start()
    const ev2 = r.choose({ kind: 'move', slot: 0 })
    const dealt = hpEvents(ev2, 'foe')[0]
    const back = hpEvents(ev2, 'player')[0]
    expect(back.from - back.to).toBe(Math.max(1, Math.floor((dealt.from - dealt.to) / 3)))
    expect(texts(ev2)).toContain('VOLCARAM is jarred by the recoil!')
  })

  it('struggles when every move is out of PP, typeless and with ¼ recoil', () => {
    const me = beast('volcaram', 40, { ivs: ALL_31 })
    for (const s of me.moves) s.pp = 0
    const b = wild([me], beast('tatterling', 40, { moves: ['scowl'] }), { seed: 9 })
    b.start()
    expect(b.view().moves.every((m) => m.pp === 0)).toBe(true)
    const ev = b.choose({ kind: 'move', slot: 2 })
    const t = texts(ev)
    expect(t).toContain('VOLCARAM is out of moves!')
    expect(t).toContain('VOLCARAM used STRUGGLE!')
    expect(t).not.toContain('It has no effect on Wild TATTERLING...')
    expect(ev).toContainEqual({ t: 'move', side: 'player', move: 'struggle' })
    const hit = hpEvents(ev, 'foe')[0]
    const recoil = hpEvents(ev, 'player')[0]
    expect(hit.from - hit.to).toBeGreaterThan(0)
    expect(recoil.from - recoil.to).toBe(Math.max(1, Math.floor((hit.from - hit.to) / 4)))
    expect(t).toContain('VOLCARAM is jarred by the recoil!')
  })

  it('makes foes struggle too', () => {
    const foe = beast('tubbara', 30, { moves: ['bump'] })
    foe.moves[0].pp = 0
    const b = wild([beast('narlet', 30, { moves: ['chirrup'] })], foe)
    b.start()
    const t = texts(b.choose({ kind: 'move', slot: 0 }))
    expect(t).toContain('Wild TUBBARA is out of moves!')
    expect(t).toContain('Wild TUBBARA used STRUGGLE!')
  })

  it('uses up PP', () => {
    const me = beast('narlet', 20, { moves: ['spritz'] })
    const b = wild([me], beast('capybaron', 60, { moves: ['chirrup'] }))
    b.start()
    b.choose({ kind: 'move', slot: 0 })
    expect(me.moves[0].pp).toBe(24)
    expect(b.view().moves[0]).toEqual({ id: 'spritz', name: 'SPRITZ', type: 'tide', pp: 24, maxPp: 25 })
  })
})

describe('status conditions', () => {
  /** Two sturdy beasts that only glare at each other, so only status does damage. */
  function staring(extra: Partial<BattleSetup> = {}) {
    const me = beast('tubbara', 50, { moves: ['chirrup'] })
    const foe = beast('tubbara', 50, { moves: ['chirrup'] })
    return { me, foe, b: wild([me], foe, extra) }
  }

  it('ramps up bad poison each turn until the beast faints', () => {
    const { me, foe, b } = staring()
    foe.status = 'tox'
    const max = maxHp(foe)
    const r = play(b, slot0)
    const residual = hpEvents(r.events, 'foe').filter((e) => e.eff === undefined).map((e) => e.from - e.to)
    const expected: number[] = []
    let hp = max
    for (let n = 1; hp > 0; n++) {
      const d = Math.max(1, Math.floor((max * n) / 16))
      expected.push(Math.min(d, hp))
      hp -= d
    }
    expect(residual).toEqual(expected)
    expect(texts(r.events)).toContain('Wild TUBBARA suffers from the poison!')
    expect(r.end.outcome).toBe('win')
    expect(me.hp).toBe(maxHp(me))
  })

  it('poisons for an eighth each turn and can make you lose', () => {
    const { me, b } = staring()
    me.status = 'psn'
    const max = maxHp(me)
    const r = play(b, slot0)
    const residual = hpEvents(r.events, 'player').map((e) => e.from - e.to)
    expect(residual.slice(0, -1).every((d) => d === Math.floor(max / 8))).toBe(true)
    expect(residual).toHaveLength(Math.ceil(max / Math.floor(max / 8)))
    expect(texts(r.events)).toContain('TUBBARA suffers from the poison!')
    expect(r.end.outcome).toBe('lose')
  })

  it('burns for an eighth each turn and halves physical damage', () => {
    const { me, b } = staring()
    me.status = 'brn'
    b.start()
    const ev = b.choose({ kind: 'move', slot: 0 })
    expect(texts(ev)).toContain("TUBBARA's burn stings!")
    expect(hpEvents(ev, 'player')[0].from - hpEvents(ev, 'player')[0].to).toBe(Math.floor(maxHp(me) / 8))

    const hit = (burned: boolean) => {
      const a = beast('volcaram', 40, { seed: 1, moves: ['hotCharge'] })
      if (burned) a.status = 'brn'
      const bt = wild([a], beast('capybaron', 60, { seed: 2, moves: ['chirrup'] }), { seed: 77 })
      bt.start()
      const e = hpEvents(bt.choose({ kind: 'move', slot: 0 }), 'foe')[0]
      return e.from - e.to
    }
    // Flame types can't be burned by moves, but a burn set directly still halves (the engine trusts saves).
    const full = hit(false)
    expect(hit(true)).toBe(Math.max(1, Math.floor(full / 2)))
  })

  it('sleeps exactly two turns after SIESTA, then wakes and acts', () => {
    const me = beast('tubbara', 20, { moves: ['siesta'] })
    me.hp = 5
    me.status = 'psn'
    const b = wild([me], beast('tubbara', 20, { moves: ['chirrup'] }))
    b.start()
    const t1 = b.choose({ kind: 'move', slot: 0 })
    expect(texts(t1)).toContain('TUBBARA took a nap and became healthy!')
    expect(t1).toContainEqual({ t: 'status', side: 'player', status: 'slp' })
    expect(me.status).toBe('slp')
    expect(me.hp).toBe(maxHp(me))
    expect(texts(b.choose({ kind: 'move', slot: 0 }))).toContain('TUBBARA is sound asleep.')
    expect(texts(b.choose({ kind: 'move', slot: 0 }))).toContain('TUBBARA is sound asleep.')
    const t4 = texts(b.choose({ kind: 'move', slot: 0 }))
    expect(t4).toContain('TUBBARA woke up!')
    expect(t4).toContain('TUBBARA used SIESTA!')
    // Already at full HP, so a second nap does nothing.
    expect(t4).toContain('But it failed!')
    expect(me.status).toBeNull()
  })

  it('puts beasts to sleep for one to three turns', () => {
    const counts = new Set<number>()
    for (let seed = 1; seed <= 40; seed++) {
      const foe = beast('wombit', 30, { seed, moves: ['chirrup'] })
      const b = wild([beast('lanterwing', 30, { seed, moves: ['dreamsong'], ivs: ALL_31 })], foe, { seed })
      b.start()
      let slept = -1
      let asleepTurns = 0
      for (let turn = 0; turn < 8; turn++) {
        const t = texts(b.choose({ kind: 'move', slot: 0 }))
        if (slept < 0 && t.includes('Wild WOMBIT fell asleep!')) slept = turn
        if (t.includes('Wild WOMBIT is sound asleep.')) asleepTurns++
        if (t.includes('Wild WOMBIT woke up!')) break
      }
      if (slept >= 0) {
        counts.add(asleepTurns)
        expect(asleepTurns).toBeGreaterThanOrEqual(1)
        expect(asleepTurns).toBeLessThanOrEqual(3)
      }
    }
    expect(counts.size).toBeGreaterThan(1)
  })

  it('stops a paralysed beast a quarter of the time and quarters its speed', () => {
    let stuck = 0
    const n = 300
    for (let seed = 1; seed <= n; seed++) {
      const me = beast('pufflet', 20, { seed, moves: ['chirrup'], ivs: ALL_31 })
      me.status = 'par'
      const b = wild([me], beast('tubbara', 20, { seed, moves: ['chirrup'], ivs: ALL_0 }), { seed })
      b.start()
      const t = texts(b.choose({ kind: 'move', slot: 0 }))
      // Quartered, the fast PUFFLET now moves after the slow TUBBARA.
      expect(t.findIndex((x) => x.startsWith('Wild TUBBARA used'))).toBeLessThan(t.findIndex((x) => x.startsWith('PUFFLET')))
      if (t.includes("PUFFLET is paralysed and can't budge!")) stuck++
    }
    expect(Math.abs(stuck / n - 0.25)).toBeLessThan(0.07)
    // Without the paralysis it goes first.
    const b = wild([beast('pufflet', 20, { moves: ['chirrup'], ivs: ALL_31 })], beast('tubbara', 20, { moves: ['chirrup'], ivs: ALL_0 }))
    b.start()
    expect(texts(b.choose({ kind: 'move', slot: 0 }))[0]).toBe('PUFFLET used CHIRRUP!')
  })

  it('thaws a frozen beast one time in five, or when a FLAME move hits it', () => {
    let thawed = 0
    const n = 300
    for (let seed = 1; seed <= n; seed++) {
      const me = beast('tubbara', 20, { seed, moves: ['chirrup'] })
      me.status = 'frz'
      const b = wild([me], beast('tubbara', 20, { seed, moves: ['chirrup'] }), { seed })
      b.start()
      const t = texts(b.choose({ kind: 'move', slot: 0 }))
      if (t.includes('TUBBARA thawed out!')) thawed++
      else expect(t).toContain('TUBBARA is frozen stiff!')
    }
    expect(Math.abs(thawed / n - 0.2)).toBeLessThan(0.07)

    const foe = beast('tubbara', 30, { moves: ['chirrup'], ivs: ALL_0 })
    foe.status = 'frz'
    const b = wild([beast('kindlet', 30, { moves: ['cinderSpit'], ivs: ALL_31 })], foe)
    b.start()
    const ev = b.choose({ kind: 'move', slot: 0 })
    const t = texts(ev)
    expect(t.indexOf('Wild TUBBARA thawed out!')).toBeGreaterThan(t.indexOf('KINDLET used CINDER SPIT!'))
    expect(ev).toContainEqual({ t: 'status', side: 'foe', status: null })
    expect(t).toContain('Wild TUBBARA used CHIRRUP!')
  })

  it('makes a slower target flinch sometimes', () => {
    let flinched = 0
    const n = 300
    for (let seed = 1; seed <= n; seed++) {
      const b = wild([beast('tatterling', 30, { seed, moves: ['spook'], ivs: ALL_31 })], beast('wombit', 30, { seed, moves: ['chirrup'], ivs: ALL_0 }), { seed })
      b.start()
      if (texts(b.choose({ kind: 'move', slot: 0 })).includes('Wild WOMBIT flinched and lost its nerve!')) flinched++
    }
    expect(Math.abs(flinched / n - 0.3)).toBeLessThan(0.08)
  })

  it('respects type immunities to status', () => {
    const b = wild([beast('zappet', 20, { moves: ['tingle'] })], beast('wombit', 20, { moves: ['chirrup'] }))
    b.start()
    expect(texts(b.choose({ kind: 'move', slot: 0 }))).toContain('It has no effect on Wild WOMBIT...')
    const c = wild([beast('spinefin', 20, { moves: ['foulMiasma'] })], beast('sawfry', 20, { moves: ['chirrup'] }))
    c.start()
    expect(texts(c.choose({ kind: 'move', slot: 0 }))).toContain('It has no effect on Wild SAWFRY...')
    const d = wild([beast('kindlet', 20, { moves: ['smoulder'] })], beast('cinderam', 20, { moves: ['chirrup'] }))
    d.start()
    expect(texts(d.choose({ kind: 'move', slot: 0 }))).toContain('It has no effect on Wild CINDERAM...')
  })

  it('fails a status move on a beast that already has one', () => {
    const foe = beast('wombit', 20, { moves: ['chirrup'] })
    foe.status = 'par'
    const b = wild([beast('kindlet', 20, { moves: ['smoulder'] })], foe)
    b.start()
    expect(texts(b.choose({ kind: 'move', slot: 0 }))).toContain('But it failed!')
  })

  it('eases bad poison to ordinary poison after the battle', () => {
    const me = beast('narlet', 30, { moves: ['chirrup'] })
    me.status = 'tox'
    const b = wild([me], beast('lemurge', 5), { seed: 1 })
    b.start()
    b.choose({ kind: 'run' })
    expect(me.status).toBe('psn')
  })
})

describe('the bag', () => {
  it('heals the active beast and uses up the item and the turn', () => {
    const me = beast('narlet', 20, { moves: ['chirrup'] })
    me.hp = 5
    const bag = makeBag({ salve: 2 })
    const b = wild([me], beast('tubbara', 20, { moves: ['chirrup'] }), { bag })
    b.start()
    const ev = b.choose({ kind: 'item', item: 'salve' })
    expect(texts(ev).slice(0, 2)).toEqual(['ORI used SALVE!', 'NARLET recovered 20 HP!'])
    expect(ev).toContainEqual({ t: 'item', side: 'player', item: 'salve' })
    expect(ev).toContainEqual({ t: 'hp', side: 'player', from: 5, to: 25, maxHp: maxHp(me) })
    expect(texts(ev)).toContain('Wild TUBBARA used CHIRRUP!')
    expect(bag.counts.salve).toBe(1)
  })

  it('refuses items that would do nothing, without using the turn', () => {
    const bag = makeBag({ salve: 1, remedy: 1 })
    const b = wild([beast('narlet', 20)], beast('tubbara', 20), { bag })
    b.start()
    expect(b.choose({ kind: 'item', item: 'salve' })).toEqual([
      { t: 'msg', text: "It won't have any effect." },
      { t: 'prompt', prompt: { kind: 'action' } },
    ])
    expect(texts(b.choose({ kind: 'item', item: 'superSalve' }))).toEqual(["You're out of SUPER SALVE!"])
    expect(texts(b.choose({ kind: 'item', item: 'muskSpray' }))).toEqual(["That can't be used now."])
    expect(bag.counts.salve).toBe(1)
  })

  it('revives a fainted beast on the bench', () => {
    const out = beast('kindlet', 20)
    out.hp = 0
    const bag = makeBag({ revivalSeed: 1 })
    const b = wild([beast('narlet', 20, { moves: ['chirrup'] }), out], beast('tubbara', 20, { moves: ['chirrup'] }), { bag })
    b.start()
    const ev = b.choose({ kind: 'item', item: 'revivalSeed', partyIndex: 1 })
    expect(texts(ev)).toContain('KINDLET was revived!')
    expect(out.hp).toBe(Math.floor(maxHp(out) / 2))
    expect(hpEvents(ev, 'player').filter((e) => e.from === 0)).toHaveLength(0)
    expect(bag.counts.revivalSeed).toBe(0)
  })

  it('cures a status on the active beast', () => {
    const me = beast('narlet', 20, { moves: ['chirrup'] })
    me.status = 'par'
    const b = wild([me], beast('tubbara', 20, { moves: ['chirrup'] }), { bag: makeBag({ remedy: 1 }) })
    b.start()
    const ev = b.choose({ kind: 'item', item: 'remedy' })
    expect(ev).toContainEqual({ t: 'status', side: 'player', status: null })
    expect(texts(ev)).toContain('NARLET was cured of paralysis.')
  })
})

describe('switching', () => {
  it('rejects bad switches without using the turn', () => {
    const out = beast('kindlet', 20)
    out.hp = 0
    const b = wild([beast('narlet', 20), out], beast('tubbara', 20))
    b.start()
    expect(texts(b.choose({ kind: 'switch', partyIndex: 0 }))).toEqual(['NARLET is already out!'])
    expect(texts(b.choose({ kind: 'switch', partyIndex: 1 }))).toEqual(['KINDLET has no energy left to battle!'])
    expect(texts(b.choose({ kind: 'switch', partyIndex: 5 }))).toEqual(['There is no beast there.'])
  })

  it('only accepts a healthy beast for a forced switch', () => {
    const lead = beast('twigling', 2)
    const other = beast('narlet', 40)
    const b = wild([lead, other], beast('pufflet', 30), { seed: 2 })
    b.start()
    let ev: BattleEvent[] = []
    for (let i = 0; i < 20; i++) {
      ev = b.choose({ kind: 'move', slot: 0 })
      if (lastPrompt(ev).kind !== 'action') break
    }
    expect(lastPrompt(ev)).toEqual({ kind: 'switch', forced: true })
    expect(b.choose({ kind: 'move', slot: 0 })).toEqual([{ t: 'prompt', prompt: { kind: 'switch', forced: true } }])
    expect(texts(b.choose({ kind: 'switch', partyIndex: 0 }))).toEqual(['TWIGLING has no energy left to battle!'])
    const sent = b.choose({ kind: 'switch', partyIndex: 1 })
    expect(texts(sent)).toEqual(['Go for it, NARLET!'])
    expect(sent.map((e) => e.t)).toEqual(['msg', 'send', 'prompt'])
    expect(lastPrompt(sent)).toEqual({ kind: 'action' })
  })
})

describe('robustness', () => {
  it('ignores answers to the wrong prompt and bad slots', () => {
    const b = wild([beast('narlet', 20)], beast('tubbara', 20))
    b.start()
    expect(b.choose({ kind: 'learn', forgetSlot: 0 })).toEqual([{ t: 'prompt', prompt: { kind: 'action' } }])
    expect(b.choose({ kind: 'move', slot: 9 })).toEqual([{ t: 'prompt', prompt: { kind: 'action' } }])
    expect(b.choose({ kind: 'move', slot: 1.5 })).toEqual([{ t: 'prompt', prompt: { kind: 'action' } }])
  })

  it('refuses a move with no PP while others have some', () => {
    const me = beast('narlet', 20, { moves: ['chirrup', 'spritz'] })
    me.moves[1].pp = 0
    const b = wild([me], beast('tubbara', 20))
    b.start()
    expect(b.choose({ kind: 'move', slot: 1 })).toEqual([
      { t: 'msg', text: "There's no PP left for this move!" },
      { t: 'prompt', prompt: { kind: 'action' } },
    ])
  })

  it('choose() before start() starts the battle', () => {
    const b = wild([beast('narlet', 20)], beast('tubbara', 20))
    expect(lastPrompt(b.choose({ kind: 'run' }))).toEqual({ kind: 'action' })
  })

  it('is deterministic for a seed', () => {
    const run = () => {
      const party = [beast('cinderam', 25, { seed: 1 }), beast('narwhelm', 25, { seed: 4 })]
      const foes = [beast('puffinaut', 24, { seed: 2 }), beast('clobberclaw', 26, { seed: 3 })]
      return play(versus(party, foes, { ...HECTOR, ai: 'smart', items: ['salve'] }, { seed: 99 }), strongest(party)).events
    }
    expect(run()).toEqual(run())
  })
})
