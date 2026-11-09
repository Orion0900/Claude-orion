import { critterBack, critterFront } from '../../art/creatures'
import { PEOPLE, person, type PersonId } from '../../art/world/people'
import { Battle } from '../../battle/Battle'
import { displayName, maxPp } from '../../battle/creature'
import type { BattleEvent, BattleSetup, Choice, Critter, CritterView, Prompt, Side, Stats } from '../../battle/types'
import { item as itemData, type ItemId } from '../../data/items'
import { move as moveData } from '../../data/moves'
import { species } from '../../data/species'
import { TYPE_NAME, TYPE_PAL } from '../../data/types'
import { CLEAR, makeSprite, MAPS, scaleSprite, type Gfx, type Sprite } from '../../engine/gfx'
import type { Pad } from '../../engine/input'
import { PAL, UI_SLOT, type Palette } from '../../engine/palettes'
import type { Game } from '../../game/Game'
import { Modal } from '../../game/scene'
import type { SaveData } from '../../game/state'
import { CH, padStart } from '../../ui/font'
import { BOX_Y, Dialog, drawBox } from '../../ui/Dialog'
import { drawFx, FX_FRAMES, type Pt } from './fx'
import type { BattleBg } from '../../world/mapTypes'
import { BagScene } from '../BagScene'
import { PartyScene } from '../PartyScene'
import { MoveListScene } from '../MoveListScene'

export interface BattleResult {
  outcome: 'win' | 'lose' | 'fled' | 'caught'
  money: number
  caught?: Critter
  leveled: number[]
}

export interface BattleOptions {
  setup: BattleSetup
  save: SaveData
  /** The trainer's look, for the opening. */
  trainerLook?: PersonId
  bg: BattleBg
}

/** Battle slots: what each palette slot holds while a battle is on screen. */
const S = { bg: 0, foe: 1, me: 2, foeHp: 3, meHp: 4, xp: 5, trainer: 6, fx: 7, capsule: 8 } as const

const FOE_AT = { x: 96, y: 2 }
const ME_AT = { x: 8, y: 40 }
const FOE_CENTER: Pt = { x: 124, y: 32 }
const ME_CENTER: Pt = { x: 36, y: 68 }

const STATUS_TAG: Record<string, string> = { psn: 'PSN', tox: 'PSN', brn: 'BRN', par: 'PAR', slp: 'SLP', frz: 'FRZ' }

const CAPSULE = (() => {
  const g = ['..####..', '.#....#.', '#..o...#', '########', '#xxx#xx#', '#xx#.#x#', '.#xx#x#.', '..####..']
  const s = makeSprite(8, 8)
  g.forEach((row, y) => {
    for (let x = 0; x < 8; x++) s.px[y * 8 + x] = row[x] === '#' ? 3 : row[x] === 'x' ? 2 : row[x] === 'o' ? 1 : row[x] === '.' && x > 0 && x < 7 && y > 0 && y < 7 ? 0 : CLEAR
  })
  for (const [x, y] of [[0, 0], [1, 0], [6, 0], [7, 0], [0, 1], [7, 1], [0, 6], [7, 6], [0, 7], [1, 7], [6, 7], [7, 7]]) s.px[y * 8 + x] = CLEAR
  return s
})()

interface Hud {
  view: CritterView | null
  hp: number
  xp: number
  shown: boolean
}

type Anim =
  | { kind: 'none' }
  | { kind: 'fx'; fx: ReturnType<typeof moveData>['fx']; t: number; frames: number; from: Pt; to: Pt; pal: Palette }

/**
 * The battle screen: plays a Battle's events as animation and text, and asks
 * the player for choices with the FIGHT / BAG / TEAM / RUN menus.
 */
