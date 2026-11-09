/**
 * The battle engine: single battles, one critter a side, with the classic
 * handheld rules (see formulas.ts). Turns come out as BattleEvents for the
 * battle scene to animate.
 *
 * Internally a battle is a queue of small steps. A choice queues the steps
 * of a turn, and the steps run until one of them needs the player (a prompt);
 * the rest wait in the queue until the answer comes back. That lets a
 * move-learning question or a forced switch pop up in the middle of a turn's
 * aftermath and carry on exactly where it left off.
 */
import { Rng } from '../core/rng'
import { item as itemData, type ItemId } from '../data/items'
import { move as moveData, MOVE_IDS, STRUGGLE, type MoveData, type MoveId, type StageKey, type StatusId } from '../data/moves'
import { species } from '../data/species'
import { effectiveness, isSpecial, type TypeId } from '../data/types'
import {
  applyItem,
  calcStats,
  displayName,
  gainStatExp,
  gainXp,
  itemWouldWork,
  learnFree,
  maxHp,
  maxPp,
  replaceMove,
  view as critterView,
  xpFraction,
} from './creature'
import { clampStage, critChance, damage, hitChance, multiHitCount, rollCatch, runChance, staged, xpYield } from './formulas'
import type { BattleApi, BattleEvent, BattleSetup, BattleViewState, Choice, Critter, Outcome, Prompt, Side, Stats } from './types'

type Action =
  /** `slot` null means STRAIN (no PP left) or a locked-in move. */
  | { kind: 'move'; side: Side; slot: number | null }
  | { kind: 'switch'; side: Side; partyIndex: number }
  | { kind: 'item'; side: Side; item: ItemId; partyIndex?: number; moveSlot?: number }
  | { kind: 'run'; side: 'player' }

/** Battle-only state of the critter out on one side; reset when it leaves. */
interface Volatile {
  stages: Record<StageKey, number>
  confused: number
  leech: boolean
  /** Turns left trapped, and by which move. */
  bound: number
  boundBy: string
  recharge: boolean
  /** A two-turn move waiting for its second turn. */
  charging: MoveId | null
  /** Up in the air or underground. */
  hidden: boolean
  flinch: boolean
  focus: boolean
  /** The bad-poison counter. */
  toxic: number
  /** Has acted this turn (flinch only works before that). */
  moved: boolean
}

interface SideState {
  party: Critter[]
  active: number
  v: Volatile
  screens: { phys: number; spec: number }
  mist: number
}

const STAGE_NAME: Record<StageKey, string> = {
  atk: 'ATTACK',
  def: 'DEFENSE',
  spd: 'SPEED',
  spc: 'SPECIAL',
  acc: 'accuracy',
  eva: 'evasion',
}

const INFLICT: Record<StatusId, string> = {
  psn: 'was poisoned!',
  tox: 'was badly poisoned!',
  brn: 'was burned!',
  par: 'is paralyzed! It may not be able to move!',
  slp: 'fell asleep!',
  frz: 'was frozen solid!',
}

const ALREADY: Record<StatusId, string> = {
  psn: 'is already poisoned!',
  tox: 'is already poisoned!',
  brn: 'is already burned!',
  par: 'is already paralyzed!',
  slp: 'is already asleep!',
  frz: 'is already frozen!',
}

/** What the text says when a critter bursts out after 0–3 shakes. */
const BURST = ['It popped right back out!', 'Rats! It burst free!', 'Ooh, close! It wriggled out!', 'No! It slipped out at the last moment!']

/** Status that a type shrugs off when inflicted by a move of the same type. */
const IMMUNE: Partial<Record<StatusId, TypeId>> = { brn: 'FIRE', frz: 'FROST', psn: 'VENOM', tox: 'VENOM', par: 'SPARK' }

function freshVolatile(): Volatile {
  return {
    stages: { atk: 0, def: 0, spd: 0, spc: 0, acc: 0, eva: 0 },
    confused: 0,
    leech: false,
    bound: 0,
    boundBy: '',
    recharge: false,
    charging: null,
    hidden: false,
    flinch: false,
    focus: false,
    toxic: 0,
    moved: false,
  }
}

const other = (s: Side): Side => (s === 'player' ? 'foe' : 'player')

export class Battle implements BattleApi {
  private readonly rng: Rng
  private readonly sides: Record<Side, SideState>
  private events: BattleEvent[] = []
  private queue: (() => void)[] = []
  private waiting: Prompt | null = null
  private over = false
  private coins = 0
  private runTries = 0
  private readonly leveled = new Set<number>()
  private participants = new Set<number>()
  private caught: Critter | undefined
  private readonly trainerItems: (ItemId | null)[]
  private started = false

  constructor(private readonly s: BattleSetup) {
    this.rng = new Rng(s.seed)
    const first = s.party.findIndex((c) => c.hp > 0)
    if (first < 0) throw new Error('battle with no healthy critters')
    if (!s.foes.length) throw new Error('battle with no foes')
    this.sides = {
      player: { party: s.party, active: first, v: freshVolatile(), screens: { phys: 0, spec: 0 }, mist: 0 },
      foe: { party: s.foes, active: 0, v: freshVolatile(), screens: { phys: 0, spec: 0 }, mist: 0 },
    }
    this.trainerItems = [...(s.trainer?.items ?? [])]
  }

  // ────────────────────────────────────────────────────────── public api ───

  start(): BattleEvent[] {
    if (this.started) throw new Error('battle already started')
    this.started = true
    const foe = this.active('foe')
    if (this.s.kind === 'wild') {
      this.send('foe', 0)
      this.msg(`A wild ${displayName(foe)} appeared!`)
    } else {
      const t = this.s.trainer!
      this.emit({ t: 'trainerParty', side: 'foe', alive: this.s.foes.map((c) => c.hp > 0) })
      this.msg(`${t.className} ${t.name} is up for a battle!`)
      this.msg(`${t.className} ${t.name} called out ${displayName(foe)}!`)
      this.send('foe', 0)
    }
    this.participants = new Set([this.sides.player.active])
    this.msg(`Go, ${displayName(this.active('player'))}!`)
    this.send('player', this.sides.player.active)
    return this.flush()
  }

