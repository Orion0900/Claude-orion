import type { Look } from '../../art/look'
import type { BattleBg, OrbKind } from '../../art/world'
import type { TrackId } from '../../audio/api'
import type { BattleApi, BattleEvent, Choice, CreatureView, Prompt, Side, StatusId } from '../../battle/types'
import { move as moveData } from '../../data/moves'
import { item, type ItemId } from '../../data/items'
import { TYPE_COLOR, TYPE_NAME } from '../../data/types'
import { Art } from '../../game/art'
import type { Game } from '../../game/Game'
import type { Scene } from '../../game/scene'
import { tinted, WHITE_INK, WHITE_SHADOW, type Gfx } from '../../engine/gfx'
import type { Pad } from '../../engine/input'
import { CH, measure, wrap } from '../../ui/font'
import { Particles, type Point } from './fx'

export interface BattlePresentation {
  bg: BattleBg
  playerLook: Look
  playerName: string
  /** Trainer battles: who you're facing. */
  trainer?: { look: Look; title: string; loseText: string }
  music: TrackId
  victory: TrackId
  /** Skip move animations (OPTIONS → BATTLE SCENE: OFF). */
  quick: boolean
}

/** Party and bag pickers the battle borrows from the menu screens. */
export interface BattleUi {
  /** Choose a party beast to send in; null to cancel (never null when forced). */
  pickSwitch(forced: boolean): Promise<number | null>
  /** Choose an item (and a party target for healing items); null to cancel. */
  pickItem(): Promise<{ item: ItemId; partyIndex?: number } | null>
  /** Choose which of four moves to forget for a new one; null to give up. */
  pickForget(partyIndex: number, move: string): Promise<number | null>
  /** A party beast's display name. */
  nameOf(partyIndex: number): string
  /** A foe beast came into view: note it in the Beastiary. */
  seen(species: import('../../data/dex').SpeciesId): void
}

type EndPrompt = Extract<Prompt, { kind: 'end' }>

interface Slot {
  view: CreatureView | null
  shown: boolean
  /** HP as currently drawn (slides toward the real value). */
  hp: number
  xp: number
  dx: number
  dy: number
  alpha: number
  /** 0–1 grow-from-orb scale. */
  scale: number
  tint: string | null
  blink: boolean
  /** Rows of the sprite hidden from the bottom while fainting. */
  sink: number
}

const FOE_AT = { x: 144, y: 6 }
const PLAYER_AT = { x: 36, y: 48 }
const FOE_HUD = { x: 4, y: 10 }
const PLAYER_HUD = { x: 126, y: 70 }
const BOX_Y = 112

const STATUS_COLOR: Record<StatusId, string> = { psn: '#a050b8', tox: '#702888', brn: '#e06030', par: '#d8b020', slp: '#8890a0', frz: '#58b8e0' }
const STATUS_LABEL: Record<StatusId, string> = { psn: 'PSN', tox: 'PSN', brn: 'BRN', par: 'PAR', slp: 'SLP', frz: 'FRZ' }

function newSlot(): Slot {
  return { view: null, shown: false, hp: 0, xp: 0, dx: 0, dy: 0, alpha: 1, scale: 1, tint: null, blink: false, sink: 0 }
}

/**
 * The battle screen: backdrop and platforms, both beasts, the HUD boxes,
 * the message box and the FIGHT / BAG / BEASTS / RUN menus. It animates the
 * engine's events in order and asks the player whenever the engine prompts.
 */
export class BattleScene implements Scene {
  readonly opaque = true
  private readonly foe = newSlot()
  private readonly me = newSlot()
  private readonly fx = new Particles()
  private text: { lines: string[]; shown: number; done: boolean } | null = null
  private menu: 'none' | 'action' | 'fight' = 'none'
  private actionIndex = 0
  private moveIndex = 0
  private menuResolve: ((c: 'fight' | 'bag' | 'beasts' | 'run' | number | null) => void) | null = null
  private trainerX: number | null = null
  private backX: number | null = null
  private backFrame: 0 | 1 | 2 | 3 = 0
  private orb: { kind: OrbKind; x: number; y: number; frame: 0 | 1 | 2 | 3 | 4 } | null = null
  private intro = 0
  private shake = 0
  private flash = 0
  private t = 0
  private textWaitA = false