export class BattleScene extends Modal<BattleResult> {
  readonly opaque = true
  private readonly battle: Battle
  private readonly hud: Record<Side, Hud> = {
    player: { view: null, hp: 0, xp: 0, shown: false },
    foe: { view: null, hp: 0, xp: 0, shown: false },
  }
  /** Sprite placement: scale 0–1 for capsule pops, slide for faints, hidden for SOAR/BURROW. */
  private readonly sprite: Record<Side, { scale: number; dy: number; dx: number; visible: boolean; blink: boolean; flash: boolean }> = {
    player: { scale: 0, dy: 0, dx: 0, visible: false, blink: false, flash: false },
    foe: { scale: 0, dy: 0, dx: 0, visible: false, blink: false, flash: false },
  }
  private trainerX = 0
  private playerTrainerX = 0
  private showTrainer = false
  private showPlayerTrainer = true
  private partyBalls: boolean[] | null = null
  private anim: Anim = { kind: 'none' }
  private shake = 0
  private capsule: { x: number; y: number; frame: number } | null = null
  private menu: 'none' | 'action' | 'moves' = 'none'
  private cursor = 0
  private moveCursor = 0
  private resolveMenu: ((c: number) => void) | null = null
  private levelBox: { before: Stats; after: Stats } | null = null
  private t = 0

  constructor(
    private readonly game: Game,
    private readonly o: BattleOptions,
  ) {
    super()
    this.battle = new Battle(o.setup)
  }

  enter(): void {
    void this.play()
  }

  // ─── Main loop ───────────────────────────────────────────────────────

  private async play(): Promise<void> {
    const wild = this.o.setup.kind === 'wild'
    this.showTrainer = !wild
    this.trainerX = -60
    this.playerTrainerX = 160
    this.sprite.foe.visible = wild
    this.sprite.foe.scale = 1
    this.sprite.foe.dx = -110
    // Slide the two sides in.
    for (let i = 0; i <= 30; i++) {
      const k = i / 30
      this.sprite.foe.dx = Math.round(-110 * (1 - k))
      this.trainerX = Math.round(-60 + 156 * k)
      this.playerTrainerX = Math.round(160 - 152 * k)
      await this.game.wait(1)
    }
    if (wild) void this.game.audio.cry(this.o.setup.foes[0].species)
    let events = this.battle.start()
    for (;;) {
      let prompt: Prompt | null = null
      for (const e of events) {
        if (e.t === 'prompt') {
          prompt = e.prompt
          break
        }
        await this.animate(e)
      }
      if (!prompt) throw new Error('battle events ended without a prompt')
      if (prompt.kind === 'end') {
        await this.ending(prompt)
        return
      }
      const choice = await this.ask(prompt)
      events = this.battle.choose(choice)
    }
  }

  private async ending(p: Extract<Prompt, { kind: 'end' }>): Promise<void> {
    if (p.outcome === 'win') {
      const music = this.o.setup.trainer ? (this.o.setup.trainer.className.includes('MASTER') || this.o.setup.trainer.className.includes('CHAMPION') ? 'victoryArena' : 'victoryTrainer') : 'victoryWild'
      this.game.audio.playMusic(music)
      if (this.o.setup.trainer) {
        this.showTrainer = true
        this.trainerX = 96
      }
    }
    await this.game.wait(20)
    this.finish({ outcome: p.outcome, money: p.money, caught: p.caught, leveled: p.leveled })
  }

  // ─── Prompts ─────────────────────────────────────────────────────────

  private async ask(p: Prompt): Promise<Choice> {
    switch (p.kind) {
      case 'action':
        return this.askAction()
      case 'switch': {
        const i = await this.game.run(new PartyScene(this.game, this.o.save, { mode: 'forced', battle: true }))
        return { kind: 'switch', partyIndex: i ?? this.o.setup.party.findIndex((c) => c.hp > 0) }
      }
      case 'learn':
        return this.askLearn(p.partyIndex, p.move)
      default:
        throw new Error('no prompt to ask')
    }
  }