  choose(choice: Choice): BattleEvent[] {
    const p = this.waiting
    if (!p) throw new Error('no question is waiting for an answer')
    if (p.kind === 'end') throw new Error('the battle is over')
    this.waiting = null
    switch (p.kind) {
      case 'action':
        this.answerAction(choice)
        break
      case 'switch': {
        if (choice.kind !== 'switch') throw new Error('expected a switch')
        const c = this.sides.player.party[choice.partyIndex]
        if (!c || c.hp <= 0 || choice.partyIndex === this.sides.player.active) {
          this.msg('That critter can\'t battle!')
          this.ask(p)
          break
        }
        this.sendIn('player', choice.partyIndex, false)
        break
      }
      case 'learn': {
        if (choice.kind !== 'learn') throw new Error('expected a learn answer')
        const c = this.sides.player.party[p.partyIndex]
        const name = displayName(c)
        const mv = moveData(p.move).name
        if (choice.forgetSlot === null) this.msg(`${name} skipped ${mv}.`)
        else {
          const old = moveData(c.moves[choice.forgetSlot].id).name
          replaceMove(c, choice.forgetSlot, p.move)
          this.msg(`${name} let go of ${old}…`)
          this.msg(`…and picked up ${mv}!`)
          this.emit({ t: 'learned', partyIndex: p.partyIndex, move: p.move })
        }
        break
      }
    }
    return this.flush()
  }

  view(): BattleViewState {
    const pc = this.active('player')
    return {
      player: critterView(pc),
      foe: critterView(this.active('foe')),
      active: this.sides.player.active,
      moves: pc.moves.map((m) => {
        const d = moveData(m.id)
        return { id: m.id, name: d.name, type: d.type, pp: m.pp, maxPp: maxPp(m) }
      }),
      canRun: this.s.kind === 'wild' && !this.s.noRun,
      canCatch: this.s.kind === 'wild',
      locked: this.locked('player'),
    }
  }

  /** For tests: the volatile state of a side. */
  peek(side: Side): Readonly<Volatile> {
    return this.sides[side].v
  }

  // ─────────────────────────────────────────────────────────── plumbing ───

  private emit(e: BattleEvent): void {
    this.events.push(e)
  }

  private msg(text: string): void {
    this.emit({ t: 'msg', text })
  }

  private ask(p: Prompt): void {
    this.waiting = p
    this.emit({ t: 'prompt', prompt: p })
  }

  /** Runs queued steps until something needs the player, then hands back the events. */
  private flush(): BattleEvent[] {
    while (!this.waiting && this.queue.length) this.queue.shift()!()
    if (!this.waiting && !this.over) this.promptAction()
    const out = this.events
    this.events = []
    return out
  }

  /** Puts steps at the front of the queue, in order. */
  private next(...steps: (() => void)[]): void {
    this.queue.unshift(...steps)
  }

  private active(side: Side): Critter {
    const s = this.sides[side]
    return s.party[s.active]
  }

  private label(side: Side): string {
    const n = displayName(this.active(side))
    if (side === 'player') return n
    return this.s.kind === 'wild' ? `Wild ${n}` : `Foe ${n}`
  }

  private locked(side: Side): boolean {
    const v = this.sides[side].v
    return v.recharge || v.charging !== null
  }

  private send(side: Side, partyIndex: number): void {
    const c = this.sides[side].party[partyIndex]
    this.emit({ t: 'send', side, partyIndex, view: critterView(c) })
  }

  private promptAction(): void {
    if (this.locked('player')) {
      this.beginTurn({ kind: 'move', side: 'player', slot: null })
      // Keep going: there's nothing to ask.
      while (!this.waiting && this.queue.length) this.queue.shift()!()
      if (!this.waiting && !this.over) this.promptAction()
      return
    }
    this.ask({ kind: 'action' })
  }

  // ──────────────────────────────────────────────────────────── choices ───

  private answerAction(choice: Choice): void {
    const pc = this.active('player')
    switch (choice.kind) {
      case 'move': {
        const usable = pc.moves.some((m) => m.pp > 0)
        if (!usable) {
          this.msg(`${displayName(pc)} has no moves left!`)
          this.beginTurn({ kind: 'move', side: 'player', slot: null })
          return
        }
        const slot = pc.moves[choice.slot]
        if (!slot) throw new Error(`no move in slot ${choice.slot}`)
        if (slot.pp <= 0) {
          this.msg('That move is all used up!')
          this.ask({ kind: 'action' })
          return
        }
        this.beginTurn({ kind: 'move', side: 'player', slot: choice.slot })
        return
      }
      case 'switch': {
        const c = this.sides.player.party[choice.partyIndex]
        if (!c || c.hp <= 0) {
          this.msg('That critter can\'t battle!')
          this.ask({ kind: 'action' })
          return
        }
        if (choice.partyIndex === this.sides.player.active) {
          this.msg(`${displayName(c)} is already out!`)
          this.ask({ kind: 'action' })
          return
        }
        if (this.sides.player.v.bound > 0) {
          this.msg(`${displayName(pc)} can't get away!`)
          this.ask({ kind: 'action' })
          return
        }
        this.beginTurn({ kind: 'switch', side: 'player', partyIndex: choice.partyIndex })
        return
      }
      case 'item': {
        if (this.s.bag.count(choice.item) <= 0) throw new Error(`no ${choice.item} in the bag`)
        const e = itemData(choice.item).effect
        if (e.kind === 'capsule') {
          if (this.s.kind !== 'wild') {
            this.s.bag.remove(choice.item)
            this.msg(`${this.s.playerName} threw a ${itemData(choice.item).name}!`)
            this.msg('The trainer knocked it away! That critter already has a trainer!')
            this.beginTurn(null)
            return
          }
          this.beginTurn({ kind: 'item', side: 'player', item: choice.item })
          return
        }
        if (e.kind === 'battleStat') {
          this.beginTurn({ kind: 'item', side: 'player', item: choice.item })
          return
        }
        if (e.kind === 'heal' || e.kind === 'cure' || e.kind === 'revive' || e.kind === 'pp') {
          const i = choice.partyIndex ?? this.sides.player.active
          const target = this.sides.player.party[i]
          if (!target || !itemWouldWork(target, choice.item, choice.moveSlot)) {
            this.msg('It won\'t have any effect.')
            this.ask({ kind: 'action' })
            return
          }
          this.beginTurn({ kind: 'item', side: 'player', item: choice.item, partyIndex: i, moveSlot: choice.moveSlot })
          return
        }
        this.msg('That can\'t be used in battle.')
        this.ask({ kind: 'action' })
        return
      }
      case 'run': {
        if (this.s.kind !== 'wild') {
          this.msg('You can\'t run from a trainer!')
          this.ask({ kind: 'action' })
          return
        }
        if (this.s.noRun) {
          this.msg('It won\'t let you leave!')
          this.ask({ kind: 'action' })
          return
        }
        this.beginTurn({ kind: 'run', side: 'player' })
        return
      }
      default:
        throw new Error(`unexpected answer ${choice.kind}`)
    }
  }