  constructor(
    private readonly game: Game,
    private readonly engine: BattleApi,
    private readonly p: BattlePresentation,
    private readonly ui: BattleUi,
  ) {}

  // ─── Flow ────────────────────────────────────────────────────────────

  /** Plays the battle to its end. */
  async run(): Promise<EndPrompt> {
    this.game.audio.playMusic(this.p.music)
    await this.playIntro()
    let prompt = await this.play(this.engine.start())
    for (;;) {
      if (prompt.kind === 'end') {
        await this.outro(prompt)
        return prompt
      }
      const choice = await this.answer(prompt)
      prompt = await this.play(this.engine.choose(choice))
    }
  }

  private async playIntro(): Promise<void> {
    // Backdrop slides together, the foe darkened until it's revealed.
    this.intro = 1
    this.foe.shown = false
    this.trainerX = this.p.trainer ? 240 : null
    this.backX = -80
    for (let i = 0; i <= 30; i++) {
      this.intro = 1 - i / 30
      if (this.trainerX !== null) this.trainerX = 240 - (240 - FOE_AT.x) * (i / 30)
      this.backX = -80 + (80 + PLAYER_AT.x) * (i / 30)
      await this.game.wait(1)
    }
    this.intro = 0
  }

  private async play(events: BattleEvent[]): Promise<Prompt> {
    for (const e of events) {
      if (e.t === 'prompt') return e.prompt
      await this.animate(e)
    }
    // The engine always ends with a prompt; be safe anyway.
    return { kind: 'action' }
  }

  private async answer(prompt: Prompt): Promise<Choice> {
    switch (prompt.kind) {
      case 'action':
        return this.chooseAction()
      case 'switch': {
        for (;;) {
          const i = await this.ui.pickSwitch(prompt.forced)
          if (i !== null) return { kind: 'switch', partyIndex: i }
          if (!prompt.forced) return this.chooseAction()
        }
      }
      case 'learn': {
        const mv = moveData(prompt.move).name
        await this.say(`${this.ui.nameOf(prompt.partyIndex)} wants to learn ${mv}.`)
        await this.say(`But it already knows four moves.`)
        for (;;) {
          const yes = await this.yesNo(`Forget a move to make room for ${mv}?`)
          if (yes) {
            const slot = await this.ui.pickForget(prompt.partyIndex, prompt.move)
            if (slot !== null) {
              await this.say(`1, 2 and… … … Poof!`)
              return { kind: 'learn', forgetSlot: slot }
            }
          } else {
            const stop = await this.yesNo(`Stop learning ${mv}?`)
            if (stop) return { kind: 'learn', forgetSlot: null }
          }
        }
      }
      case 'end':
        return { kind: 'run' }
    }
  }

  private async chooseAction(): Promise<Choice> {
    for (;;) {
      const v = this.engine.view()
      this.setText(`What will ${v.player.name} do?`, true)
      const a = await this.openMenu('action')
      if (a === 'fight') {
        const m = await this.openMenu('fight')
        if (typeof m === 'number') {
          const mv = v.moves[m]
          if (mv && mv.pp <= 0 && v.moves.some((x) => x.pp > 0)) {
            await this.say("There's no PP left for this move!")
            continue
          }
          return { kind: 'move', slot: m }
        }
        continue
      }
      if (a === 'bag') {
        this.text = null
        const pick = await this.ui.pickItem()
        if (!pick) continue
        const data = item(pick.item)
        if (data.use.kind === 'orb' && !v.canCatch) {
          await this.say("You can't catch another trainer's beast!")
          continue
        }
        return { kind: 'item', item: pick.item, partyIndex: pick.partyIndex }
      }
      if (a === 'beasts') {
        this.text = null
        const i = await this.ui.pickSwitch(false)
        if (i === null) continue
        if (i === v.active) {
          await this.say(`${v.player.name} is already out!`)
          continue
        }
        return { kind: 'switch', partyIndex: i }
      }
      if (a === 'run') {
        if (!v.canRun) {
          await this.say(this.p.trainer ? "No! There's no running from a trainer battle!" : "You can't escape!")
          continue
        }
        return { kind: 'run' }
      }
    }
  }