  private async askAction(): Promise<Choice> {
    for (;;) {
      this.menu = 'action'
      const pick = await new Promise<number>((r) => (this.resolveMenu = r))
      this.menu = 'none'
      if (pick === 0) {
        const slot = await this.askMove()
        if (slot !== null) return { kind: 'move', slot }
        continue
      }
      if (pick === 1) {
        const it = await this.game.run(new BagScene(this.game, this.o.save, { mode: 'battle' }))
        if (!it) continue
        const e = itemData(it).effect
        if (e.kind === 'capsule' || e.kind === 'battleStat') return { kind: 'item', item: it }
        // Medicine: pick who gets it.
        const who = await this.game.run(new PartyScene(this.game, this.o.save, { mode: 'pick', battle: true, item: it }))
        if (who === null) continue
        let moveSlot: number | undefined
        if (e.kind === 'pp' && !e.all) {
          const ms = await this.game.run(new MoveListScene(this.game, this.o.setup.party[who], { title: 'Restore which move?' }))
          if (ms === null) continue
          moveSlot = ms
        }
        return { kind: 'item', item: it as ItemId, partyIndex: who, moveSlot }
      }
      if (pick === 2) {
        const i = await this.game.run(new PartyScene(this.game, this.o.save, { mode: 'switch', battle: true, active: this.battle.view().active }))
        if (i === null) continue
        return { kind: 'switch', partyIndex: i }
      }
      return { kind: 'run' }
    }
  }

  private async askMove(): Promise<number | null> {
    this.moveCursor = Math.min(this.moveCursor, this.battle.view().moves.length - 1)
    this.menu = 'moves'
    const pick = await new Promise<number>((r) => (this.resolveMenu = r))
    this.menu = 'none'
    return pick < 0 ? null : pick
  }

  private async askLearn(partyIndex: number, mv: string): Promise<Choice> {
    const c = this.o.setup.party[partyIndex]
    const name = displayName(c)
    const mname = moveData(mv as never).name
    for (;;) {
      await this.say(`${name} wants to learn ${mname}!`)
      await this.say(`But ${name} already knows four moves.`)
      if (await this.game.ask(`Forget a move to make room for ${mname}?`)) {
        const slot = await this.game.run(new MoveListScene(this.game, c, { title: 'Forget which move?', extra: mv as never }))
        if (slot !== null && slot < 4) return { kind: 'learn', forgetSlot: slot }
      }
      if (await this.game.ask(`Skip learning ${mname}?`)) return { kind: 'learn', forgetSlot: null }
    }
  }

  // ─── Events ──────────────────────────────────────────────────────────

  private say(text: string): Promise<void> {
    return this.game.run(new Dialog(text, { speed: this.game.textFrames, auto: 50, onAdvance: () => this.game.audio.sfx('select') }))
  }