  // ─────────────────────────────────────────────────────────────── turns ───

  /** Queues a whole turn. `player` null means the player's turn was spent already. */
  private beginTurn(player: Action | null): void {
    this.sides.player.v.moved = false
    this.sides.foe.v.moved = false
    const foe = this.foeAction()
    const acts: Action[] = []
    if (player) acts.push(player)
    if (foe) acts.push(foe)
    for (const a of this.order(acts)) this.queue.push(() => this.perform(a))
    this.queue.push(() => this.endTurn())
  }

  private speedOf(side: Side): number {
    const c = this.active(side)
    let spd = staged(calcStats(c).spd, this.sides[side].v.stages.spd)
    if (c.status === 'par') spd = Math.max(1, Math.floor(spd / 4))
    return spd
  }

  private priorityOf(a: Action): number {
    if (a.kind !== 'move') return 10
    const v = this.sides[a.side].v
    if (v.charging || v.recharge || a.slot === null) return 0
    const m = moveData(this.active(a.side).moves[a.slot].id)
    return m.priority ?? 0
  }

  private order(acts: Action[]): Action[] {
    const coin = this.rng.next()
    return [...acts].sort((a, b) => {
      const pa = this.priorityOf(a)
      const pb = this.priorityOf(b)
      if (pa !== pb) return pb - pa
      if (a.kind !== 'move' && b.kind !== 'move') return a.side === 'player' ? -1 : 1
      const sa = this.speedOf(a.side)
      const sb = this.speedOf(b.side)
      if (sa !== sb) return sb - sa
      return coin < 0.5 ? -1 : 1
    })
  }

  private perform(a: Action): void {
    if (this.over) return
    const side = this.sides[a.side]
    const c = side.party[side.active]
    switch (a.kind) {
      case 'switch':
        this.switchOut(a.side, a.partyIndex)
        break
      case 'item':
        this.useItem(a)
        break
      case 'run':
        this.tryRun()
        break
      case 'move':
        if (c.hp <= 0) return
        this.useMove(a.side, a.slot)
        break
    }
    this.sides[a.side].v.moved = true
  }

  // ─────────────────────────────────────────────────────── foe decisions ───

  private foeAction(): Action | null {
    const side = this.sides.foe
    const c = side.party[side.active]
    if (c.hp <= 0) return null
    if (this.locked('foe')) return { kind: 'move', side: 'foe', slot: null }
    const t = this.s.trainer
    if (t) {
      const it = this.trainerHeal(c)
      if (it !== null) return { kind: 'item', side: 'foe', item: this.trainerItems[it]!, partyIndex: it }
    }
    return { kind: 'move', side: 'foe', slot: this.pickMove(c) }
  }

  /** Index into the trainer's item list of a heal worth using now, or null. */
  private trainerHeal(c: Critter): number | null {
    if (c.hp * 4 > maxHp(c)) return null
    const ai = this.s.trainer?.ai ?? 'basic'
    if (!this.rng.chance(ai === 'smart' ? 0.8 : 0.4)) return null
    for (let i = 0; i < this.trainerItems.length; i++) {
      const id = this.trainerItems[i]
      if (id && itemWouldWork(c, id)) return i
    }
    return null
  }

  private pickMove(c: Critter): number | null {
    const usable = c.moves.map((m, i) => ({ m, i })).filter((x) => x.m.pp > 0)
    if (!usable.length) return null
    if (this.s.kind === 'wild') return this.rng.pick(usable).i
    const target = this.active('player')
    const tv = this.sides.player.v
    const fv = this.sides.foe.v
    const scored = usable.map(({ m, i }) => ({ i, score: this.scoreMove(moveData(m.id), c, target, tv, fv) }))
    const smart = this.s.trainer?.ai === 'smart'
    if (!smart && this.rng.chance(0.2)) return this.rng.pick(usable).i
    const best = Math.max(...scored.map((s) => s.score))
    if (best <= 0) return this.rng.pick(usable).i
    const pool = scored.filter((s) => s.score >= best * (smart ? 0.85 : 0.6))
    return this.rng.weighted(pool, (s) => s.score).i
  }

