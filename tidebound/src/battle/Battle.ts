/**
 * The battle engine: single battles, one active beast a side. Turns resolve
 * per docs/DESIGN.md and come out as BattleEvents for the scene to animate.
 *
 * Internally a battle is a queue of small steps. Each choice queues the
 * steps of a turn; the steps run until one of them needs the player (a
 * prompt), and the rest wait in the queue until the answer comes back. That
 * lets a move-learning prompt or a forced switch pop up in the middle of a
 * turn's aftermath and carry on afterwards exactly where it left off.
 */
import { Rng } from '../core/rng'
import { ALL_ITEMS, item as itemData, type HoldEffect, type ItemData, type ItemId } from '../data/items'
import { move as moveData, STRUGGLE, type MoveData, type MoveEffect } from '../data/moves'
import { species } from '../data/species'
import type { TypeId } from '../data/types'
import { applyItem, calcStats, creatureView, cureText, displayName, gainEffort, itemWouldWork, levelUp, maxHp, typesOf, xpFraction } from './creature'
import {
  catchValue,
  clampStage,
  critChance,
  critStages,
  damage,
  hitChance,
  MAX_LEVEL,
  multiHitCount,
  rollCatch,
  runChance,
  stageMultiplier,
  xpForLevel,
  xpShare,
  xpYield,
} from './formulas'
import { ability, abilityOf, type AbilityId } from './abilities'
import { effectiveness } from './typechart'
import type {
  BattleApi,
  BattleEvent,
  BattleSetup,
  BattleViewState,
  Choice,
  Creature,
  Effectiveness,
  MoveId,
  Outcome,
  Prompt,
  Side,
  StageKey,
  StatusId,
  Weather,
} from './types'

type Step = () => void

type EndPrompt = Extract<Prompt, { kind: 'end' }>
type LearnPrompt = Extract<Prompt, { kind: 'learn' }>
type SwitchPrompt = Extract<Prompt, { kind: 'switch' }>

type Action =
  /** `slot` null means STRUGGLE. */
  | { kind: 'move'; side: Side; slot: number | null }
  | { kind: 'switch'; side: 'player'; partyIndex: number }
  | { kind: 'item'; side: Side; item: ItemId; partyIndex?: number }
  | { kind: 'run'; side: 'player' }

/** Battle-only state of the active beast on one side; reset when it leaves. */
interface Volatile {
  stages: Record<StageKey, number>
  /** Bad-poison counter: the next tick deals toxic/16. */
  toxic: number
  flinch: boolean
  /** Its faint has been announced. */
  fainted: boolean
}

const STAGE_NAME: Record<StageKey, string> = {
  atk: 'ATTACK',
  def: 'DEFENSE',
  spa: 'SP. ATK',
  spd: 'SP. DEF',
  spe: 'SPEED',
  acc: 'ACCURACY',
  eva: 'EVASION',
}

const INFLICT_TEXT: Record<StatusId, string> = {
  psn: 'was poisoned!',
  tox: 'was badly poisoned!',
  brn: 'was burned!',
  par: 'went stiff with paralysis!',
  slp: 'fell asleep!',
  frz: 'froze solid!',
}

/** What the text says when a beast breaks out after 0–3 shakes. */
const BREAK_FREE = [
  'It burst out at once!',
  'Argh! It broke free!',
  'So close! It wriggled out!',
  'Gah! It escaped at the last second!',
]

const other = (s: Side): Side => (s === 'player' ? 'foe' : 'player')

const freshVolatile = (): Volatile => ({
  stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
  toxic: 1,
  flinch: false,
  fainted: false,
})

function firstUsable(list: readonly Creature[]): number {
  return list.findIndex((c) => c.hp > 0)
}

function countUsable(list: readonly Creature[]): number {
  return list.reduce((n, c) => n + (c.hp > 0 ? 1 : 0), 0)
}

function findEffect<K extends MoveEffect['kind']>(m: MoveData, kind: K): Extract<MoveEffect, { kind: K }> | undefined {
  return m.effects.find((e): e is Extract<MoveEffect, { kind: K }> => e.kind === kind)
}

/** FLAME can't be burned, TOXIC and METAL can't be poisoned, FROST can't be frozen, VOLT can't be paralysed. */
export function statusImmune(types: readonly TypeId[], status: StatusId): boolean {
  switch (status) {
    case 'brn':
      return types.includes('flame')
    case 'psn':
    case 'tox':
      return types.includes('toxic') || types.includes('metal')
    case 'frz':
      return types.includes('frost')
    case 'par':
      return types.includes('volt')
    default:
      return false
  }
}

function stageWords(delta: number): string {
  if (delta >= 3) return 'rose drastically!'
  if (delta === 2) return 'rose sharply!'
  if (delta === 1) return 'rose!'
  if (delta === -1) return 'fell!'
  if (delta === -2) return 'fell sharply!'
  return 'fell drastically!'
}

function article(name: string): string {
  return /^[AEIOU]/.test(name) ? 'an' : 'a'
}

const ITEM_BY_ID = new Map<string, ItemData>(ALL_ITEMS.map((i) => [i.id, i]))

/**
 * Scrambles the setup seed (a 32-bit finaliser) so consecutive seeds, as a
 * save file hands them out, give unrelated battles: the Rng's first few
 * outputs are noticeably correlated across seeds 1, 2, 3...
 */