  private async animate(e: BattleEvent): Promise<void> {
    switch (e.t) {
      case 'msg':
        await this.say(e.text)
        break
      case 'trainerParty':
        this.partyBalls = e.alive
        break
      case 'send':
        await this.sendOut(e.side, e.view)
        break
      case 'recall': {
        const sp = this.sprite[e.side]
        for (let i = 10; i >= 0; i--) {
          sp.scale = i / 10
          await this.game.wait(1)
        }
        sp.visible = false
        this.hud[e.side].shown = false
        break
      }
      case 'move':
        await this.playMove(e.side, e.move)
        break
      case 'hp':
        await this.slideHp(e.side, e.from, e.to, e.maxHp, e.eff, e.crit)
        break
      case 'miss':
        this.game.audio.sfx('miss')
        await this.game.wait(10)
        break
      case 'status':
        if (this.hud[e.side].view) this.hud[e.side].view!.status = e.status
        if (e.status) {
          this.game.audio.sfx('status')
          await this.game.wait(12)
        }
        break
      case 'stat':
        this.game.audio.sfx(e.delta > 0 ? 'statUp' : 'statDown')
        await this.runFx(e.delta > 0 ? 'up' : 'down', e.side, e.side, PAL.gray)
        break
      case 'hide':
        this.sprite[e.side].visible = !e.hidden
        await this.game.wait(8)
        break
      case 'faint': {
        const sp = this.sprite[e.side]
        const v = this.hud[e.side].view
        if (v) void this.game.audio.cry(v.species, true)
        this.game.audio.sfx('faint')
        for (let i = 0; i <= 14; i++) {
          sp.dy = i * 4
          await this.game.wait(1)
        }
        sp.visible = false
        sp.dy = 0
        this.hud[e.side].shown = false
        break
      }
      case 'xp':
        await this.fillXp(e.from, e.to)
        break
      case 'level': {
        void this.game.audio.playJingle('levelUp')
        if (this.hud.player.view && e.partyIndex === this.battle.view().active) this.hud.player.view.level = e.level
        this.levelBox = { before: e.before, after: e.after }
        await this.say(`${displayName(this.o.setup.party[e.partyIndex])} grew stronger!`)
        this.levelBox = null
        break
      }
      case 'learned':
        void this.game.audio.playJingle('levelUp')
        break
      case 'capsule':
        await this.throwCapsule(e.shakes, e.caught)
        break
      case 'item':
        this.game.audio.sfx('heal')
        await this.game.wait(10)
        break
    }
  }

  private async sendOut(side: Side, view: CritterView): Promise<void> {
    const h = this.hud[side]
    const wasShown = h.shown && h.view?.species === view.species && h.view?.name === view.name
    h.view = { ...view }
    h.hp = view.hp
    h.xp = view.xpFraction
    h.shown = true
    const sp = this.sprite[side]
    if (wasShown || (side === 'foe' && this.o.setup.kind === 'wild' && sp.visible)) {
      sp.visible = true
      return
    }
    // Trainers step aside as their critter comes out.
    if (side === 'foe' && this.showTrainer) {
      for (let i = 0; i < 16; i++) {
        this.trainerX += 5
        await this.game.wait(1)
      }
      this.showTrainer = false
    }
    if (side === 'player' && this.showPlayerTrainer) {
      for (let i = 0; i < 16; i++) {
        this.playerTrainerX -= 5
        await this.game.wait(1)
      }
      this.showPlayerTrainer = false
    }
    this.game.audio.sfx('capsuleOpen')
    sp.visible = true
    sp.dx = 0
    sp.dy = 0
    for (let i = 0; i <= 10; i++) {
      sp.scale = i / 10
      sp.flash = i < 8
      await this.game.wait(1)
    }
    sp.flash = false
    void this.game.audio.cry(view.species)
    await this.game.wait(12)
  }

  private async playMove(side: Side, id: string): Promise<void> {
    const m = moveData(id as never)
    const user = this.sprite[side]
    // A quick lunge for contact moves, a little hop for the rest.
    const contact = ['hit', 'claw', 'bite', 'kick', 'punch'].includes(m.fx)
    const dir = side === 'player' ? 1 : -1
    for (let i = 0; i < 6; i++) {
      user.dx = (contact ? 4 : 1) * dir * Math.sin((i / 5) * Math.PI)
      await this.game.wait(1)
    }
    user.dx = 0
    if (!this.game.options.animations) {
      this.game.audio.moveSound({ type: m.type, category: m.power > 0 ? 'physical' : 'status' })
      return
    }
    this.game.audio.moveSound({ type: m.type, category: m.power === 0 ? 'status' : m.type === 'NORMAL' ? 'physical' : 'special' })
    const target: Side = m.power === 0 && ['up', 'heal', 'wall'].includes(m.fx) ? side : side === 'player' ? 'foe' : 'player'
    if (m.fx === 'quake' || m.fx === 'blast') this.shake = FX_FRAMES[m.fx]
    await this.runFx(m.fx, side, target, PAL[TYPE_PAL[m.type]])
  }