  private scoreMove(m: MoveData, user: Critter, target: Critter, tv: Volatile, uv: Volatile): number {
    const tTypes = species(target.species).types
    const uTypes = species(user.species).types
    if (m.power > 0) {
      const eff = effectiveness(m.type, tTypes)
      if (eff === 0) return 0
      if (m.effect?.kind === 'dreamSip' && target.status !== 'slp') return 0
      let est: number
      if (m.fixed !== undefined) est = m.fixed === 'level' ? user.level * 1.2 : m.fixed === 'half' ? target.hp * 0.5 : m.fixed
      else {
        const hits = m.multi === undefined ? 1 : typeof m.multi === 'number' ? m.multi : 3
        est = m.power * eff * (uTypes.includes(m.type) ? 1.5 : 1) * hits
        if (m.effect?.kind === 'jinx' && target.status) est *= 2
      }
      est *= (m.acc || 100) / 100
      if (m.charge) est *= 0.55
      if (m.recharge) est *= 0.75
      if (m.selfKO) est *= user.hp * 3 < maxHp(user) ? 1 : 0.2
      return est
    }
    const e = m.effect
    if (!e) return 1
    switch (e.kind) {
      case 'status': {
        if (target.status) return 0
        if (IMMUNE[e.status] === m.type && tTypes.includes(m.type)) return 0
        if (e.status === 'par' && m.type === 'SPARK' && tTypes.includes('EARTH')) return 0
        return { slp: 70, par: 55, tox: 50, psn: 35, brn: 40, frz: 40 }[e.status] * ((m.acc || 100) / 100)
      }
      case 'confuse':
        return tv.confused > 0 ? 0 : 30
      case 'stage':
        if (e.who === 'self') return uv.stages[e.stat] >= 2 || user.hp * 2 < maxHp(user) ? 2 : 28
        return tv.stages[e.stat] <= -2 ? 2 : 22
      case 'stages':
        return uv.stages[e.stats[0]] >= 2 ? 2 : 32
      case 'heal':
      case 'nap':
        return user.hp * 2 < maxHp(user) ? 90 : 0
      case 'leech':
        return tv.leech || tTypes.includes('PLANT') ? 0 : 35
      case 'screen':
        return this.sides.foe.screens[e.which] > 0 ? 0 : 25
      case 'mist':
        return this.sides.foe.mist > 0 ? 0 : 10
      case 'focus':
        return uv.focus ? 0 : 15
      case 'haze':
        return Object.values(tv.stages).some((s) => s > 0) ? 40 : 1
      case 'wildcard':
        return 20
      default:
        return 1
    }
  }

  // ─────────────────────────────────────────────────────────── switching ───

  private switchOut(side: Side, partyIndex: number): void {
    const old = this.active(side)
    if (side === 'player') this.msg(`${displayName(old)}, come back!`)
    else this.msg(`${this.s.trainer?.className} ${this.s.trainer?.name} called back ${displayName(old)}!`)
    this.emit({ t: 'recall', side })
    this.sendIn(side, partyIndex, true)
  }

  /** Puts a party critter out on the field with fresh battle state. */
  private sendIn(side: Side, partyIndex: number, voluntary: boolean): void {
    const st = this.sides[side]
    // Whoever was holding the other side trapped lets go.
    const opp = this.sides[other(side)].v
    opp.bound = 0
    st.active = partyIndex
    st.v = freshVolatile()
    st.v.moved = true
    const c = st.party[partyIndex]
    if (side === 'player') {
      this.participants.add(partyIndex)
      this.msg(voluntary ? `Go, ${displayName(c)}!` : `Go! ${displayName(c)}, you're up!`)
    } else {
      this.participants = new Set([this.sides.player.active])
      this.msg(`${this.s.trainer?.className} ${this.s.trainer?.name} called out ${displayName(c)}!`)
    }
    this.send(side, partyIndex)
  }

  // ─────────────────────────────────────────────────────────────── items ───

  private useItem(a: Extract<Action, { kind: 'item' }>): void {
    const it = itemData(a.item)
    const e = it.effect
    if (a.side === 'foe') {
      const idx = a.partyIndex ?? -1
      if (idx >= 0) this.trainerItems[idx] = null
      const c = this.active('foe')
      const before = c.hp
      const res = applyItem(c, a.item)
      this.msg(`${this.s.trainer?.className} ${this.s.trainer?.name} used ${it.name}!`)
      this.emit({ t: 'item', side: 'foe', item: a.item })
      if (c.hp !== before) this.emit({ t: 'hp', side: 'foe', from: before, to: c.hp, maxHp: maxHp(c) })
      if (res.ok && res.text) this.msg(`Foe ${res.text}`)
      if (c.status === null) this.emit({ t: 'status', side: 'foe', status: null })
      return
    }
    this.s.bag.remove(a.item)
    if (e.kind === 'capsule') {
      this.throwCapsule(a.item, e.rate)
      return
    }
    this.msg(`${this.s.playerName} used ${it.name}!`)
    this.emit({ t: 'item', side: 'player', item: a.item })
    if (e.kind === 'battleStat') {
      const v = this.sides.player.v
      const name = displayName(this.active('player'))
      if (e.stat === 'crit') {
        v.focus = true
        this.msg(`${name} is concentrating!`)
      } else this.changeStage('player', e.stat, 1, false)
      return
    }
    const idx = a.partyIndex ?? this.sides.player.active
    const c = this.sides.player.party[idx]
    const before = c.hp
    const res = applyItem(c, a.item, a.moveSlot)
    if (idx === this.sides.player.active) {
      if (c.hp !== before) this.emit({ t: 'hp', side: 'player', from: before, to: c.hp, maxHp: maxHp(c) })
      this.emit({ t: 'status', side: 'player', status: c.status })
    }
    if (res.text) this.msg(res.text)
  }

  private throwCapsule(id: ItemId, rate: number): void {
    const foe = this.active('foe')
    this.msg(`${this.s.playerName} threw a ${itemData(id).name}!`)
    const sp = species(foe.species)
    const r = this.sides.foe.v.hidden ? { shakes: 0, caught: false } : rollCatch(maxHp(foe), foe.hp, sp.catchRate, rate, foe.status, this.rng)
    if (this.sides.foe.v.hidden) {
      this.msg('It sailed past! The critter is out of reach!')
      return
    }
    this.emit({ t: 'capsule', item: id, shakes: r.shakes, caught: r.caught })
    if (!r.caught) {
      this.msg(BURST[r.shakes])
      return
    }
    this.msg(`Clunk! ${displayName(foe)} is yours now!`)
    this.caught = foe
    this.finish('caught', 0)
  }

  private tryRun(): void {
    this.runTries++
    if (this.sides.player.v.bound > 0) {
      this.msg('You\'re trapped!')
      return
    }
    const chance = runChance(this.speedOf('player'), this.speedOf('foe'), this.runTries)
    if (this.rng.next() < chance) {
      this.msg('You slipped away!')
      this.finish('fled', 0)
    } else this.msg('It cut you off!')
  }

  // ─────────────────────────────────────────────────────────────── moves ───