  private openMenu(kind: 'action' | 'fight'): Promise<'fight' | 'bag' | 'beasts' | 'run' | number | null> {
    this.menu = kind
    return new Promise((resolve) => (this.menuResolve = resolve))
  }

  private closeMenu(v: 'fight' | 'bag' | 'beasts' | 'run' | number | null): void {
    const r = this.menuResolve
    this.menuResolve = null
    this.menu = 'none'
    r?.(v)
  }

  private async yesNo(question: string): Promise<boolean> {
    this.setText(question, true)
    const i = await this.game.choose(['YES', 'NO'], { x: 180, y: 64, cancel: 1 })
    return i === 0
  }

  // ─── Messages ────────────────────────────────────────────────────────

  private setText(text: string, done: boolean): void {
    const lines = wrap(text, 222).slice(0, 2)
    this.text = { lines, shown: done ? 999 : 0, done }
  }

  /** Prints a message; it moves on by itself after a beat, or on A. */
  private async say(text: string, hold = 50): Promise<void> {
    const pages: string[][] = []
    const all = wrap(text, 222)
    for (let i = 0; i < all.length; i += 2) pages.push(all.slice(i, i + 2))
    for (const lines of pages) {
      this.text = { lines, shown: 0, done: false }
      const total = lines.join('').length
      const speed = [3, 2, 1][this.game.options.textSpeed]
      while (this.text.shown < total) {
        if (this.game.input.pressed('a') || this.game.input.pressed('b')) this.text.shown = total
        else this.text.shown += 1 / speed
        await this.game.wait(1)
      }
      this.text.done = true
      this.textWaitA = true
      for (let i = 0; i < hold; i++) {
        if (this.game.input.pressed('a') || this.game.input.pressed('b')) break
        await this.game.wait(1)
      }
      this.textWaitA = false
    }
  }

  // ─── Events ──────────────────────────────────────────────────────────

  private slot(side: Side): Slot {
    return side === 'player' ? this.me : this.foe
  }

  private center(side: Side): Point {
    return side === 'player' ? { x: PLAYER_AT.x + 32, y: PLAYER_AT.y + 36 } : { x: FOE_AT.x + 32, y: FOE_AT.y + 38 }
  }