  private async runFx(fx: ReturnType<typeof moveData>['fx'], from: Side, to: Side, pal: Palette): Promise<void> {
    if (fx === 'none') return
    const frames = FX_FRAMES[fx]
    const a = from === 'player' ? ME_CENTER : FOE_CENTER
    const b = to === 'player' ? ME_CENTER : FOE_CENTER
    this.anim = { kind: 'fx', fx, t: 0, frames, from: a, to: b, pal }
    for (let i = 0; i < frames; i++) {
      if (this.anim.kind === 'fx') this.anim.t = i
      await this.game.wait(1)
    }
    this.anim = { kind: 'none' }
  }

  private async slideHp(side: Side, from: number, to: number, max: number, eff?: number, crit?: boolean): Promise<void> {
    const h = this.hud[side]
    if (to < from && eff !== undefined) {
      this.game.audio.sfx(eff > 1 ? 'hitSuper' : eff < 1 ? 'hitWeak' : 'hit')
      const sp = this.sprite[side]
      if (crit || eff > 1) this.shake = 10
      for (let i = 0; i < 8; i++) {
        sp.blink = i % 2 === 0
        await this.game.wait(3)
      }
      sp.blink = false
    } else if (to > from) this.game.audio.sfx('heal')
    if (h.view) h.view.maxHp = max
    const steps = Math.max(1, Math.min(48, Math.abs(to - from)))
    for (let i = 1; i <= steps; i++) {
      h.hp = Math.round(from + ((to - from) * i) / steps)
      await this.game.wait(Math.abs(to - from) > 24 ? 1 : 2)
    }
    h.hp = to
    if (h.view) h.view.hp = to
  }

  private async fillXp(from: number, to: number): Promise<void> {
    const h = this.hud.player
    h.xp = from
    const steps = Math.max(1, Math.round(Math.abs(to - from) * 48))
    for (let i = 1; i <= steps; i++) {
      h.xp = from + ((to - from) * i) / steps
      if (i % 3 === 0) this.game.audio.sfx('xp')
      await this.game.wait(1)
    }
    h.xp = to
  }