  private useMove(side: Side, slot: number | null): void {
    const st = this.sides[side]
    const v = st.v
    const c = this.active(side)
    const name = this.label(side)

    if (v.recharge) {
      v.recharge = false
      this.msg(`${name} needs a breather!`)
      return
    }

    // Conditions that can stop a critter in its tracks.
    if (c.status === 'slp') {
      c.sleep--
      if (c.sleep > 0) {
        this.msg(`${name} is sound asleep.`)
        this.cancelCharge(side)
        return
      }
      c.status = null
      c.sleep = 0
      this.msg(`${name} woke up!`)
      this.emit({ t: 'status', side, status: null })
    }
    if (c.status === 'frz') {
      if (this.rng.chance(0.2)) {
        c.status = null
        this.msg(`${name} thawed out!`)
        this.emit({ t: 'status', side, status: null })
      } else {
        this.msg(`${name} is frozen stiff!`)
        this.cancelCharge(side)
        return
      }
    }
    if (v.flinch) {
      v.flinch = false
      this.msg(`${name} flinched!`)
      this.cancelCharge(side)
      return
    }
    if (v.confused > 0) {
      v.confused--
      if (v.confused === 0) this.msg(`${name} shook off its confusion!`)
      else {
        this.msg(`${name} is confused!`)
        if (this.rng.chance(0.5)) {
          this.msg('It stumbled and hurt itself!')
          const stats = calcStats(c)
          const dmg = damage({
            level: c.level,
            power: 40,
            attack: staged(stats.atk, v.stages.atk),
            defense: staged(stats.def, v.stages.def),
            stab: false,
            eff: 1,
            crit: false,
            roll: this.rng.int(217, 255),
          })
          this.hurt(side, dmg)
          this.cancelCharge(side)
          this.checkFaint(side)
          return
        }
      }
    }
    if (c.status === 'par' && this.rng.chance(0.25)) {
      this.msg(`${name} is too stiff to move!`)
      this.cancelCharge(side)
      return
    }

    // Which move.
    let id: MoveId
    if (v.charging) {
      id = v.charging
    } else if (slot === null || !c.moves[slot] || c.moves[slot].pp <= 0) {
      id = STRUGGLE
    } else {
      const ms = c.moves[slot]
      ms.pp--
      id = ms.id
    }
    let m = moveData(id)
    this.msg(`${name} used ${m.name}!`)
    if (m.effect?.kind === 'wildcard') {
      const pool = MOVE_IDS.filter((x) => x !== 'wildcard' && x !== STRUGGLE)
      id = this.rng.pick(pool)
      m = moveData(id)
      this.msg(`Out came ${m.name}!`)
    }

    // Two-turn moves.
    if (m.charge) {
      if (!v.charging) {
        v.charging = id
        if (m.charge === 'semi') {
          v.hidden = true
          this.emit({ t: 'hide', side, hidden: true })
          this.msg(id === 'burrow' ? `${name} dug underground!` : `${name} flew up high!`)
        } else this.msg(id === 'sunbeam' ? `${name} is soaking up light!` : `${name} is gathering its strength!`)
        return
      }
      v.charging = null
      if (v.hidden) {
        v.hidden = false
        this.emit({ t: 'hide', side, hidden: false })
      }
    }

    this.execute(side, m)
  }

  private cancelCharge(side: Side): void {
    const v = this.sides[side].v
    if (v.charging) {
      v.charging = null
      if (v.hidden) {
        v.hidden = false
        this.emit({ t: 'hide', side, hidden: false })
      }
    }
  }

  private execute(side: Side, m: MoveData): void {
    const tside = other(side)
    const user = this.active(side)
    const target = this.active(tside)
    const uv = this.sides[side].v
    const tv = this.sides[tside].v
    const selfMove = m.power === 0 && (m.effect?.kind !== 'status' && m.effect?.kind !== 'confuse' && m.effect?.kind !== 'leech' && !(m.effect?.kind === 'stage' && m.effect.who === 'foe') && m.effect?.kind !== 'escape')

    if (!selfMove) {
      if (target.hp <= 0) {
        this.msg('There was nothing to hit!')
        return
      }
      if (m.effect?.kind === 'dreamSip' && target.status !== 'slp') {
        this.msg('It didn\'t work!')
        return
      }
      let hit = !tv.hidden
      if (hit && m.acc > 0) hit = this.rng.next() < hitChance(m.acc, uv.stages.acc, tv.stages.eva)
      if (!hit) {
        this.emit({ t: 'miss', side })
        this.msg(`${this.label(side)} missed!`)
        if (m.crash) {
          this.msg(`${this.label(side)} crashed and hurt itself!`)
          this.hurt(side, Math.max(1, Math.floor(maxHp(user) / 8)))
          this.checkFaint(side)
        }
        if (m.selfKO) this.selfKO(side)
        return
      }
    }

    if (m.power > 0) this.attack(side, m)
    else {
      this.emit({ t: 'move', side, move: m.id as MoveId })
      this.statusEffect(side, m)
    }
  }