  private async animate(e: BattleEvent): Promise<void> {
    const audio = this.game.audio
    switch (e.t) {
      case 'msg':
        await this.say(e.text)
        return
      case 'send':
        if (e.side === 'foe') this.ui.seen(e.view.species)
        await this.sendOut(e.side, e.view)
        return
      case 'recall': {
        const s = this.slot(e.side)
        for (let i = 10; i >= 0; i--) {
          s.scale = i / 10
          s.tint = '#f8f8f8'
          await this.game.wait(1)
        }
        s.shown = false
        s.tint = null
        s.scale = 1
        return
      }
      case 'move': {
        const data = moveData(e.move)
        const [color, dark] = TYPE_COLOR[data.type]
        const self = data.target === 'self'
        const user = this.slot(e.side)
        const other: Side = e.side === 'player' ? 'foe' : 'player'
        if (this.p.quick) return
        if (data.category === 'physical' && !self) {
          const dir = e.side === 'player' ? 1 : -1
          for (let i = 0; i < 6; i++) {
            user.dx = dir * i * 2
            await this.game.wait(1)
          }
          for (let i = 6; i >= 0; i--) {
            user.dx = dir * i * 2
            await this.game.wait(1)
          }
        }
        audio.moveSound({ type: data.type, category: data.category })
        const frames = this.fx.play(data.fx, this.center(e.side), this.center(other), color, dark, self)
        if (data.fx === 'shake') this.shake = 24
        await this.game.wait(frames)
        return
      }
      case 'hp': {
        const s = this.slot(e.side)
        if (s.view) s.view = { ...s.view, maxHp: e.maxHp }
        if (e.to < e.from) {
          audio.sfx(e.eff !== undefined && e.eff > 1 ? 'hitSuper' : e.eff !== undefined && e.eff < 1 ? 'hitWeak' : 'hit')
          for (let i = 0; i < 8; i++) {
            s.blink = i % 2 === 0
            await this.game.wait(3)
          }
          s.blink = false
        } else audio.sfx('heal')
        await this.slideHp(s, e.from, e.to, e.maxHp)
        if (s.view) s.view = { ...s.view, hp: e.to }
        return
      }
      case 'miss':
        audio.sfx('miss')
        return
      case 'status': {
        const s = this.slot(e.side)
        if (s.view) s.view = { ...s.view, status: e.status }
        if (e.status) {
          audio.sfx('status')
          if (!this.p.quick) await this.game.wait(this.fx.sparkle(this.center(e.side), STATUS_COLOR[e.status]))
        }
        return
      }
      case 'stat':
        audio.sfx(e.delta > 0 ? 'statUp' : 'statDown')
        if (!this.p.quick) await this.game.wait(this.fx.stat(this.center(e.side), e.delta > 0))
        return
      case 'faint': {
        const s = this.slot(e.side)
        if (s.view) void audio.cry(s.view.species, true)
        await this.game.wait(20)
        audio.sfx('faint')
        for (let i = 0; i <= 16; i++) {
          s.sink = i * 4
          await this.game.wait(1)
        }
        s.shown = false
        s.sink = 0
        return
      }
      case 'xp': {
        const s = this.me
        if (this.engine.view().active !== e.partyIndex) return
        audio.sfx('xp')
        const steps = Math.max(4, Math.round(Math.abs(e.to - e.from) * 40))
        for (let i = 0; i <= steps; i++) {
          s.xp = e.from + (e.to - e.from) * (i / steps)
          await this.game.wait(1)
        }
        return
      }
      case 'level': {
        if (this.engine.view().active === e.partyIndex && this.me.view) {
          this.me.view = { ...this.me.view, level: e.level }
          this.me.xp = 0
        }
        void audio.playJingle('levelUp')
        await this.showLevelUp(e.before, e.after)
        return
      }
      case 'learned':
        void audio.playJingle('itemGet')
        return
      case 'orb':
        await this.throwOrb(e.item, e.shakes, e.caught)
        return
      case 'item':
        audio.sfx('heal')
        if (!this.p.quick) await this.game.wait(this.fx.sparkle(this.center(e.side), '#a8f080'))
        return
      case 'trainerParty':
        return
    }
  }

  private async slideHp(s: Slot, from: number, to: number, max: number): Promise<void> {
    s.hp = from
    const step = Math.max(1, max / 48)
    while (Math.abs(s.hp - to) > 0.01) {
      s.hp = s.hp < to ? Math.min(to, s.hp + step) : Math.max(to, s.hp - step)
      await this.game.wait(1)
    }
  }

  private async sendOut(side: Side, view: CreatureView): Promise<void> {
    const s = this.slot(side)
    s.view = view
    s.hp = view.hp
    s.xp = view.xpFraction
    s.sink = 0
    s.dx = 0
    s.dy = 0
    const audio = this.game.audio
    if (side === 'foe' && !this.p.trainer) {
      // Wild beasts are simply there.
      s.shown = true
      s.scale = 1
      s.tint = null
      void audio.cry(view.species)
      await this.game.wait(10)
      return
    }
    if (side === 'foe') {
      // The trainer steps aside and throws.
      for (let i = 0; i < 12; i++) {
        if (this.trainerX !== null) this.trainerX += 8
        await this.game.wait(1)
      }
      this.trainerX = null
    } else {
      for (let f = 1; f <= 3; f++) {
        this.backFrame = f as 1 | 2 | 3
        await this.game.wait(5)
      }
      audio.sfx('orbThrow')
      for (let i = 0; i < 14; i++) {
        if (this.backX !== null) this.backX -= 8
        await this.game.wait(1)
      }
      this.backX = null
    }
    audio.sfx('orbOpen')
    s.shown = true
    s.tint = '#f8f8f8'
    for (let i = 0; i <= 12; i++) {
      s.scale = i / 12
      await this.game.wait(1)
    }
    s.tint = null
    void audio.cry(view.species)
    await this.game.wait(16)
  }