  private async throwCapsule(shakes: number, caught: boolean): Promise<void> {
    this.game.audio.sfx('capsuleThrow')
    const from = { x: 40, y: 80 }
    const to = { x: 120, y: 44 }
    for (let i = 0; i <= 24; i++) {
      const k = i / 24
      this.capsule = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 30, frame: i }
      await this.game.wait(1)
    }
    // The critter is drawn into the capsule.
    this.game.audio.sfx('capsuleOpen')
    const sp = this.sprite.foe
    for (let i = 10; i >= 0; i--) {
      sp.scale = i / 10
      sp.flash = true
      await this.game.wait(1)
    }
    sp.visible = false
    sp.flash = false
    // It drops to the ground.
    for (let i = 0; i <= 10; i++) {
      this.capsule = { x: to.x, y: to.y + i * 1.2, frame: 0 }
      await this.game.wait(1)
    }
    await this.game.wait(16)
    for (let s = 0; s < shakes; s++) {
      this.game.audio.sfx('capsuleShake')
      for (let i = 0; i < 16; i++) {
        this.capsule!.frame = Math.round(Math.sin((i / 16) * Math.PI * 2) * 2)
        await this.game.wait(1)
      }
      this.capsule!.frame = 0
      await this.game.wait(20)
    }
    if (caught) {
      this.game.audio.sfx('capsuleClick')
      await this.game.wait(10)
      void this.game.audio.playJingle('caught')
      await this.game.wait(20)
    } else {
      this.game.audio.sfx('capsuleBreak')
      this.capsule = null
      sp.visible = true
      for (let i = 0; i <= 10; i++) {
        sp.scale = i / 10
        sp.flash = i < 8
        await this.game.wait(1)
      }
      sp.flash = false
    }
  }

  // ─── Input ───────────────────────────────────────────────────────────

  update(pad: Pad, top: boolean): void {
    this.t++
    if (this.shake > 0) this.shake--
    if (!top || this.menu === 'none' || !this.resolveMenu) return
    if (this.menu === 'action') {
      const col = this.cursor % 2
      const row = Math.floor(this.cursor / 2)
      if (pad.pressed('left') || pad.pressed('right')) {
        this.cursor = row * 2 + (1 - col)
        this.game.audio.sfx('cursor')
      } else if (pad.pressed('up') || pad.pressed('down')) {
        this.cursor = (1 - row) * 2 + col
        this.game.audio.sfx('cursor')
      } else if (pad.pressed('a')) {
        this.game.audio.sfx('select')
        this.pick(this.cursor)
      }
      return
    }
    const n = this.battle.view().moves.length
    if (pad.repeat('up')) {
      this.moveCursor = (this.moveCursor + n - 1) % n
      this.game.audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.moveCursor = (this.moveCursor + 1) % n
      this.game.audio.sfx('cursor')
    } else if (pad.pressed('a')) {
      this.game.audio.sfx('select')
      this.pick(this.moveCursor)
    } else if (pad.pressed('b')) {
      this.game.audio.sfx('cancel')
      this.pick(-1)
    }
  }

  private pick(n: number): void {
    const r = this.resolveMenu
    this.resolveMenu = null
    r?.(n)
  }

  tap(x: number, y: number): boolean {
    if (this.menu === 'action' && this.resolveMenu) {
      if (y >= 104 && y < 136 && x >= 72) {
        const col = x >= 120 ? 1 : 0
        const row = y >= 120 ? 1 : 0
        this.cursor = row * 2 + col
        this.pick(this.cursor)
      }
      return true
    }
    if (this.menu === 'moves' && this.resolveMenu) {
      const row = Math.floor((y - 102) / 9)
      const n = this.battle.view().moves.length
      if (x >= 32 && row >= 0 && row < n) {
        this.moveCursor = row
        this.pick(row)
      } else if (x < 32 || y < 96) this.pick(-1)
      return true
    }
    return false
  }

  // ─── Drawing ─────────────────────────────────────────────────────────

  private hpPal(h: Hud): Palette {
    const max = h.view?.maxHp ?? 1
    const f = h.hp / max
    return f > 0.5 ? PAL.hpGreen : f > 0.2 ? PAL.hpAmber : PAL.hpRed
  }

  draw(g: Gfx): void {
    const foeV = this.hud.foe.view
    const meV = this.hud.player.view
    g.setPal(S.bg, PAL.black)
    g.setPal(S.foe, PAL[foeV ? (foeV.shiny ? species(foeV.species).shinyPal : species(foeV.species).pal) : 'gray'])
    g.setPal(S.me, PAL[meV ? (meV.shiny ? species(meV.species).shinyPal : species(meV.species).pal) : 'gray'])
    g.setPal(S.foeHp, this.hpPal(this.hud.foe))
    g.setPal(S.meHp, this.hpPal(this.hud.player))
    g.setPal(S.xp, PAL.xp)
    g.setPal(S.trainer, PAL.skin)
    g.setPal(S.fx, this.anim.kind === 'fx' ? this.anim.pal : PAL.gray)
    g.setPal(S.capsule, PAL.roofRed)
    g.shakeX = this.shake > 0 ? (this.shake % 4 < 2 ? 2 : -2) : 0
    g.clear(0, S.bg)
    this.drawGround(g)
    this.drawSide(g, 'foe')
    this.drawSide(g, 'player')
    if (this.showTrainer) this.drawTrainer(g)
    if (this.showPlayerTrainer) this.drawPlayerTrainer(g)
    if (this.capsule) g.sprite(CAPSULE, this.capsule.x - 4 + this.capsule.frame, this.capsule.y - 4, { slot: S.capsule })
    if (this.anim.kind === 'fx') drawFx(g, this.anim.fx, this.anim.t / this.anim.frames, this.anim.from, this.anim.to, S.fx)
    if (this.hud.foe.shown) this.drawFoeHud(g)
    if (this.hud.player.shown) this.drawMeHud(g)
    if (this.partyBalls && this.showTrainer) this.drawBalls(g)
    drawBox(g)
    if (this.menu === 'action') this.drawActionMenu(g)
    if (this.menu === 'moves') this.drawMoveMenu(g)
    if (this.levelBox) this.drawLevelBox(g)
  }

  /** Battlefield: a plain field with a soft patch of ground under each side. */
  private drawGround(g: Gfx): void {
    const bg = this.o.bg
    const patch = (cx: number, cy: number, rx: number, ry: number) => {
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) g.px(cx + x, cy + y, y < -ry + 2 ? 2 : 1, S.bg)
    }
    patch(124, 54, 30, 5)
    patch(40, 94, 36, 6)
    if (bg === 'cave' || bg === 'arena') for (let x = 0; x < 160; x += 4) g.px(x, 58, 1, S.bg)
  }

  private drawSide(g: Gfx, side: Side): void {
    const sp = this.sprite[side]
    const v = this.hud[side].view
    if (!sp.visible || !v || sp.blink) return
    const art = side === 'foe' ? critterFront(v.species) : critterBack(v.species)
    const at = side === 'foe' ? FOE_AT : ME_AT
    const slot = side === 'foe' ? S.foe : S.me
    const map = sp.flash ? MAPS.white : undefined
    const x = at.x + sp.dx + (side === 'foe' ? 0 : 0)
    const clipBottom = side === 'foe' ? 58 : 96
    g.clip(0, 0, 160, clipBottom)
    if (sp.scale >= 1) g.sprite(art, x, at.y + sp.dy, { slot, map })
    else if (sp.scale > 0) {
      const w = 56 * sp.scale
      g.spriteScaled(art, x + (56 - w) / 2, at.y + 56 - w + sp.dy, w, w, { slot, map })
    }
    g.unclip()
  }

  private trainerSprite(): Sprite {
    const look = PEOPLE[this.o.trainerLook ?? 'boy']
    return scaleSprite(person(look).frames.down[0], 3)
  }

  private drawTrainer(g: Gfx): void {
    const look = PEOPLE[this.o.trainerLook ?? 'boy']
    g.setPal(S.trainer, [PAL.skin, PAL.skinBlue, PAL.skinGreen, PAL.skinPurple][look.tint ?? 0])
    g.sprite(this.trainerSprite(), this.trainerX, 8, { slot: S.trainer })
  }

  private drawPlayerTrainer(g: Gfx): void {
    const s = scaleSprite(person(PEOPLE.player).frames.up[0], 3)
    g.setPal(S.me, PAL.skin)
    g.sprite(s, this.playerTrainerX, 48, { slot: S.me })
  }

  private drawBalls(g: Gfx): void {
    const balls = this.partyBalls!
    for (let i = 0; i < 6; i++) {
      const x = 10 + i * 10
      const y = 26
      if (i >= balls.length) g.box(x, y, 7, 7, 1, UI_SLOT)
      else if (balls[i]) g.sprite(CAPSULE, x - 1, y - 1, { slot: S.capsule })
      else g.sprite(CAPSULE, x - 1, y - 1, { slot: S.capsule, map: [1, 1, 2, 2] })
    }
  }

  private hpBar(g: Gfx, x: number, y: number, h: Hud, slot: number): void {
    const max = Math.max(1, h.view?.maxHp ?? 1)
    const w = 48
    const fill = h.hp <= 0 ? 0 : Math.max(1, Math.round((h.hp / max) * w))
    g.text('HP', x - 18, y - 2, 3)
    g.rect(x - 1, y - 1, w + 2, 6, 3, UI_SLOT)
    g.rect(x, y, w, 4, 0, UI_SLOT)
    g.rect(x, y, fill, 4, 2, slot)
    g.rect(x, y, fill, 1, 1, slot)
  }

  private drawFoeHud(g: Gfx): void {
    const h = this.hud.foe
    const v = h.view!
    g.text(v.name, 8, 4)
    g.text(`${CH.level}${v.level}`, 40, 13)
    if (v.status) g.text(STATUS_TAG[v.status], 72, 13)
    this.hpBar(g, 26, 24, h, S.foeHp)
    // A bracket under the readout.
    g.rect(6, 31, 70, 1, 3, UI_SLOT)
    g.rect(6, 14, 1, 18, 3, UI_SLOT)
    g.px(76, 30, 3, UI_SLOT)
  }

  private drawMeHud(g: Gfx): void {
    const h = this.hud.player
    const v = h.view!
    g.text(v.name, 80, 56)
    g.text(`${CH.level}${v.level}`, 104, 65)
    if (v.status) g.text(STATUS_TAG[v.status], 136, 65)
    this.hpBar(g, 102, 75, h, S.meHp)
    g.textRight(`${padStart(h.hp, 3)}/${padStart(v.maxHp, 3)}`, 152, 82)
    // The XP bar.
    g.rect(101, 92, 50, 3, 3, UI_SLOT)
    g.rect(102, 93, 48, 1, 0, UI_SLOT)
    g.rect(102, 93, Math.round(48 * Math.max(0, Math.min(1, h.xp))), 1, 2, S.xp)
    g.rect(153, 66, 1, 28, 3, UI_SLOT)
  }

  private drawActionMenu(g: Gfx): void {
    g.window(64, BOX_Y, 96, 48)
    const items = ['FIGHT', 'BAG', 'TEAM', 'RUN']
    items.forEach((it, i) => g.text(it, 80 + (i % 2) * 40, 108 + Math.floor(i / 2) * 16))
    g.cursor(72 + (this.cursor % 2) * 40, 108 + Math.floor(this.cursor / 2) * 16)
    const v = this.hud.player.view
    if (v) {
      g.text('Go,', 8, 108)
      g.text(v.name.length > 6 ? `${v.name.slice(0, 6)}` : `${v.name}!`, 8, 124)
    }
  }

  private drawMoveMenu(g: Gfx): void {
    const moves = this.battle.view().moves
    g.window(32, BOX_Y, 128, 48)
    moves.forEach((m, i) => g.text(m.name, 48, 102 + i * 9))
    g.cursor(40, 102 + this.moveCursor * 9)
    const m = moves[this.moveCursor]
    if (m) {
      g.window(0, 64, 88, 32)
      g.text(`TYPE/`, 8, 70)
      g.text(TYPE_NAME[m.type], 32, 78)
      g.text(`${CH.pp}${padStart(m.pp, 2)}/${padStart(m.maxPp, 2)}`, 16, 86 - 8 + 8)
    }
  }

  private drawLevelBox(g: Gfx): void {
    const { after } = this.levelBox!
    g.window(72, 8, 88, 88)
    const rows: [string, number][] = [
      ['ATTACK', after.atk],
      ['DEFENSE', after.def],
      ['SPEED', after.spd],
      ['SPECIAL', after.spc],
    ]
    rows.forEach(([label, v], i) => {
      g.text(label, 80, 16 + i * 18)
      g.textRight(String(v), 152, 24 + i * 18)
    })
  }
}

/** The bag counts the battle engine sees. */
export function bagFor(save: SaveData): BattleSetup['bag'] {
  return {
    count: (id) => save.bag[id] ?? 0,
    remove: (id, n = 1) => {
      const left = (save.bag[id] ?? 0) - n
      if (left > 0) save.bag[id] = left
      else delete save.bag[id]
    },
  }
}

export { maxPp }