  private attack(side: Side, m: MoveData): void {
    const tside = other(side)
    const user = this.active(side)
    const target = this.active(tside)
    const uv = this.sides[side].v
    const tv = this.sides[tside].v
    const tTypes = species(target.species).types
    const eff = effectiveness(m.type, tTypes)
    this.emit({ t: 'move', side, move: m.id as MoveId })
    if (eff === 0) {
      this.msg(`${this.label(tside)} is unaffected…`)
      if (m.selfKO) this.selfKO(side)
      return
    }

    const hits = m.multi === undefined ? 1 : typeof m.multi === 'number' ? m.multi : multiHitCount(this.rng)
    let dealt = 0
    let landed = 0
    let crit = false
    let per = 0
    if (m.fixed !== undefined) {
      per = m.fixed === 'level' ? user.level : m.fixed === 'half' ? Math.max(1, Math.floor(target.hp / 2)) : m.fixed
    } else {
      crit = this.rng.next() < critChance(species(user.species).base.spd, !!m.highCrit, uv.focus)
      per = this.rollDamage(side, m, crit, eff)
    }
    for (let h = 0; h < hits && target.hp > 0; h++) {
      const before = target.hp
      const amount = Math.min(target.hp, per)
      target.hp -= amount
      dealt += amount
      landed++
      this.emit({ t: 'hp', side: tside, from: before, to: target.hp, maxHp: maxHp(target), eff: m.fixed !== undefined ? 1 : eff, crit })
      if (crit && hits === 1) this.msg('A lucky strike!')
    }
    if (crit && hits > 1) this.msg('A lucky strike!')
    if (m.fixed === undefined) {
      if (eff > 1) this.msg('It hit a weak spot!')
      else if (eff < 1) this.msg('It was shrugged off…')
    }
    if (hits > 1) this.msg(`Hit ${landed} time${landed === 1 ? '' : 's'}!`)

    // Thawing: fire melts ice.
    if (m.type === 'FIRE' && target.status === 'frz' && target.hp > 0) {
      target.status = null
      this.msg(`${this.label(tside)} thawed out!`)
      this.emit({ t: 'status', side: tside, status: null })
    }

    const drain = m.drain ?? (m.effect?.kind === 'dreamSip' ? 0.5 : 0)
    if (drain > 0 && dealt > 0 && user.hp > 0) {
      const before = user.hp
      user.hp = Math.min(maxHp(user), user.hp + Math.max(1, Math.floor(dealt * drain)))
      if (m.effect?.kind === 'dreamSip') this.msg(`${this.label(tside)}'s dream was drained!`)
      else this.msg(`${this.label(side)} drew out some health!`)
      if (user.hp !== before) this.emit({ t: 'hp', side, from: before, to: user.hp, maxHp: maxHp(user) })
    }
    if (m.recoil && dealt > 0 && user.hp > 0) {
      this.msg(`${this.label(side)} took some of the blow too!`)
      this.hurt(side, Math.max(1, Math.floor(dealt * m.recoil)))
    }
    if (m.effect?.kind === 'coins') {
      this.coins += 2 * user.level
      this.msg('Coins went flying!')
    }
    if (target.hp > 0 && m.effect && m.effect.kind !== 'coins' && m.effect.kind !== 'jinx' && m.effect.kind !== 'dreamSip') {
      const chance = m.chance ?? 100
      if (this.rng.next() * 100 < chance) this.secondary(side, m)
    }
    if (m.recharge && target.hp > 0) uv.recharge = true
    if (m.effect?.kind === 'bind' && target.hp > 0 && tv.bound === 0) {
      tv.bound = this.rng.int(2, 5)
      tv.boundBy = m.name
      this.msg(`${this.label(tside)} is trapped by ${m.name}!`)
    }
    if (m.selfKO) this.selfKO(side)
    this.checkFaint(tside)
    this.checkFaint(side)
  }

  private rollDamage(side: Side, m: MoveData, crit: boolean, eff: number): number {
    const tside = other(side)
    const user = this.active(side)
    const target = this.active(tside)
    const us = calcStats(user)
    const ts = calcStats(target)
    const uv = this.sides[side].v
    const tv = this.sides[tside].v
    const special = isSpecial(m.type)
    let attack: number
    let defense: number
    if (special) {
      attack = crit ? us.spc : staged(us.spc, uv.stages.spc)
      defense = crit ? ts.spc : staged(ts.spc, tv.stages.spc)
      if (!crit && this.sides[tside].screens.spec > 0) defense *= 2
    } else {
      attack = crit ? us.atk : staged(us.atk, uv.stages.atk)
      if (user.status === 'brn') attack = Math.max(1, Math.floor(attack / 2))
      defense = crit ? ts.def : staged(ts.def, tv.stages.def)
      if (!crit && this.sides[tside].screens.phys > 0) defense *= 2
    }
    let power = m.power
    if (m.effect?.kind === 'jinx' && target.status) power *= 2
    return damage({
      level: user.level,
      power,
      attack,
      defense,
      stab: species(user.species).types.includes(m.type),
      eff,
      crit,
      roll: this.rng.int(217, 255),
    })
  }

  /** The side effect of a damaging move that landed. */
  private secondary(side: Side, m: MoveData): void {
    const tside = other(side)
    const e = m.effect!
    switch (e.kind) {
      case 'status':
        this.inflict(tside, e.status, m.type, true)
        break
      case 'confuse':
        this.confuse(tside, true)
        break
      case 'flinch':
        if (!this.sides[tside].v.moved) this.sides[tside].v.flinch = true
        break
      case 'stage':
        if (e.who === 'self') this.changeStage(side, e.stat, e.n, true)
        else this.changeStage(tside, e.stat, e.n, true)
        break
      default:
        break
    }
  }

  private statusEffect(side: Side, m: MoveData): void {
    const tside = other(side)
    const user = this.active(side)
    const st = this.sides[side]
    const e = m.effect
    const name = this.label(side)
    if (!e) {
      this.msg('Nothing happened at all!')
      return
    }
    switch (e.kind) {
      case 'status':
        this.inflict(tside, e.status, m.type, false)
        break
      case 'confuse':
        this.confuse(tside, false)
        break
      case 'stage':
        this.changeStage(e.who === 'self' ? side : tside, e.stat, e.n, false)
        break
      case 'stages':
        for (const s of e.stats) this.changeStage(side, s, e.n, false)
        break
      case 'heal': {
        const mh = maxHp(user)
        if (user.hp >= mh) {
          this.msg('It didn\'t work!')
          break
        }
        const before = user.hp
        user.hp = Math.min(mh, user.hp + Math.floor(mh / 2))
        this.emit({ t: 'hp', side, from: before, to: user.hp, maxHp: mh })
        this.msg(`${name} patched itself up!`)
        break
      }
      case 'nap': {
        const mh = maxHp(user)
        if (user.hp >= mh && !user.status) {
          this.msg('It didn\'t work!')
          break
        }
        const before = user.hp
        user.hp = mh
        user.status = 'slp'
        user.sleep = 3
        st.v.toxic = 0
        this.emit({ t: 'status', side, status: 'slp' })
        this.emit({ t: 'hp', side, from: before, to: mh, maxHp: mh })
        this.msg(`${name} took a nap and woke up refreshed!`)
        break
      }
      case 'leech': {
        const tv = this.sides[tside].v
        if (tv.leech || species(this.active(tside).species).types.includes('PLANT')) {
          this.msg('It didn\'t work!')
          break
        }
        tv.leech = true
        this.msg(`A vine took hold of ${this.label(tside)}!`)
        break
      }
      case 'screen': {
        if (st.screens[e.which] > 0) {
          this.msg('It didn\'t work!')
          break
        }
        st.screens[e.which] = 5
        this.msg(e.which === 'phys' ? `${name}'s side is guarded from physical blows!` : `${name}'s side is guarded from special attacks!`)
        break
      }
      case 'mist':
        if (st.mist > 0) {
          this.msg('It didn\'t work!')
          break
        }
        st.mist = 5
        this.msg(`${name} is wrapped in a frosty veil!`)
        break
      case 'focus':
        if (st.v.focus) {
          this.msg('It didn\'t work!')
          break
        }
        st.v.focus = true
        this.msg(`${name} is concentrating!`)
        break
      case 'haze':
        for (const sd of ['player', 'foe'] as Side[]) {
          const v = this.sides[sd].v
          for (const k of Object.keys(v.stages) as StageKey[]) v.stages[k] = 0
        }
        this.msg('Every stat change was wiped away!')
        break
      case 'escape':
        if (this.s.kind !== 'wild') {
          this.msg('It didn\'t work!')
          break
        }
        if (side === 'player') this.msg(`${name} slipped away!`)
        else this.msg(`${name} ran off!`)
        this.finish('fled', 0)
        break
      case 'nothing':
        this.msg('Nothing happened at all!')
        break
      default:
        this.msg('It didn\'t work!')
        break
    }
  }