export function mixSeed(seed: number): number {
  let h = seed >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

export class Battle implements BattleApi {
  private readonly setup: BattleSetup
  private readonly rng: Rng
  private readonly party: Creature[]
  private readonly foes: Creature[]
  private pIdx: number
  private fIdx: number
  private readonly vol: Record<Side, Volatile> = { player: freshVolatile(), foe: freshVolatile() }
  /** Party indexes that have faced the current foe beast. */
  private participants = new Set<number>()
  private readonly leveled = new Set<number>()
  private runAttempts = 0
  /** Rain or sun, and turns left (Infinity when an ability brought it). */
  private weather: { kind: Weather; turns: number } | null = null
  private readonly trainerItems: ItemId[]
  private caught: Creature | undefined

  private events: BattleEvent[] = []
  private queue: Step[] = []
  /** Steps queued by the step that is running; they go to the front of the queue after it. */
  private buffer: Step[] | null = null
  private waiting: Prompt | null = null
  private started = false
  private ended = false
  /** Set when a side runs out of beasts: the rest of the turn is skipped. */
  private turnOver = false

  constructor(setup: BattleSetup) {
    if (!setup.party.length) throw new Error('Battle: the player has no beasts')
    if (!setup.foes.length) throw new Error('Battle: there are no foes')
    this.setup = setup
    this.rng = new Rng(mixSeed(setup.seed))
    this.party = setup.party
    this.foes = setup.foes
    this.pIdx = Math.max(0, firstUsable(this.party))
    this.fIdx = Math.max(0, firstUsable(this.foes))
    this.trainerItems = setup.kind === 'trainer' ? [...(setup.trainer?.items ?? [])] : []
  }

  // ---------------------------------------------------------------- API

  start(): BattleEvent[] {
    if (this.started) return this.repeatPrompt()
    this.started = true
    this.enqueue(() => this.opening())
    return this.flush()
  }

  choose(choice: Choice): BattleEvent[] {
    if (!this.started) return this.start()
    const p = this.waiting
    if (!p) return this.flush()
    if (p.kind === 'end') return [{ t: 'prompt', prompt: p }]
    this.waiting = null
    if (p.kind === 'action') this.onAction(choice)
    else if (p.kind === 'switch') this.onSwitch(choice, p)
    else this.onLearn(choice, p)
    return this.flush()
  }

  view(): BattleViewState {
    const p = this.party[this.pIdx]
    const f = this.foes[this.fIdx]
    return {
      player: creatureView(p),
      foe: creatureView(f, false),
      active: this.pIdx,
      moves: p.moves.map((s) => {
        const m = moveData(s.id)
        return { id: s.id, name: m.name, type: m.type, pp: s.pp, maxPp: m.pp }
      }),
      canRun: this.setup.kind === 'wild' && !this.setup.noRun,
      canCatch: this.setup.kind === 'wild',
    }
  }

  /** The prompt the battle is waiting on, if any. */
  pending(): Prompt | null {
    return this.waiting
  }

  // ---------------------------------------------------------- the queue

  private emit(e: BattleEvent): void {
    this.events.push(e)
  }

  private msg(text: string): void {
    this.events.push({ t: 'msg', text })
  }

  private ask(p: Prompt): void {
    this.waiting = p
    this.events.push({ t: 'prompt', prompt: p })
  }

  /** Runs `steps` next, in order, before anything already queued. */
  private enqueue(...steps: Step[]): void {
    if (this.buffer) this.buffer.push(...steps)
    else this.queue.unshift(...steps)
  }

  private flush(): BattleEvent[] {
    let guard = 0
    while (!this.waiting) {
      if (++guard > 100_000) throw new Error('Battle: the turn loop did not settle')
      const step = this.queue.shift()
      if (step) {
        const buf: Step[] = []
        this.buffer = buf
        step()
        this.buffer = null
        this.queue.unshift(...buf)
      } else {
        this.settle()
      }
    }
    const out = this.events
    this.events = []
    return out
  }

  private repeatPrompt(): BattleEvent[] {
    return this.waiting ? [{ t: 'prompt', prompt: this.waiting }] : this.flush()
  }

  /** Nothing left to run: end the battle, bring in replacements, or ask for the next action. */
  private settle(): void {
    if (!countUsable(this.foes)) return this.enqueue(() => this.win())
    if (!countUsable(this.party)) return this.enqueue(() => this.lose())
    if (this.foes[this.fIdx].hp <= 0) return this.enqueue(() => this.sendNextFoe())
    if (this.party[this.pIdx].hp <= 0) return this.ask({ kind: 'switch', forced: true })
    this.ask({ kind: 'action' })
  }

  // ------------------------------------------------------------ helpers

  private active(side: Side): Creature {
    return side === 'player' ? this.party[this.pIdx] : this.foes[this.fIdx]
  }

  /** How messages name a side's active beast: "X", "Wild X" or "Foe X". */
  private label(side: Side): string {
    const name = displayName(this.active(side))
    if (side === 'player') return name
    return this.setup.kind === 'wild' ? `Wild ${name}` : `Foe ${name}`
  }

  private get trainerName(): string {
    const t = this.setup.trainer
    const name = t ? `${t.className} ${t.name}`.trim() : ''
    return name || 'The TRAINER'
  }

  private resetVolatile(side: Side): void {
    this.vol[side] = freshVolatile()
  }

  private speedOf(side: Side): number {
    const c = this.active(side)
    const par = c.status === 'par' ? 0.25 : 1
    const swift = this.weather?.kind === 'rain' && this.has(side, 'tiderider') ? 2 : 1
    return Math.floor(calcStats(c).spe * stageMultiplier(this.vol[side].stages.spe) * par * swift)
  }

  private roll(chance: number): boolean {
    return chance >= 100 || this.rng.next() * 100 < chance
  }

  private hurt(side: Side, amount: number): void {
    const c = this.active(side)
    const from = c.hp
    c.hp = Math.max(0, from - amount)
    if (c.hp !== from) this.emit({ t: 'hp', side, from, to: c.hp, maxHp: maxHp(c) })
  }

  private heal(side: Side, amount: number): void {
    const c = this.active(side)
    const max = maxHp(c)
    const from = c.hp
    c.hp = Math.min(max, from + amount)
    if (c.hp !== from) this.emit({ t: 'hp', side, from, to: c.hp, maxHp: max })
  }

  private setStatus(side: Side, status: StatusId | null, sleepTurns?: number): void {
    const c = this.active(side)
    c.status = status
    c.sleepTurns = status === 'slp' ? (sleepTurns ?? this.rng.int(1, 3)) : 0
    if (status === 'tox') this.vol[side].toxic = 1
    this.emit({ t: 'status', side, status })
  }

  // ------------------------------------------------------- abilities

  /** Whether the active beast on `side` has this ability (and is standing). */
  private has(side: Side, id: AbilityId): boolean {
    const c = this.active(side)
    return c.hp > 0 && abilityOf(c) === id
  }

  private abilityName(side: Side): string {
    return ability(abilityOf(this.active(side))).name
  }

  /** What happens as a beast comes out: MENACE cows the foe, STORMCALLER brings rain. */
  private enter(side: Side): void {
    const foe = other(side)
    if (this.has(side, 'menace') && this.active(foe).hp > 0) {
      this.msg(`${this.label(side)}'s ${this.abilityName(side)} cows ${this.label(foe)}!`)
      this.changeStages(foe, { atk: -1 }, true, true)
    }
    if (this.has(side, 'stormcaller') && this.weather?.kind !== 'rain') {
      this.setWeather('rain', Infinity, `${this.label(side)}'s ${this.abilityName(side)} brought rain!`)
    }
  }

  private setWeather(kind: Weather, turns: number, text: string): void {
    this.weather = { kind, turns }
    this.emit({ t: 'weather', weather: kind })
    this.msg(text)
  }

  /** Rain and sun power up or dampen TIDE and FLAME moves. */
  private weatherMultiplier(type: TypeId): number {
    const w = this.weather?.kind
    if (!w) return 1
    if (type === 'tide') return w === 'rain' ? 1.5 : 0.5
    if (type === 'flame') return w === 'sun' ? 1.5 : 0.5
    return 1
  }

  /** An ability that makes `m` useless against `side`: HOVER against EARTH, SOAKUP against TIDE. */
  private abilityImmune(side: Side, m: MoveData): 'hover' | 'soakup' | null {
    if (m.typeless) return null
    if (m.type === 'earth' && this.has(side, 'hover')) return 'hover'
    if (m.type === 'tide' && this.has(side, 'soakup')) return 'soakup'
    return null
  }

  /** Says why the move failed against an ability, healing SOAKUP. */
  private absorb(side: Side, kind: 'hover' | 'soakup'): void {
    const name = this.label(side)
    const ab = this.abilityName(side)
    if (kind === 'hover') return this.msg(`${name} floats clear with ${ab}!`)
    const c = this.active(side)
    if (c.hp < maxHp(c)) {
      this.heal(side, Math.max(1, Math.floor(maxHp(c) / 4)))
      this.msg(`${name}'s ${ab} soaked it up and restored HP!`)
    } else this.msg(`${name}'s ${ab} soaked it up!`)
  }

  // ------------------------------------------------------- held items

  /** The held effect of the active beast on `side`, when it is standing. */
  private holding(side: Side): HoldEffect | null {
    const c = this.active(side)
    return c.hp > 0 && c.item ? (itemData(c.item).hold ?? null) : null
  }

  /** Eats a held berry: it is used up. Returns its name. */
  private eat(side: Side): string {
    const c = this.active(side)
    const id = c.item
    if (!id) return 'BERRY'
    c.item = null
    this.emit({ t: 'item', side, item: id })
    return itemData(id).name
  }

  /** After taking damage: a healing berry at half HP, an ATTACK berry at a quarter. */
  private afterHurt(side: Side): void {
    const c = this.active(side)
    const hold = this.holding(side)
    if (!hold || c.hp <= 0) return
    const max = maxHp(c)
    if (hold.kind === 'berryHeal' && c.hp <= max / 2) {
      const berry = this.eat(side)
      this.heal(side, hold.hp)
      this.msg(`${this.label(side)} ate its ${berry} and regained HP!`)
    } else if (hold.kind === 'berryAttack' && c.hp <= max / 4 && this.vol[side].stages.atk < 6) {
      const berry = this.eat(side)
      this.msg(`${this.label(side)} ate its ${berry}!`)
      this.changeStages(side, { atk: 1 }, false)
    }
  }

  /** As soon as a status problem strikes, a curing berry is eaten. */
  private afterStatus(side: Side): void {
    const c = this.active(side)
    if (!c.status || this.holding(side)?.kind !== 'berryCure') return
    const berry = this.eat(side)
    const text = cureText(this.label(side), c.status)
    this.setStatus(side, null)
    this.msg(`${this.label(side)} ate its ${berry}! ${text}`)
  }

  // ------------------------------------------------------------ opening

  private opening(): void {
    const fi = firstUsable(this.foes)
    const pi = firstUsable(this.party)
    if (fi < 0 || pi < 0) return // settle() ends it
    this.fIdx = fi
    this.resetVolatile('foe')
    const foe = this.foes[fi]
    if (this.setup.kind === 'trainer') {
      this.msg(`${this.trainerName} challenges you to a battle!`)
      this.emit({ t: 'trainerParty', remaining: countUsable(this.foes) })
      this.msg(`${this.trainerName} called out ${displayName(foe)}!`)
      this.emit({ t: 'send', side: 'foe', partyIndex: fi, view: creatureView(foe, false) })
    } else {
      this.emit({ t: 'send', side: 'foe', partyIndex: fi, view: creatureView(foe, false) })
      this.msg(`A wild ${displayName(foe)} leapt out!`)
    }
    this.pIdx = pi
    this.resetVolatile('player')
    this.participants = new Set([pi])
    const me = this.party[pi]
    this.msg(`Go for it, ${displayName(me)}!`)
    this.emit({ t: 'send', side: 'player', partyIndex: pi, view: creatureView(me) })
    const first: Side = this.speedOf('player') >= this.speedOf('foe') ? 'player' : 'foe'
    this.enter(first)
    this.enter(other(first))
  }

  // ------------------------------------------------------------ choices

  private onAction(choice: Choice): void {
    const again = (text?: string): void => {
      if (text) this.msg(text)
      this.ask({ kind: 'action' })
    }
    const me = this.party[this.pIdx]
    switch (choice.kind) {
      case 'move': {
        if (!me.moves.some((s) => s.pp > 0)) return this.beginTurn({ kind: 'move', side: 'player', slot: null })
        const slot = choice.slot
        const s = Number.isInteger(slot) ? me.moves[slot] : undefined
        if (!s) return again()
        if (s.pp <= 0) return again("There's no PP left for this move!")
        return this.beginTurn({ kind: 'move', side: 'player', slot })
      }
      case 'switch': {
        const err = this.switchError(choice.partyIndex)
        if (err) return again(err)
        return this.beginTurn({ kind: 'switch', side: 'player', partyIndex: choice.partyIndex })
      }
      case 'item': {
        const data = ITEM_BY_ID.get(choice.item)
        if (!data || !data.battle) return again("That can't be used now.")
        if (this.setup.bag.count(choice.item) <= 0) return again(`You're out of ${data.name}!`)
        if (data.use.kind === 'orb') {
          if (this.setup.kind !== 'wild') return again("You can't catch another trainer's beast!")
          return this.beginTurn({ kind: 'item', side: 'player', item: choice.item })
        }
        const target = choice.partyIndex ?? this.pIdx
        const c = Number.isInteger(target) ? this.party[target] : undefined
        if (!c) return again()
        if (!itemWouldWork(c, choice.item)) return again("It won't have any effect.")
        return this.beginTurn({ kind: 'item', side: 'player', item: choice.item, partyIndex: target })
      }
      case 'run': {
        if (this.setup.kind !== 'wild') return again("You can't run from a trainer battle!")
        if (this.setup.noRun) return again("There's no escape!")
        return this.beginTurn({ kind: 'run', side: 'player' })
      }
      default:
        return again()
    }
  }

  /** Why party beast `i` can't come out, or null if it can. */
  private switchError(i: number): string | null {
    const c = Number.isInteger(i) ? this.party[i] : undefined
    if (!c) return 'There is no beast there.'
    if (c.hp <= 0) return `${displayName(c)} has no energy left to battle!`
    if (i === this.pIdx) return `${displayName(c)} is already out!`
    return null
  }

  private onSwitch(choice: Choice, p: SwitchPrompt): void {
    if (choice.kind !== 'switch') return this.ask(p)
    const err = this.switchError(choice.partyIndex)
    if (err) {
      this.msg(err)
      return this.ask(p)
    }
    this.switchIn(choice.partyIndex, false)
  }

  private onLearn(choice: Choice, p: LearnPrompt): void {
    if (choice.kind !== 'learn') return this.ask(p)
    const c = this.party[p.partyIndex]
    const m = moveData(p.move)
    const name = displayName(c)
    if (choice.forgetSlot === null) {
      this.msg(`${name} did not learn ${m.name}.`)
      return
    }
    const slot = choice.forgetSlot
    if (!Number.isInteger(slot) || slot < 0 || slot >= c.moves.length) return this.ask(p)
    const old = moveData(c.moves[slot].id)
    c.moves[slot] = { id: p.move, pp: m.pp }
    this.msg(`${name} forgot ${old.name}...`)
    this.msg(`...and learned ${m.name}!`)
    this.emit({ t: 'learned', partyIndex: p.partyIndex, move: p.move })
  }

  // --------------------------------------------------------------- turns

  private beginTurn(player: Action): void {
    this.turnOver = false
    this.vol.player.flinch = false
    this.vol.foe.flinch = false
    const foe = this.foeAction()
    const order = this.order(player, foe)
    this.enqueue(...order.map((a) => () => this.perform(a)), () => this.endOfTurn())
  }

  /** Switching, items and running go first (the player's before the foe's), then moves by priority and speed. */
  private order(p: Action, f: Action): Action[] {
    if (p.kind !== 'move') return [p, f]
    if (f.kind !== 'move') return [f, p]
    const pp = this.priorityOf(p)
    const fp = this.priorityOf(f)
    if (pp !== fp) return pp > fp ? [p, f] : [f, p]
    const ps = this.speedOf('player')
    const fs = this.speedOf('foe')
    if (ps !== fs) return ps > fs ? [p, f] : [f, p]
    return this.rng.chance(0.5) ? [p, f] : [f, p]
  }

  private priorityOf(a: Extract<Action, { kind: 'move' }>): number {
    if (a.slot === null) return 0
    const s = this.active(a.side).moves[a.slot]
    return s ? moveData(s.id).priority : 0
  }

  private perform(a: Action): void {
    if (this.turnOver || this.ended) return
    switch (a.kind) {
      case 'run':
        return this.tryRun()
      case 'switch':
        return this.switchIn(a.partyIndex, true)
      case 'item':
        return a.side === 'player' ? this.playerItem(a.item, a.partyIndex) : this.foeItem(a.item)
      case 'move':
        return this.useMove(a.side, a.slot)
    }
  }

  private endOfTurn(): void {
    if (this.turnOver || this.ended) return
    if (this.weather) {
      if (--this.weather.turns <= 0) {
        this.msg(this.weather.kind === 'rain' ? 'The rain stopped.' : 'The sunlight faded.')
        this.weather = null
        this.emit({ t: 'weather', weather: null })
      } else this.msg(this.weather.kind === 'rain' ? 'Rain continues to fall.' : 'The sunlight is strong.')
    }
    for (const side of ['player', 'foe'] as const) {
      if (this.turnOver) return
      if (this.active(side).hp <= 0) continue
      this.residual(side)
      this.afterHurt(side)
      this.checkFaint(side)
      if (this.active(side).hp > 0) this.turnAbility(side)
      if (this.holding(side)?.kind === 'regen' && this.active(side).hp < maxHp(this.active(side))) {
        const c = this.active(side)
        this.heal(side, Math.max(1, Math.floor(maxHp(c) / 16)))
        this.msg(`${this.label(side)} restored a little HP with its ${itemData(c.item!).name}!`)
      }
    }
  }

  /** DEWDRINKER drinks the rain; QUICKENING speeds up. */
  private turnAbility(side: Side): void {
    const c = this.active(side)
    if (this.weather?.kind === 'rain' && this.has(side, 'dewdrinker') && c.hp < maxHp(c)) {
      this.heal(side, Math.max(1, Math.floor(maxHp(c) / 16)))
      this.msg(`${this.label(side)}'s ${this.abilityName(side)} restored a little HP!`)
    }
    if (this.has(side, 'quickening') && this.vol[side].stages.spe < 6) {
      this.msg(`${this.label(side)}'s ${this.abilityName(side)} kicks in!`)
      this.changeStages(side, { spe: 1 }, false)
    }
  }

  /** Burn and poison damage at the end of the turn. */
  private residual(side: Side): void {
    const c = this.active(side)
    const max = maxHp(c)
    const name = this.label(side)
    if (c.status === 'brn') {
      this.hurt(side, Math.max(1, Math.floor(max / 8)))
      this.msg(`${name}'s burn stings!`)
    } else if (c.status === 'psn') {
      this.hurt(side, Math.max(1, Math.floor(max / 8)))
      this.msg(`${name} suffers from the poison!`)
    } else if (c.status === 'tox') {
      const n = Math.max(1, this.vol[side].toxic)
      this.vol[side].toxic = n + 1
      this.hurt(side, Math.max(1, Math.floor((max * n) / 16)))
      this.msg(`${name} suffers from the poison!`)
    }
  }

  private tryRun(): void {
    this.runAttempts++
    const chance = runChance(this.speedOf('player'), this.speedOf('foe'), this.runAttempts)
    if (chance >= 1 || this.rng.next() < chance) {
      this.msg(`${this.setup.playerName} slipped away safely!`)
      return this.finish('fled', 0)
    }
    this.msg("Couldn't get away!")
  }

  private switchIn(i: number, withdraw: boolean): void {
    if (withdraw) {
      this.msg(`${displayName(this.party[this.pIdx])}, return!`)
      this.emit({ t: 'recall', side: 'player' })
    }
    this.pIdx = i
    this.resetVolatile('player')
    const c = this.party[i]
    if (c.hp > 0) this.participants.add(i)
    this.msg(`Go for it, ${displayName(c)}!`)
    this.emit({ t: 'send', side: 'player', partyIndex: i, view: creatureView(c) })
    this.enter('player')
  }

  // --------------------------------------------------------------- items

  private playerItem(id: ItemId, partyIndex?: number): void {
    const data = itemData(id)
    if (data.use.kind === 'orb') return this.throwOrb(id)
    const i = partyIndex ?? this.pIdx
    const c = this.party[i]
    const hp = c.hp
    const status = c.status
    const r = applyItem(c, id)
    if (!r.ok) return this.msg(r.text)
    this.setup.bag.remove(id, 1)
    this.msg(`${this.setup.playerName} used ${data.name}!`)
    this.emit({ t: 'item', side: 'player', item: id })
    if (i === this.pIdx) {
      if (c.hp !== hp) this.emit({ t: 'hp', side: 'player', from: hp, to: c.hp, maxHp: maxHp(c) })
      if (c.status !== status) this.emit({ t: 'status', side: 'player', status: c.status })
    }
    this.msg(r.text)
  }

  private foeItem(id: ItemId): void {
    const k = this.trainerItems.indexOf(id)
    if (k < 0) return
    this.trainerItems.splice(k, 1)
    const c = this.foes[this.fIdx]
    const hp = c.hp
    const status = c.status
    const r = applyItem(c, id, this.label('foe'))
    this.msg(`${this.trainerName} used ${itemData(id).name}!`)
    this.emit({ t: 'item', side: 'foe', item: id })
    if (c.hp !== hp) this.emit({ t: 'hp', side: 'foe', from: hp, to: c.hp, maxHp: maxHp(c) })
    if (c.status !== status) this.emit({ t: 'status', side: 'foe', status: c.status })
    this.msg(r.text)
  }

  private throwOrb(id: ItemId): void {
    const data = itemData(id)
    const use = data.use
    if (use.kind !== 'orb') return
    this.setup.bag.remove(id, 1)
    const foe = this.foes[this.fIdx]
    this.msg(`${this.setup.playerName} threw ${article(data.name)} ${data.name}!`)
    let mult = use.rate
    if (use.bonus) {
      const types = typesOf(foe)
      const typeHit = use.bonus.types?.some((t) => types.includes(t)) ?? false
      const darkHit = !!use.bonus.dark && !!this.setup.dark
      if (typeHit || darkHit) mult *= use.bonus.mult
    }
    const a = catchValue(maxHp(foe), foe.hp, species(foe.species).catchRate, mult, foe.status)
    const { shakes, caught } = rollCatch(a, this.rng)
    this.emit({ t: 'orb', item: id, shakes, caught })
    if (!caught) return this.msg(BREAK_FREE[shakes])
    this.msg(`Yes! ${displayName(foe)} is yours!`)
    foe.ot = this.setup.playerName
    foe.metLevel = foe.level
    this.caught = foe
    this.finish('caught', 0)
  }

  // --------------------------------------------------------------- moves

  private useMove(side: Side, slot: number | null): void {
    const user = this.active(side)
    if (user.hp <= 0) return
    const tSide = other(side)
    const s = slot === null ? undefined : user.moves[slot]
    const slotOk = s !== undefined && s.pp > 0
    const m = moveData(slotOk ? s.id : STRUGGLE)
    // The target fell earlier this turn: nothing to aim at.
    if (m.target === 'foe' && this.active(tSide).hp <= 0) return
    if (!this.canAct(side)) return
    const name = this.label(side)
    if (slotOk) s.pp--
    else this.msg(`${name} is out of moves!`)
    this.msg(`${name} used ${m.name}!`)
    if (m.category === 'status') this.statusMove(side, m)
    else this.attack(side, m)
    this.checkFaint(tSide)
    this.checkFaint(side)
  }

  /** Freeze, sleep, flinch and paralysis checks before moving. */
  private canAct(side: Side): boolean {
    const c = this.active(side)
    const v = this.vol[side]
    const name = this.label(side)
    if (c.status === 'frz') {
      if (!this.rng.chance(0.2)) {
        this.msg(`${name} is frozen stiff!`)
        return false
      }
      this.setStatus(side, null)
      this.msg(`${name} thawed out!`)
    }
    if (c.status === 'slp') {
      if (c.sleepTurns > 0) {
        c.sleepTurns--
        this.msg(`${name} is sound asleep.`)
        return false
      }
      this.setStatus(side, null)
      this.msg(`${name} woke up!`)
    }
    if (v.flinch) {
      v.flinch = false
      this.msg(`${name} flinched and lost its nerve!`)
      return false
    }
    if (c.status === 'par' && this.rng.chance(0.25)) {
      this.msg(`${name} is paralysed and can't budge!`)
      return false
    }
    return true
  }

  private rollHit(side: Side, m: MoveData): boolean {
    if (m.accuracy <= 0 || m.target === 'self') return true
    const keen = this.has(side, 'sharpsight') ? 1.3 : 1
    const p = hitChance(m.accuracy, this.vol[side].stages.acc, this.vol[other(side)].stages.eva) * keen
    return p >= 1 || this.rng.next() < p
  }

  /** Damage of `m` from `side`'s active beast to the other's, for a given roll (85–100). */
  private damageFor(side: Side, m: MoveData, eff: number, crit: boolean, roll: number): number {
    const user = this.active(side)
    const tSide = other(side)
    const target = this.active(tSide)
    const physical = m.category === 'physical'
    const ak = physical ? 'atk' : 'spa'
    const dk = physical ? 'def' : 'spd'
    let as = this.vol[side].stages[ak]
    let ds = this.vol[tSide].stages[dk]
    if (crit) [as, ds] = critStages(as, ds)
    const gritty = physical && !!user.status && this.has(side, 'grit')
    let atkMult = gritty ? 1.5 : 1
    const pinch = ability(abilityOf(user)).pinch
    if (pinch && !m.typeless && m.type === pinch && user.hp <= maxHp(user) / 3) atkMult *= 1.5
    if (!m.typeless && (m.type === 'flame' || m.type === 'frost') && this.has(tSide, 'blubber')) atkMult *= 0.5
    const held = this.holding(side)
    if (held?.kind === 'boost' && !m.typeless && m.type === held.type) atkMult *= 1.1
    const atk = Math.max(1, Math.floor(calcStats(user)[ak] * stageMultiplier(as) * atkMult))
    const def = Math.max(1, Math.floor(calcStats(target)[dk] * stageMultiplier(ds)))
    const stab = !m.typeless && typesOf(user).includes(m.type)
    const power = m.typeless ? m.power : Math.max(1, Math.floor(m.power * this.weatherMultiplier(m.type)))
    return damage({ level: user.level, power, atk, def, stab, eff, crit, burned: physical && user.status === 'brn' && !gritty, roll })
  }

  private attack(side: Side, m: MoveData): void {
    const user = this.active(side)
    const tSide = other(side)
    const target = this.active(tSide)
    const uName = this.label(side)
    const tName = this.label(tSide)
    const eff: Effectiveness = m.typeless ? 1 : effectiveness(m.type, typesOf(target))
    if (eff === 0) {
      this.emit({ t: 'miss', side })
      return this.msg(`It has no effect on ${tName}...`)
    }
    const immune = this.abilityImmune(tSide, m)
    if (immune) {
      this.emit({ t: 'miss', side })
      return this.absorb(tSide, immune)
    }
    if (!this.rollHit(side, m)) {
      this.emit({ t: 'miss', side })
      return this.msg(`${uName}'s attack missed!`)
    }
    const multi = findEffect(m, 'multiHit')
    const fixed = findEffect(m, 'fixed')
    const highCrit = !!findEffect(m, 'highCrit')
    const count = multi ? multiHitCount(multi.min, multi.max, this.rng) : 1
    let dealt = 0
    let landed = 0
    for (let i = 0; i < count && target.hp > 0; i++) {
      this.emit({ t: 'move', side, move: m.id })
      let dmg: number
      let crit = false
      if (fixed) {
        dmg = fixed.damage === 'level' ? user.level : fixed.damage
      } else {
        crit = this.rng.chance(critChance(highCrit)) && !this.has(tSide, 'hardshell')
        dmg = this.damageFor(side, m, eff, crit, this.rng.int(85, 100))
      }
      const from = target.hp
      // STEADFAST: a hit taken at full HP leaves it standing with 1 HP.
      const steady = from >= maxHp(target) && dmg >= from && this.has(tSide, 'steadfast')
      if (steady) dmg = from - 1
      target.hp = Math.max(0, from - dmg)
      dealt += from - target.hp
      landed++
      this.emit({ t: 'hp', side: tSide, from, to: target.hp, maxHp: maxHp(target), eff: fixed ? 1 : eff, crit })
      if (crit) this.msg('A lucky strike!')
      if (steady) this.msg(`${tName} held on with ${this.abilityName(tSide)}!`)
      this.afterHurt(tSide)
    }
    if (!fixed) {
      if (eff > 1) this.msg('It hit a weak spot!')
      else if (eff < 1) this.msg('It barely left a mark...')
    }
    if (multi) this.msg(`Hit ${landed} time${landed === 1 ? '' : 's'}!`)
    if (m.type === 'flame' && !m.typeless && target.hp > 0 && target.status === 'frz' && dealt > 0) {
      this.setStatus(tSide, null)
      this.msg(`${tName} thawed out!`)
    }

    const drain = findEffect(m, 'drain')
    if (drain && dealt > 0 && user.hp > 0 && user.hp < maxHp(user)) {
      this.heal(side, Math.max(1, Math.floor(dealt * drain.fraction)))
      this.msg(`${tName}'s strength was drained!`)
    }
    for (const e of m.effects) {
      if (target.hp <= 0) break
      if (e.kind === 'status' && this.roll(e.chance)) this.inflict(tSide, e.status, false)
      else if (e.kind === 'stages' && e.who === 'foe' && this.roll(e.chance)) this.changeStages(tSide, e.stages, false, true)
      else if (e.kind === 'flinch' && this.roll(e.chance)) this.vol[tSide].flinch = true
    }
    for (const e of m.effects) {
      if (e.kind === 'stages' && e.who === 'self' && user.hp > 0 && this.roll(e.chance)) this.changeStages(side, e.stages, false)
    }
    const recoil = findEffect(m, 'recoil')
    if (recoil && dealt > 0 && user.hp > 0) {
      this.hurt(side, Math.max(1, Math.floor(dealt * recoil.fraction)))
      this.msg(`${uName} is jarred by the recoil!`)
      this.afterHurt(side)
    }
    // Touching a SPARKSKIN or VENOMSPINES beast can leave the attacker paralysed or poisoned.
    if (m.contact && dealt > 0 && user.hp > 0 && !user.status) {
      const touch = abilityOf(target)
      const status: StatusId | null = touch === 'sparkskin' ? 'par' : touch === 'venomspines' ? 'psn' : null
      if (status && !statusImmune(typesOf(user), status) && this.rng.chance(0.3)) {
        this.msg(`${tName}'s ${ability(touch).name} struck back!`)
        this.inflict(side, status, false)
      }
    }
  }

  /** Whether none of these stage changes can happen (all at their limit already). */
  private stagesBlocked(side: Side, stages: Partial<Record<StageKey, number>>): boolean {
    const v = this.vol[side]
    return (Object.keys(stages) as StageKey[]).every((k) => {
      const d = stages[k] ?? 0
      return d === 0 || clampStage(v.stages[k] + d) === v.stages[k]
    })
  }

  private statusMove(side: Side, m: MoveData): void {
    const user = this.active(side)
    const tSide = other(side)
    const target = this.active(tSide)
    const uName = this.label(side)
    const tName = this.label(tSide)
    const fail = (text: string): void => {
      this.emit({ t: 'miss', side })
      this.msg(text)
    }

    if (m.target === 'self') {
      const max = maxHp(user)
      const heal = findEffect(m, 'heal')
      const rest = findEffect(m, 'rest')
      const stages = findEffect(m, 'stages')
      if ((heal || rest) && user.hp >= max) return fail(heal ? `${uName}'s HP is already full!` : 'But it failed!')
      if (!heal && !rest && stages && this.stagesBlocked(side, stages.stages)) {
        this.emit({ t: 'miss', side })
        return this.changeStages(side, stages.stages, true)
      }
      const weatherMove = findEffect(m, 'weather')
      if (weatherMove && this.weather?.kind === weatherMove.weather) return fail('But it failed!')
      if (rest && this.has(side, 'wakeful')) return fail(`${uName}'s ${this.abilityName(side)} keeps it awake!`)
      this.emit({ t: 'move', side, move: m.id })
      for (const e of m.effects) {
        if (e.kind === 'heal') {
          const w = this.weather?.kind
          const fraction = e.sunny && w ? (w === 'sun' ? 2 / 3 : 1 / 4) : e.fraction
          this.heal(side, Math.max(1, Math.floor(max * fraction)))
          this.msg(`${uName} feels much better!`)
        } else if (e.kind === 'weather') {
          this.setWeather(e.weather, 5, e.weather === 'rain' ? 'It started to rain!' : 'The sunlight turned harsh!')
        } else if (e.kind === 'rest') {
          this.setStatus(side, 'slp', e.turns)
          this.heal(side, max)
          this.msg(`${uName} took a nap and became healthy!`)
          this.afterStatus(side)
        } else if (e.kind === 'stages') {
          this.changeStages(side, e.stages, true)
        }
      }
      return
    }

    const immune = this.abilityImmune(tSide, m)
    if (immune) {
      this.emit({ t: 'miss', side })
      return this.absorb(tSide, immune)
    }
    const inflict = findEffect(m, 'status')
    if (inflict) {
      const types = typesOf(target)
      if (effectiveness(m.type, types) === 0 || statusImmune(types, inflict.status)) return fail(`It has no effect on ${tName}...`)
      if (inflict.status === 'slp' && this.has(tSide, 'wakeful')) return fail(`${tName}'s ${this.abilityName(tSide)} keeps it awake!`)
      if (target.status) return fail('But it failed!')
    }
    const onlyStages = !inflict && m.effects.every((e) => e.kind === 'stages' && e.who === 'foe')
    if (onlyStages && m.effects.every((e) => e.kind === 'stages' && this.stagesBlocked(tSide, e.stages))) {
      this.emit({ t: 'miss', side })
      for (const e of m.effects) if (e.kind === 'stages') this.changeStages(tSide, e.stages, true, true)
      return
    }
    if (!this.rollHit(side, m)) return fail(`${uName}'s attack missed!`)
    this.emit({ t: 'move', side, move: m.id })
    for (const e of m.effects) {
      if (e.kind === 'status') this.inflict(tSide, e.status, true)
      else if (e.kind === 'stages') this.changeStages(e.who === 'self' ? side : tSide, e.stages, true, e.who !== 'self')
    }
  }

  /** Tries to give `status` to a side's active beast. `loud` explains failures (status moves). */
  private inflict(side: Side, status: StatusId, loud: boolean): boolean {
    const t = this.active(side)
    const name = this.label(side)
    if (t.hp <= 0) return false
    if (t.status) {
      if (loud) this.msg('But it failed!')
      return false
    }
    if (statusImmune(typesOf(t), status)) {
      if (loud) this.msg(`It has no effect on ${name}...`)
      return false
    }
    if (status === 'slp' && this.has(side, 'wakeful')) {
      if (loud) this.msg(`${name}'s ${this.abilityName(side)} keeps it awake!`)
      return false
    }
    this.setStatus(side, status)
    this.msg(`${name} ${INFLICT_TEXT[status]}`)
    this.afterStatus(side)
    return true
  }

  /**
   * Applies stage changes; `loud` also says when a stat can't go further.
   * `byFoe` marks drops the other side caused, which STEELNERVE shrugs off.
   */
  private changeStages(side: Side, stages: Partial<Record<StageKey, number>>, loud: boolean, byFoe = false): void {
    const v = this.vol[side]
    const name = this.label(side)
    if (byFoe && this.has(side, 'steelnerve') && Object.values(stages).some((d) => (d ?? 0) < 0)) {
      if (loud) this.msg(`${name}'s ${this.abilityName(side)} prevents stat loss!`)
      stages = Object.fromEntries(Object.entries(stages).filter(([, d]) => (d ?? 0) > 0))
    }
    for (const k of Object.keys(stages) as StageKey[]) {
      const d = stages[k] ?? 0
      if (!d) continue
      const cur = v.stages[k]
      const next = clampStage(cur + d)
      const delta = next - cur
      if (!delta) {
        if (loud) this.msg(`${name}'s ${STAGE_NAME[k]} won't go any ${d > 0 ? 'higher' : 'lower'}!`)
        continue
      }
      v.stages[k] = next
      this.emit({ t: 'stat', side, stat: k, delta })
      this.msg(`${name}'s ${STAGE_NAME[k]} ${stageWords(delta)}`)
    }
  }

  // --------------------------------------------------------------- faints

  private checkFaint(side: Side): void {
    const c = this.active(side)
    const v = this.vol[side]
    if (c.hp > 0 || v.fainted) return
    v.fainted = true
    c.status = null
    c.sleepTurns = 0
    this.emit({ t: 'faint', side })
    this.msg(`${this.label(side)} was knocked out!`)
    if (side === 'foe') this.awardXp(c)
    else this.participants.delete(this.pIdx)
    if (!countUsable(side === 'foe' ? this.foes : this.party)) this.turnOver = true
  }

  private sendNextFoe(): void {
    const j = firstUsable(this.foes)
    if (j < 0) return
    this.fIdx = j
    this.resetVolatile('foe')
    const c = this.foes[j]
    const view = creatureView(c, false)
    if (this.setup.kind === 'trainer') {
      this.emit({ t: 'trainerParty', remaining: countUsable(this.foes) })
      this.msg(`${this.trainerName} called out ${displayName(c)}!`)
      this.emit({ t: 'send', side: 'foe', partyIndex: j, view })
    } else {
      this.emit({ t: 'send', side: 'foe', partyIndex: j, view })
      this.msg(`A wild ${displayName(c)} leapt out!`)
    }
    this.participants = new Set(this.party[this.pIdx].hp > 0 ? [this.pIdx] : [])
    this.enter('foe')
  }

  // ------------------------------------------------------------ experience

  private awardXp(foe: Creature): void {
    const standing = [...this.participants].filter((i) => this.party[i]?.hp > 0).sort((a, b) => a - b)
    if (!standing.length) return
    const holders = this.party.map((c, i) => (c.hp > 0 && c.item && itemData(c.item).hold?.kind === 'share' ? i : -1)).filter((i) => i >= 0)
    // Effort is quiet: every beast that fought, and every SHARE SHELL holder, gets the foe's full yield.
    for (const i of new Set([...standing, ...holders])) gainEffort(this.party[i], foe.species)
    const total = xpYield(species(foe.species).xpYield, foe.level, this.setup.kind === 'trainer')
    // With a SHARE SHELL out, half goes to those who fought and half to the holders.
    const gains = new Map<number, number>()
    const fought = holders.length ? Math.floor(total / 2) : total
    for (const i of standing) gains.set(i, xpShare(fought, standing.length))
    if (holders.length) for (const i of holders) gains.set(i, (gains.get(i) ?? 0) + xpShare(total - fought, holders.length))
    const order = [...gains.keys()].sort((a, b) => a - b)
    this.enqueue(...order.map((i) => () => this.gainXp(i, gains.get(i)!)))
  }

  private gainXp(i: number, amount: number): void {
    const c = this.party[i]
    if (!c || c.hp <= 0 || c.level >= MAX_LEVEL || amount <= 0) return
    this.msg(`${displayName(c)} gained ${amount} XP!`)
    const cap = xpForLevel(species(c.species).growth, MAX_LEVEL)
    this.xpTowards(i, Math.min(cap, c.xp + amount))
  }

  /** Fills the bar toward `target` total XP, one level at a time, learning moves on the way. */
  private xpTowards(i: number, target: number): void {
    const c = this.party[i]
    if (c.level >= MAX_LEVEL) return
    const from = xpFraction(c)
    const next = xpForLevel(species(c.species).growth, c.level + 1)
    if (target < next) {
      c.xp = Math.max(c.xp, target)
      const to = xpFraction(c)
      if (to !== from) this.emit({ t: 'xp', partyIndex: i, from, to, level: c.level })
      return
    }
    c.xp = next
    this.emit({ t: 'xp', partyIndex: i, from, to: 1, level: c.level })
    const hp = c.hp
    const up = levelUp(c)
    this.leveled.add(i)
    if (i === this.pIdx && c.hp !== hp) this.emit({ t: 'hp', side: 'player', from: hp, to: c.hp, maxHp: up.after.hp })
    this.msg(`${displayName(c)} reached level ${c.level}!`)
    this.emit({ t: 'level', partyIndex: i, level: c.level, before: up.before, after: up.after })
    this.enqueue(...up.moves.map((m) => () => this.tryLearn(i, m)), () => this.xpTowards(i, target))
  }

  private tryLearn(i: number, id: MoveId): void {
    const c = this.party[i]
    if (c.moves.some((s) => s.id === id)) return
    const m = moveData(id)
    const name = displayName(c)
    if (c.moves.length < 4) {
      c.moves.push({ id, pp: m.pp })
      this.emit({ t: 'learned', partyIndex: i, move: id })
      return this.msg(`${name} learned ${m.name}!`)
    }
    // The scene asks "wants to learn… forget a move?" itself; the answer's result is reported in onLearn.
    this.ask({ kind: 'learn', partyIndex: i, move: id })
  }

  // ----------------------------------------------------------------- ends

  /** A trainer win says who was beaten; the scene then shows the lose text and the prize. */
  private win(): void {
    let money = 0
    if (this.setup.kind === 'trainer') {
      const t = this.setup.trainer
      this.msg(`${this.setup.playerName} defeated ${this.trainerName}!`)
      money = Math.max(0, Math.floor((t?.prize ?? 0) * this.foes[this.foes.length - 1].level))
    }
    this.finish('win', money)
  }

  /**
   * With `playerMoney` in the setup the engine reports the loss itself (text
   * and a negative `money`); without it the caller tells that part.
   */
  private lose(): void {
    const player = this.setup.playerName
    let loss = 0
    if (this.setup.playerMoney !== undefined) {
      loss = Math.max(0, Math.floor(this.setup.playerMoney / 2))
      this.msg(`${player} has no beasts left that can fight!`)
      if (loss > 0) this.msg(`${player} dropped ¤${loss} in the scramble...`)
    }
    this.finish('lose', loss > 0 ? -loss : 0)
  }

  private finish(outcome: Outcome, money: number): void {
    this.queue = []
    if (this.buffer) this.buffer.length = 0
    this.turnOver = true
    this.ended = true
    // Bad poison eases to ordinary poison once the battle is over.
    for (const c of this.party) if (c.status === 'tox') c.status = 'psn'
    if (this.caught?.status === 'tox') this.caught.status = 'psn'
    const prompt: EndPrompt = { kind: 'end', outcome, money, leveled: [...this.leveled].sort((a, b) => a - b) }
    if (this.caught) prompt.caught = this.caught
    this.ask(prompt)
  }

  // --------------------------------------------------------------- the foe

  private foeAction(): Action {
    const c = this.foes[this.fIdx]
    const trainer = this.setup.kind === 'trainer' ? this.setup.trainer : undefined
    if (trainer?.ai === 'smart') {
      const it = this.pickFoeItem()
      if (it) return { kind: 'item', side: 'foe', item: it }
    }
    const usable: number[] = []
    c.moves.forEach((s, i) => {
      if (s.pp > 0) usable.push(i)
    })
    if (!usable.length) return { kind: 'move', side: 'foe', slot: null }
    if (this.setup.kind === 'wild') return { kind: 'move', side: 'foe', slot: this.rng.pick(usable) }
    const slot = trainer?.ai === 'smart' ? this.smartMove(usable) : this.basicMove(usable)
    return { kind: 'move', side: 'foe', slot }
  }

  /** Average damage `side`'s active would deal with `m` right now, allowing for accuracy and hits. */
  expectedDamage(side: Side, m: MoveData): number {
    if (m.category === 'status') return 0
    const user = this.active(side)
    const tSide = other(side)
    const target = this.active(tSide)
    const eff = m.typeless ? 1 : effectiveness(m.type, typesOf(target))
    if (eff === 0) return 0
    const fixed = findEffect(m, 'fixed')
    const multi = findEffect(m, 'multiHit')
    const hits = multi ? (multi.min === 2 && multi.max === 5 ? 3 : (multi.min + multi.max) / 2) : 1
    const per = fixed ? (fixed.damage === 'level' ? user.level : fixed.damage) : this.damageFor(side, m, eff, false, 92)
    const acc = hitChance(m.accuracy, this.vol[side].stages.acc, this.vol[tSide].stages.eva)
    return per * hits * acc
  }

  /** Most of the time the move with the most expected damage, otherwise any usable move. */
  private basicMove(usable: number[]): number {
    const c = this.foes[this.fIdx]
    let best = usable[0]
    let bestD = -1
    for (const i of usable) {
      const d = this.expectedDamage('foe', moveData(c.moves[i].id))
      if (d > bestD) {
        best = i
        bestD = d
      }
    }
    if (bestD > 0 && this.rng.chance(0.8)) return best
    return this.rng.pick(usable)
  }

  /** Finishes off a weak foe, heals when low, lands status and boosts, else hits hardest. */
  private smartMove(usable: number[]): number {
    const c = this.foes[this.fIdx]
    const t = this.party[this.pIdx]
    const max = maxHp(c)
    const opts = usable.map((i) => {
      const m = moveData(c.moves[i].id)
      return { i, m, d: this.expectedDamage('foe', m) }
    })
    const best = opts.reduce((a, b) => (b.d > a.d ? b : a))
    if (best.d >= t.hp) return best.i
    const healing = opts.filter((o) => o.m.effects.some((e) => e.kind === 'heal' || e.kind === 'rest'))
    if (healing.length && c.hp < max / 2 && this.rng.chance(0.7)) return healing[0].i
    const tTypes = typesOf(t)
    const statusers = opts.filter((o) => {
      const e = findEffect(o.m, 'status')
      return o.m.category === 'status' && !!e && !t.status && !statusImmune(tTypes, e.status) && effectiveness(o.m.type, tTypes) > 0
    })
    if (statusers.length && this.rng.chance(0.5)) return this.rng.pick(statusers).i
    const boosts = opts.filter((o) => {
      if (o.m.target !== 'self') return false
      const e = findEffect(o.m, 'stages')
      if (!e) return false
      return (Object.keys(e.stages) as StageKey[]).every((k) => (e.stages[k] ?? 0) <= 0 || this.vol.foe.stages[k] < 2)
    })
    if (boosts.length && c.hp > max * 0.6 && this.rng.chance(0.3)) return this.rng.pick(boosts).i
    if (best.d > 0 && this.rng.chance(0.9)) return best.i
    return this.rng.pick(opts).i
  }

  /** Smart trainers heal below a quarter HP and sometimes cure a crippling status. */
  private pickFoeItem(): ItemId | null {
    const c = this.foes[this.fIdx]
    if (c.hp <= 0 || !this.trainerItems.length) return null
    if (c.hp <= maxHp(c) / 4) {
      const heal = this.trainerItems.find((id) => itemData(id).use.kind === 'heal' && itemWouldWork(c, id))
      if (heal) return heal
    }
    if (c.status && c.status !== 'psn' && c.status !== 'brn') {
      const cure = this.trainerItems.find((id) => {
        const u = itemData(id).use
        return (u.kind === 'cure' || (u.kind === 'heal' && !!u.cure)) && itemWouldWork(c, id)
      })
      if (cure && this.rng.chance(0.5)) return cure
    }
    return null
  }
}