  private orbKind(id: ItemId): OrbKind {
    return (['orb', 'superOrb', 'hyperOrb', 'tideOrb', 'duskOrb'] as const).find((k) => k === id) ?? 'orb'
  }

  private async throwOrb(id: ItemId, shakes: number, caught: boolean): Promise<void> {
    const audio = this.game.audio
    const kind = this.orbKind(id)
    audio.sfx('orbThrow')
    const from = { x: 40, y: 100 }
    const to = { x: FOE_AT.x + 26, y: FOE_AT.y + 30 }
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      this.orb = { kind, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 40, frame: 0 }
      await this.game.wait(1)
    }
    audio.sfx('orbOpen')
    this.orb!.frame = 1
    this.foe.tint = '#f07070'
    for (let i = 10; i >= 0; i--) {
      this.foe.scale = i / 10
      await this.game.wait(1)
    }
    this.foe.shown = false
    this.foe.tint = null
    this.foe.scale = 1
    this.orb!.frame = 0
    // Drop to the ground.
    const groundY = FOE_AT.y + 52
    for (let i = 0; i <= 10; i++) {
      this.orb!.y = to.y + (groundY - to.y) * (i / 10)
      await this.game.wait(1)
    }
    await this.game.wait(20)
    for (let k = 0; k < Math.min(3, shakes); k++) {
      audio.sfx('orbShake')
      this.orb!.frame = 2
      await this.game.wait(8)
      this.orb!.frame = 3
      await this.game.wait(8)
      this.orb!.frame = 0
      await this.game.wait(24)
    }
    if (caught) {
      audio.sfx('orbClick')
      this.orb!.frame = 4
      await this.game.wait(30)
      this.game.audio.stopMusic(0.1)
      await this.game.audio.playJingle('caught')
      return
    }
    audio.sfx('orbBreak')
    this.orb!.frame = 1
    this.foe.shown = true
    this.foe.tint = '#f8f8f8'
    for (let i = 0; i <= 10; i++) {
      this.foe.scale = i / 10
      await this.game.wait(1)
    }
    this.foe.tint = null
    this.orb = null
  }

  private levelBox: { before: Record<string, number>; after: Record<string, number>; phase: 0 | 1 } | null = null

  private async showLevelUp(before: Record<string, number>, after: Record<string, number>): Promise<void> {
    this.levelBox = { before, after, phase: 0 }
    await this.waitA()
    this.levelBox.phase = 1
    await this.waitA()
    this.levelBox = null
  }

  private async waitA(): Promise<void> {
    await this.game.wait(4)
    while (!(this.game.input.pressed('a') || this.game.input.pressed('b'))) await this.game.wait(1)
  }

  private async outro(end: EndPrompt): Promise<void> {
    if (end.outcome === 'win') {
      this.game.audio.playMusic(this.p.victory)
      if (this.p.trainer) {
        this.trainerX = 240
        for (let i = 0; i <= 16; i++) {
          this.trainerX = 240 - (240 - FOE_AT.x) * (i / 16)
          await this.game.wait(1)
        }
        await this.say(this.p.trainer.loseText, 90)
      }
      if (end.money > 0) await this.say(`${this.p.playerName} got ${CH.shell}${end.money} for winning!`, 90)
    }
    await this.game.wait(10)
  }

  // ─── Update / input ──────────────────────────────────────────────────

  update(pad: Pad, top: boolean): void {
    this.t++
    this.fx.update()
    if (this.shake > 0) this.shake--
    if (this.flash > 0) this.flash--
    if (!top || this.menu === 'none') return
    const v = this.engine.view()
    if (this.menu === 'action') {
      const i = this.actionIndex
      if (pad.pressed('left') && i % 2 === 1) this.moveCursor(() => (this.actionIndex = i - 1))
      else if (pad.pressed('right') && i % 2 === 0) this.moveCursor(() => (this.actionIndex = i + 1))
      else if (pad.pressed('up') && i >= 2) this.moveCursor(() => (this.actionIndex = i - 2))
      else if (pad.pressed('down') && i < 2) this.moveCursor(() => (this.actionIndex = i + 2))
      else if (pad.pressed('a')) {
        this.game.audio.sfx('select')
        this.closeMenu((['fight', 'bag', 'beasts', 'run'] as const)[this.actionIndex])
      }
      return
    }
    // FIGHT: the four moves.
    const n = v.moves.length
    const i = Math.min(this.moveIndex, n - 1)
    if (pad.pressed('left') && i % 2 === 1) this.moveCursor(() => (this.moveIndex = i - 1))
    else if (pad.pressed('right') && i % 2 === 0 && i + 1 < n) this.moveCursor(() => (this.moveIndex = i + 1))
    else if (pad.pressed('up') && i >= 2) this.moveCursor(() => (this.moveIndex = i - 2))
    else if (pad.pressed('down') && i + 2 < n) this.moveCursor(() => (this.moveIndex = i + 2))
    else if (pad.pressed('a')) {
      this.game.audio.sfx('select')
      this.closeMenu(i)
    } else if (pad.pressed('b')) {
      this.game.audio.sfx('cancel')
      this.closeMenu(null)
    }
  }

  /**
   * Taps on the menus: a command or a move is chosen directly; tapping the
   * battlefield above the move list goes back. Otherwise a tap is A, which
   * moves the messages along.
   */
  tap(x: number, y: number): boolean {
    if (this.menu === 'none') return false
    if (this.menu === 'action') {
      if (x < 120 || y < BOX_Y) return true
      const i = (y < BOX_Y + 24 ? 0 : 2) + (x < 186 ? 0 : 1)
      this.actionIndex = i
      this.game.audio.sfx('select')
      this.closeMenu((['fight', 'bag', 'beasts', 'run'] as const)[i])
      return true
    }
    if (y < BOX_Y) {
      this.game.audio.sfx('cancel')
      this.closeMenu(null)
      return true
    }
    if (x >= 160) return true
    const i = (y < BOX_Y + 24 ? 0 : 2) + (x < 86 ? 0 : 1)
    if (i < this.engine.view().moves.length) {
      this.moveIndex = i
      this.game.audio.sfx('select')
      this.closeMenu(i)
    }
    return true
  }

  private moveCursor(f: () => void): void {
    f()
    this.game.audio.sfx('cursor')
  }

  // ─── Drawing ─────────────────────────────────────────────────────────

  draw(g: Gfx): void {
    const sx = this.shake > 0 ? (this.shake % 4 < 2 ? 2 : -2) : 0
    const slide = Math.round(this.intro * 240)
    g.image(Art.battleBg(this.p.bg), sx, 0)
    const foePf = Art.platform(this.p.bg, 'foe')
    const mePf = Art.platform(this.p.bg, 'player')
    g.image(foePf, FOE_AT.x + 32 - foePf.w / 2 - slide + sx, FOE_AT.y + 64 - foePf.h / 2 - 6)
    g.image(mePf, PLAYER_AT.x + 32 - mePf.w / 2 + slide + sx, PLAYER_AT.y + 64 - mePf.h / 2 - 2)

    // Foe side: the trainer, or the beast.
    if (this.trainerX !== null && this.p.trainer) {
      const img = Art.portrait(this.p.trainer.look)
      g.image(img, this.trainerX + sx - slide, FOE_AT.y + 64 - img.h)
    }
    this.drawBeast(g, this.foe, 'foe', FOE_AT.x - slide + sx, FOE_AT.y)
    // Player side.
    if (this.backX !== null) {
      const img = Art.playerBack(this.p.playerLook, this.backFrame)
      g.image(img, this.backX + slide + sx, BOX_Y - img.h)
    }
    this.drawBeast(g, this.me, 'player', PLAYER_AT.x + slide + sx, PLAYER_AT.y)

    if (this.orb) {
      const img = Art.orb(this.orb.kind, this.orb.frame)
      g.image(img, this.orb.x - img.w / 2, this.orb.y - img.h / 2)
    }
    this.fx.draw(g)

    if (this.intro === 0) {
      if (this.foe.shown && this.foe.view) this.drawFoeHud(g)
      if (this.me.shown && this.me.view) this.drawPlayerHud(g)
    }
    this.drawBox(g)
    if (this.levelBox) this.drawLevelBox(g)
  }

  private drawBeast(g: Gfx, s: Slot, side: Side, x: number, y: number): void {
    if (!s.shown || !s.view || s.blink) return
    const base = side === 'player' ? Art.back(s.view.species, s.view.shiny) : Art.front(s.view.species, s.view.shiny)
    const img = s.tint ? tinted(base, s.tint) : this.intro > 0 && side === 'foe' ? tinted(base, '#303848') : base
    const bob = side === 'player' && this.menu !== 'none' ? (Math.floor(this.t / 16) % 2) : 0
    if (s.scale < 1) {
      const w = Math.max(1, Math.round(64 * s.scale))
      g.imageScaled(img, x + s.dx + 32 - w / 2, y + s.dy + 64 - w, w, w)
      return
    }
    if (s.sink > 0) {
      const h = Math.max(0, 64 - s.sink)
      g.imagePart(img, 0, 0, 64, h, x + s.dx, y + s.dy + s.sink)
      return
    }
    g.image(img, x + s.dx, y + s.dy + bob)
  }

  private hpBar(g: Gfx, x: number, y: number, hp: number, max: number): void {
    const w = 48
    g.rect(x - 16, y - 1, w + 18, 5, '#404840')
    g.small('HP', x - 13, y - 1, '#f8c848')
    g.rect(x, y, w, 3, '#586058')
    const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0
    const fill = Math.ceil(frac * w)
    const color = frac > 0.5 ? '#58d080' : frac > 0.2 ? '#f8c030' : '#f05050'
    const shade = frac > 0.5 ? '#38a060' : frac > 0.2 ? '#c89010' : '#b83030'
    if (fill > 0) {
      g.rect(x, y, fill, 3, color)
      g.rect(x, y + 2, fill, 1, shade)
    }
  }

  private statusBadge(g: Gfx, x: number, y: number, st: StatusId | null): void {
    if (!st) return
    g.rect(x, y, 17, 7, STATUS_COLOR[st])
    g.small(STATUS_LABEL[st], x + 2, y + 1, '#ffffff')
  }

  private drawFoeHud(g: Gfx): void {
    const v = this.foe.view!
    const { x, y } = FOE_HUD
    g.panel(x, y, 104, 30, '#f8f8e8', '#404840')
    g.rect(x + 2, y + 27, 100, 1, '#c8c8b0')
    g.text(v.name, x + 6, y + 4)
    g.small('Lv', x + 76, y + 7, '#404840')
    g.small(String(v.level), x + 86, y + 7, '#404840')
    this.hpBar(g, x + 48, y + 19, this.foe.hp, v.maxHp)
    this.statusBadge(g, x + 6, y + 17, v.status)
  }

  private drawPlayerHud(g: Gfx): void {
    const v = this.me.view!
    const { x, y } = PLAYER_HUD
    g.panel(x, y, 110, 40, '#f8f8e8', '#404840')
    g.text(v.name, x + 8, y + 4)
    g.small('Lv', x + 80, y + 7, '#404840')
    g.small(String(v.level), x + 90, y + 7, '#404840')
    this.hpBar(g, x + 54, y + 17, this.me.hp, v.maxHp)
    this.statusBadge(g, x + 8, y + 15, v.status)
    g.smallRight(`${Math.ceil(this.me.hp)}/${v.maxHp}`, x + 101, y + 23, '#404840')
    // Experience.
    g.rect(x + 22, y + 33, 80, 3, '#404840')
    g.rect(x + 23, y + 34, 78, 1, '#586058')
    g.rect(x + 23, y + 34, Math.round(78 * Math.max(0, Math.min(1, this.me.xp))), 1, '#58a8f8')
    g.small('EXP', x + 8, y + 32, '#404840')
  }

  private drawBox(g: Gfx): void {
    // The battle message box: a dark panel with white text.
    g.rect(0, BOX_Y, 240, 48, '#283848')
    g.rect(2, BOX_Y + 2, 236, 44, '#f8f8f8')
    g.rect(3, BOX_Y + 3, 234, 42, '#3c5874')
    g.rect(4, BOX_Y + 4, 232, 40, '#305070')
    if (this.menu === 'fight') {
      this.drawFightMenu(g)
      return
    }
    if (this.text) {
      let left = this.text.shown
      this.text.lines.forEach((line, i) => {
        const shown = this.text!.done ? line : line.slice(0, Math.max(0, Math.floor(left)))
        left -= line.length
        g.text(shown, 10, BOX_Y + 8 + i * 16, { color: WHITE_INK, shadow: WHITE_SHADOW })
      })
      if (this.textWaitA && Math.floor(this.t / 16) % 2 === 0) g.text(CH.more, 222, BOX_Y + 30, { color: '#f86060', shadow: null })
    }
    if (this.menu === 'action') {
      g.window(120, BOX_Y, 120, 48)
      const labels = ['FIGHT', 'BAG', 'BEASTS', 'RUN']
      labels.forEach((l, i) => g.text(l, 138 + (i % 2) * 52, BOX_Y + 9 + Math.floor(i / 2) * 16))
      g.cursor(128 + (this.actionIndex % 2) * 52, BOX_Y + 9 + Math.floor(this.actionIndex / 2) * 16)
    }
  }

  private drawFightMenu(g: Gfx): void {
    const v = this.engine.view()
    g.window(0, BOX_Y, 162, 48)
    v.moves.forEach((m, i) => {
      const x = 14 + (i % 2) * 74
      const y = BOX_Y + 9 + Math.floor(i / 2) * 16
      g.text(fit(m.name, 66), x, y, { color: m.pp > 0 ? undefined : '#a0a0a0' })
    })
    for (let i = v.moves.length; i < 4; i++) g.text('-', 14 + (i % 2) * 74, BOX_Y + 9 + Math.floor(i / 2) * 16, { color: '#b0b0b0' })
    const i = Math.min(this.moveIndex, v.moves.length - 1)
    g.cursor(5 + (i % 2) * 74, BOX_Y + 9 + Math.floor(i / 2) * 16)
    g.window(160, BOX_Y, 80, 48)
    const m = v.moves[i]
    if (m) {
      g.text('PP', 170, BOX_Y + 9)
      const low = m.pp === 0 ? '#e04040' : m.pp <= m.maxPp / 4 ? '#e08030' : undefined
      g.textRight(`${m.pp}/${m.maxPp}`, 228, BOX_Y + 9, { color: low })
      const [fill, edge] = TYPE_COLOR[m.type]
      g.rect(168, BOX_Y + 26, 62, 13, edge)
      g.rect(169, BOX_Y + 27, 60, 11, fill)
      const label = TYPE_NAME[m.type]
      g.text(label, 199 - measure(label) / 2, BOX_Y + 28, { color: '#ffffff', shadow: edge })
    }
  }

  private drawLevelBox(g: Gfx): void {
    const b = this.levelBox!
    const labels: [string, string][] = [
      ['MAX HP', 'hp'],
      ['ATTACK', 'atk'],
      ['DEFENSE', 'def'],
      ['SP. ATK', 'spa'],
      ['SP. DEF', 'spd'],
      ['SPEED', 'spe'],
    ]
    g.window(120, 2, 118, 108)
    labels.forEach(([label, k], i) => {
      const y = 9 + i * 16
      g.text(label, 128, y)
      const text = b.phase === 0 ? `+${b.after[k] - b.before[k]}` : String(b.after[k])
      g.textRight(text, 228, y)
    })
  }
}

function fit(text: string, w: number): string {
  let t = text
  while (measure(t) > w && t.length > 1) t = t.slice(0, -1)
  return t
}