  private inflict(tside: Side, status: StatusId, type: TypeId, secondary: boolean): void {
    const t = this.active(tside)
    const types = species(t.species).types
    if (t.status) {
      if (!secondary) this.msg(`${this.label(tside)} ${ALREADY[t.status]}`)
      return
    }
    if (IMMUNE[status] && IMMUNE[status] === type && types.includes(type)) {
      if (!secondary) this.msg(`${this.label(tside)} is unaffected…`)
      return
    }
    if (status === 'par' && type === 'SPARK' && types.includes('EARTH')) {
      if (!secondary) this.msg(`${this.label(tside)} is unaffected…`)
      return
    }
    t.status = status
    if (status === 'slp') t.sleep = this.rng.int(2, 5)
    if (status === 'tox') this.sides[tside].v.toxic = 1
    this.emit({ t: 'status', side: tside, status })
    this.msg(`${this.label(tside)} ${INFLICT[status]}`)
  }

  private confuse(tside: Side, secondary: boolean): void {
    const v = this.sides[tside].v
    if (v.confused > 0) {
      if (!secondary) this.msg(`${this.label(tside)} is already confused!`)
      return
    }
    v.confused = this.rng.int(2, 5) + 1
    this.msg(`${this.label(tside)} became confused!`)
  }

  private changeStage(side: Side, stat: StageKey, n: number, secondary: boolean): void {
    const st = this.sides[side]
    const name = this.label(side)
    if (n < 0 && st.mist > 0 && !secondary) {
      this.msg(`${name} is protected by its frosty veil!`)
      return
    }
    if (n < 0 && st.mist > 0) return
    const cur = st.v.stages[stat]
    const nextVal = clampStage(cur + n)
    if (nextVal === cur) {
      if (!secondary) this.msg(`${name}'s ${STAGE_NAME[stat]} can't go any ${n > 0 ? 'higher' : 'lower'}!`)
      return
    }
    st.v.stages[stat] = nextVal
    this.emit({ t: 'stat', side, stat, delta: nextVal - cur })
    const big = Math.abs(n) >= 2
    this.msg(`${name}'s ${STAGE_NAME[stat]} ${n > 0 ? (big ? 'rose sharply' : 'rose') : big ? 'fell sharply' : 'fell'}!`)
  }

  private hurt(side: Side, amount: number): void {
    const c = this.active(side)
    const before = c.hp
    c.hp = Math.max(0, c.hp - Math.max(0, amount))
    if (c.hp !== before) this.emit({ t: 'hp', side, from: before, to: c.hp, maxHp: maxHp(c) })
  }

  private selfKO(side: Side): void {
    const c = this.active(side)
    if (c.hp > 0) this.hurt(side, c.hp)
    this.checkFaint(side)
  }

  // ───────────────────────────────────────────────────────────── fainting ───

  private readonly fainted: Record<Side, boolean> = { player: false, foe: false }

  /** Announces a faint once, and (for a foe) hands out experience. */
  private checkFaint(side: Side): void {
    const c = this.active(side)
    if (c.hp > 0 || this.fainted[side]) return
    this.fainted[side] = true
    c.status = null
    c.sleep = 0
    const st = this.sides[side]
    st.v.charging = null
    st.v.hidden = false
    this.emit({ t: 'faint', side })
    this.msg(`${this.label(side)} fainted!`)
    if (side === 'foe') this.awardXp(c)
    else this.participants.delete(st.active)
  }

  private awardXp(foe: Critter): void {
    const party = this.sides.player.party
    const base = xpYield(species(foe.species).exp, foe.level, this.s.kind === 'trainer')
    const fighters = [...this.participants].filter((i) => party[i] && party[i].hp > 0)
    const share = fighters.length ? Math.max(1, Math.floor(base / fighters.length)) : 0
    const gifts: [number, number][] = fighters.map((i) => [i, share])
    if (this.s.shareCharm) {
      party.forEach((c, i) => {
        if (c.hp > 0 && !fighters.includes(i)) gifts.push([i, Math.max(1, Math.floor(share / 2))])
      })
      if (gifts.length > fighters.length) this.msg('The SHARE CHARM shared the experience!')
    }
    for (const [i, amount] of gifts) this.next(() => this.giveXp(i, amount, foe))
  }

  private giveXp(i: number, amount: number, foe: Critter): void {
    const c = this.sides.player.party[i]
    gainStatExp(c, foe.species)
    if (c.level >= 100) return
    this.msg(`${displayName(c)} earned ${amount} XP!`)
    let from = xpFraction(c)
    const startLevel = c.level
    const steps = gainXp(c, amount)
    if (!steps.length) {
      this.emit({ t: 'xp', partyIndex: i, from, to: xpFraction(c), level: c.level })
      return
    }
    const follow: (() => void)[] = []
    let lv = startLevel
    for (const step of steps) {
      this.emit({ t: 'xp', partyIndex: i, from, to: 1, level: lv })
      from = 0
      lv = step.level
      this.leveled.add(i)
      this.emit({ t: 'level', partyIndex: i, level: step.level, before: step.before, after: step.after })
      this.msg(`${displayName(c)} reached level ${step.level}!`)
      for (const m of step.moves) {
        if (learnFree(c, m)) {
          this.emit({ t: 'learned', partyIndex: i, move: m })
          this.msg(`${displayName(c)} picked up ${moveData(m).name}!`)
        } else if (!c.moves.some((s) => s.id === m)) follow.push(() => this.ask({ kind: 'learn', partyIndex: i, move: m }))
      }
    }
    this.emit({ t: 'xp', partyIndex: i, from: 0, to: xpFraction(c), level: c.level })
    if (i === this.sides.player.active) this.send('player', i)
    if (follow.length) this.next(...follow)
  }

  // ─────────────────────────────────────────────────────────── end of turn ───

  private endTurn(): void {
    if (this.over) return
    for (const side of ['player', 'foe'] as Side[]) this.residual(side)
    for (const side of ['player', 'foe'] as Side[]) {
      const st = this.sides[side]
      st.v.flinch = false
      for (const k of ['phys', 'spec'] as const) {
        if (st.screens[k] > 0 && --st.screens[k] === 0) this.msg(`${this.labelSide(side)} ${k === 'phys' ? 'GUARD WALL' : 'MIND WALL'} wore off!`)
      }
      if (st.mist > 0 && --st.mist === 0) this.msg(`${this.labelSide(side)} frosty veil faded!`)
    }
    this.queue.push(() => this.replaceFainted())
  }

  private labelSide(side: Side): string {
    return side === 'player' ? 'Your' : 'The foe\'s'
  }

  private residual(side: Side): void {
    const c = this.active(side)
    if (c.hp <= 0) return
    const v = this.sides[side].v
    const mh = maxHp(c)
    const name = this.label(side)
    if (c.status === 'psn' || c.status === 'tox') {
      const n = c.status === 'tox' ? Math.max(1, Math.floor((mh * v.toxic) / 16)) : Math.max(1, Math.floor(mh / 16))
      if (c.status === 'tox') v.toxic = Math.min(15, v.toxic + 1)
      this.msg(`${name} is hurt by poison!`)
      this.hurt(side, n)
    } else if (c.status === 'brn') {
      this.msg(`${name} is hurt by its burn!`)
      this.hurt(side, Math.max(1, Math.floor(mh / 16)))
    }
    if (c.hp > 0 && v.leech) {
      const opp = this.active(other(side))
      const n = Math.min(c.hp, Math.max(1, Math.floor(mh / 16)))
      this.msg(`The vine saps ${name}!`)
      this.hurt(side, n)
      if (opp.hp > 0) {
        const before = opp.hp
        opp.hp = Math.min(maxHp(opp), opp.hp + n)
        if (opp.hp !== before) this.emit({ t: 'hp', side: other(side), from: before, to: opp.hp, maxHp: maxHp(opp) })
      }
    }
    if (c.hp > 0 && v.bound > 0) {
      this.msg(`${name} is hurt by ${v.boundBy}!`)
      this.hurt(side, Math.max(1, Math.floor(mh / 16)))
      if (--v.bound === 0 && c.hp > 0) this.msg(`${name} broke free of ${v.boundBy}!`)
    }
    this.checkFaint(side)
    if (side === 'player') this.checkFaint('foe')
  }

  private replaceFainted(): void {
    if (this.over) return
    const foe = this.sides.foe
    const pl = this.sides.player
    const playerLeft = pl.party.some((c) => c.hp > 0)
    if (!playerLeft) {
      this.lose()
      return
    }
    if (this.active('foe').hp <= 0) {
      const nextFoe = foe.party.findIndex((c) => c.hp > 0)
      if (nextFoe < 0) {
        this.win()
        return
      }
      this.fainted.foe = false
      this.emit({ t: 'trainerParty', side: 'foe', alive: foe.party.map((c) => c.hp > 0) })
      this.sendIn('foe', nextFoe, false)
    }
    if (this.active('player').hp <= 0) {
      this.fainted.player = false
      this.ask({ kind: 'switch', forced: true })
    }
  }

  private win(): void {
    let money = 0
    const t = this.s.trainer
    if (t) {
      const last = this.s.foes[this.s.foes.length - 1]
      money = t.prize * last.level
      this.msg(`${this.s.playerName} beat ${t.className} ${t.name}!`)
      if (t.loseText) this.msg(t.loseText)
    }
    if (money > 0) this.msg(`${this.s.playerName} earned ¤${money} in prize money!`)
    if (this.coins > 0) {
      this.msg(`${this.s.playerName} gathered up ¤${this.coins} in coins!`)
      money += this.coins
    }
    this.finish('win', money)
  }

  private lose(): void {
    const name = this.s.playerName
    this.msg(`${name} has no critters left standing!`)
    let money = 0
    if (this.s.playerMoney !== undefined) {
      money = -Math.floor(this.s.playerMoney / 2)
      if (money < 0) this.msg(`${name} dropped ¤${-money} in the panic…`)
    }
    this.msg('…and everything went dark!')
    this.finish('lose', money)
  }

  private finish(outcome: Outcome, money: number): void {
    if (this.over) return
    this.over = true
    this.queue = []
    for (const side of ['player', 'foe'] as Side[]) {
      const v = this.sides[side].v
      if (v.hidden) this.emit({ t: 'hide', side, hidden: false })
    }
    this.ask({ kind: 'end', outcome, money, caught: this.caught, leveled: [...this.leveled].sort((a, b) => a - b) })
  }

  /** Stats of the critter on a side as the battle sees them, for tests. */
  battleStats(side: Side): Stats {
    const c = this.active(side)
    const s = calcStats(c)
    const v = this.sides[side].v
    return { hp: s.hp, atk: staged(s.atk, v.stages.atk), def: staged(s.def, v.stages.def), spd: this.speedOf(side), spc: staged(s.spc, v.stages.spc) }
  }
}
