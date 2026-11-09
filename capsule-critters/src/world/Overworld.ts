import type { SfxId } from '../audio/api'
import { Rng } from '../core/rng'
import { buildingArt } from '../art/world/buildings'
import { EMOTE, ITEM_BALL, PEOPLE, person, SHADOW } from '../art/world/people'
import { layerFrame, SLOT, TILE_ART } from '../art/world/tiles'
import { critterIcon } from '../art/creatures'
import { CLEAR, MAPS, SCREEN_H, SCREEN_W, type Gfx, type Sprite } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL, type PalId } from '../engine/palettes'
import { item as itemData } from '../data/items'
import type { Game } from '../game/Game'
import type { Scene } from '../game/scene'
import { addItem, itemCount, type Facing, type SaveData } from '../game/state'
import { Actor, BIKE_FRAMES, RUN_FRAMES, WALK_FRAMES } from './Actor'
import type { EncounterTable, ItemBallDef, MapDef, NpcDef, TrainerDef } from './mapTypes'
import { parseRoute, type Script, type ScriptCtx, type Who } from './script'
import { BUILDING_SIZE, DELTA, OPPOSITE, TERRAIN, type Dir, type TerrainKind } from './terrain'
import { World, WorldMap } from './WorldMap'
import { hooks } from './hooks'

interface Npc {
  def: NpcDef
  actor: Actor
  timer: number
  home: { x: number; y: number }
}

interface Effect {
  kind: 'rustle' | 'dust' | 'splash'
  x: number
  y: number
  t: number
}

/** Player's cell on screen: column 4, row 4 of the 10×9 view. */
const VIEW_X = 64
const VIEW_Y = 64

/** Default palettes for each overworld slot, by kind of map. */
function slotPalettes(def: MapDef): Record<number, PalId> {
  const base: Record<number, PalId> = {
    [SLOT.land]: 'land',
    [SLOT.tree]: 'tree',
    [SLOT.water]: 'water',
    [SLOT.roof]: 'roofRed',
    [SLOT.wood]: 'wall',
    [SLOT.roofRed]: 'roofRed',
    [SLOT.roofBlue]: 'roofBlue',
    [SLOT.stone]: 'stone',
    [SLOT.flower]: 'flower',
    [SLOT.sand]: 'sand',
    [SLOT.people]: 'skin',
    [SLOT.peopleBlue]: 'skinBlue',
    [SLOT.peopleGreen]: 'skinGreen',
    [SLOT.peoplePurple]: 'skinPurple',
    [SLOT.fx]: 'ui',
  }
  if (def.kind === 'indoor') {
    base[SLOT.land] = 'floor'
    base[SLOT.wood] = 'wood'
  }
  if (def.kind === 'cave') {
    base[SLOT.land] = 'cave'
    base[SLOT.stone] = 'cave'
  }
  for (const [k, v] of Object.entries(def.palette ?? {})) if (v) base[Number(k)] = v
  return base
}

/**
 * The overworld: the map around the player, the people on it, and
 * everything that happens on foot — walking, talking, signs, items,
 * trainers who spot you, wild critters in the grass, doors and warps.
 */
export class Overworld implements Scene {
  readonly opaque = true
  map: WorldMap
  readonly player: Actor
  npcs: Npc[] = []
  /** A script is running: input goes to it, not to walking. */
  busy = false
  private readonly rng = new Rng((Date.now() ^ 0x5eed) >>> 0)
  private effects: Effect[] = []
  private emotes: { actor: Actor; t: number }[] = []
  private popup: { name: string; t: number } | null = null
  private turnHold = 0
  private bumpCooldown = 0
  /** Lit by GLOW in a dark cave. */
  lit = false

  constructor(
    readonly game: Game,
    readonly save: SaveData,
    readonly world: World,
  ) {
    this.map = world.map(save.at.map)
    this.player = new Actor(save.at.x, save.at.y, save.face)
    this.player.swimming = save.mode === 'swim'
    this.player.biking = save.mode === 'bike'
  }

  enter(): void {
    this.spawnNpcs()
    this.game.audio.playMusic(this.currentMusic())
  }

  private currentMusic() {
    if (this.player.swimming) return 'sea' as const
    if (this.player.biking && this.map.def.kind !== 'indoor') return 'bike' as const
    return this.map.def.music
  }

  // ─── Loading and warping ─────────────────────────────────────────────

  load(mapId: string, x: number, y: number, facing?: Facing): void {
    const prev = this.map
    this.map = this.world.map(mapId)
    if (prev !== this.map) prev.resetEdits()
    this.player.place(x, y, facing)
    if (this.map.def.kind === 'indoor' || this.map.def.kind === 'cave') {
      if (this.player.biking && this.map.def.kind === 'indoor') this.setMode('walk')
    }
    this.lit = false
    this.spawnNpcs()
    this.syncSave()
    if (this.map.def.soar && !this.save.visited.includes(this.map.id)) this.save.visited.push(this.map.id)
  }

  private spawnNpcs(): void {
    this.npcs = (this.map.def.npcs ?? [])
      .filter((d) => !d.when || d.when(this.save))
      .map((def) => ({ def, actor: new Actor(def.x, def.y, def.face ?? 'down'), timer: 60 + this.rng.int(0, 120), home: { x: def.x, y: def.y } }))
  }

  /** Re-checks which NPCs should be present (after a flag changes). */
  refreshNpcs(): void {
    const keep = new Map(this.npcs.map((n) => [n.def.id, n]))
    this.npcs = (this.map.def.npcs ?? [])
      .filter((d) => !d.when || d.when(this.save))
      .map((def) => keep.get(def.id) ?? { def, actor: new Actor(def.x, def.y, def.face ?? 'down'), timer: 60, home: { x: def.x, y: def.y } })
  }

  private showPopup(): void {
    if (this.map.def.kind === 'indoor') return
    this.popup = { name: this.map.def.name, t: 0 }
  }

  async warp(mapId: string, x: number, y: number, facing?: Facing, sound: SfxId | null = 'door'): Promise<void> {
    const wasBusy = this.busy
    this.busy = true
    if (sound) this.game.audio.sfx(sound)
    await this.game.fadeOut()
    const prevName = this.map.def.name
    this.load(mapId, x, y, facing ?? this.player.facing)
    const music = this.currentMusic()
    if (this.game.audio.currentTrack !== music) this.game.audio.playMusic(music)
    await this.game.fadeIn()
    if (this.map.def.name !== prevName) this.showPopup()
    this.busy = wasBusy
    if (!wasBusy) await this.runEnterScript()
  }

  private async runEnterScript(): Promise<void> {
    if (this.map.def.onEnter) await this.run(this.map.def.onEnter)
  }

  syncSave(): void {
    this.save.at = { map: this.map.id, x: this.player.x, y: this.player.y }
    this.save.face = this.player.facing
  }

  restingSave(): SaveData | null {
    if (this.busy || this.player.busy || this.game.faded) return null
    this.syncSave()
    return this.save
  }

  setMode(mode: SaveData['mode']): void {
    this.save.mode = mode
    this.player.swimming = mode === 'swim'
    this.player.biking = mode === 'bike'
    const music = this.currentMusic()
    if (this.game.audio.currentTrack !== music) this.game.audio.playMusic(music)
  }

  // ─── Queries ─────────────────────────────────────────────────────────

  npcAt(x: number, y: number): Npc | null {
    return this.npcs.find((n) => !n.actor.hidden && n.actor.x === x && n.actor.y === y) ?? null
  }

  npc(id: string): Npc | null {
    return this.npcs.find((n) => n.def.id === id) ?? null
  }

  itemAt(x: number, y: number): ItemBallDef | null {
    return this.map.def.items?.find((i) => !i.hidden && i.x === x && i.y === y && !this.save.flags[`item:${i.id}`]) ?? null
  }

  private occupied(x: number, y: number, except?: Actor): boolean {
    if (this.player !== except && this.player.x === x && this.player.y === y) return true
    if (this.npcs.some((n) => n.actor !== except && !n.actor.hidden && n.actor.x === x && n.actor.y === y)) return true
    return !!this.itemAt(x, y)
  }

  /** The cell in front of the player. */
  front(): { x: number; y: number } {
    const d = DELTA[this.player.facing]
    return { x: this.player.x + d.dx, y: this.player.y + d.dy }
  }

  frontKind(): TerrainKind {
    const f = this.front()
    return this.world.kindAt(this.map, f.x, f.y)
  }

  private canStep(a: Actor, dir: Dir): boolean {
    const d = DELTA[dir]
    const tx = a.x + d.dx
    const ty = a.y + d.dy
    const at = this.world.locate(this.map, tx, ty)
    if (!at) return false
    if (this.occupied(tx, ty, a)) return false
    if (at.map.building(at.x, at.y)) return false
    const kind = at.map.kind(at.x, at.y)!
    if (a.swimming) return !!TERRAIN[kind].swim
    return TERRAIN[kind].walk
  }

  // ─── Update ──────────────────────────────────────────────────────────

  update(pad: Pad, top: boolean): void {
    this.player.update()
    for (const n of this.npcs) {
      n.actor.update()
      if (!this.busy) this.idle(n)
    }
    for (const e of this.effects) e.t++
    this.effects = this.effects.filter((e) => e.t < 16)
    for (const e of this.emotes) e.t++
    if (this.popup && ++this.popup.t > 140) this.popup = null
    if (this.bumpCooldown > 0) this.bumpCooldown--
    if (!top || this.busy || this.player.busy) return

    if (pad.pressed('start')) {
      this.game.audio.sfx('menuOpen')
      void this.run(hooks.startMenu)
      return
    }
    if (pad.pressed('select')) {
      void this.run(hooks.select)
      return
    }
    if (pad.pressed('a')) {
      void this.interact()
      return
    }
    // Stepping off a doormat leaves the building.
    const dir = pad.dir()
    if (!dir) {
      this.turnHold = 0
      return
    }
    if (dir !== this.player.facing && this.turnHold === 0 && pad.heldFor(dir) < 4) {
      this.player.facing = dir
      this.turnHold = 1
      return
    }
    if (this.turnHold > 0 && this.turnHold < 6 && pad.heldFor(dir) < 6) {
      this.turnHold++
      return
    }
    this.turnHold = 0
    const run = pad.held('b') && !this.player.swimming && !this.player.biking
    this.tryMove(dir, run)
  }

  private speed(run: boolean): number {
    if (this.player.biking) return BIKE_FRAMES
    return run ? RUN_FRAMES : WALK_FRAMES
  }

  private tryMove(dir: Dir, run: boolean): void {
    const p = this.player
    p.facing = dir
    const d = DELTA[dir]
    const tx = p.x + d.dx
    const ty = p.y + d.dy
    const here = this.map.kind(p.x, p.y)

    // Leaving a building over the doormat.
    if (here === 'mat' && dir === 'down') {
      const w = this.map.warpAt(p.x, p.y)
      if (w) {
        void this.warp(w.to, w.tx, w.ty, w.face ?? 'down', 'door')
        return
      }
    }

    const at = this.world.locate(this.map, tx, ty)
    const kind = at ? at.map.kind(at.x, at.y) : null

    // A door in front: walk in.
    if (at && dir === 'up') {
      const b = at.map.doorAt(at.x, at.y)
      if (b) {
        if (!b.to) {
          if (b.locked) void this.run(async (s) => s.say(b.locked!))
          else this.bump(dir)
          return
        }
        const to = b.to
        this.busy = true
        this.game.audio.sfx('door')
        p.step(dir, WALK_FRAMES, () => {
          this.busy = false
          void this.warp(to.map, to.x, to.y, 'up', null)
        })
        return
      }
    }

    // Ledges: hop down when moving the way they drop.
    if (kind && TERRAIN[kind].ledge === dir && !p.swimming) {
      const lx = tx + d.dx
      const ly = ty + d.dy
      const land = this.world.locate(this.map, lx, ly)
      if (land && !this.occupied(lx, ly, p) && !land.map.building(land.x, land.y) && TERRAIN[land.map.kind(land.x, land.y)!].walk) {
        this.busy = true
        this.game.audio.sfx('ledge')
        p.hop(dir, () => {
          this.busy = false
          this.effects.push({ kind: 'dust', x: p.x, y: p.y, t: 0 })
          this.afterStep()
        })
        return
      }
    }

    // Swimming onto land: climb out.
    if (p.swimming && kind && TERRAIN[kind].walk && at && !at.map.building(at.x, at.y) && !this.occupied(tx, ty, p)) {
      this.busy = true
      p.step(dir, WALK_FRAMES, () => {
        this.setMode('walk')
        this.busy = false
        this.afterStep()
      })
      return
    }

    if (!this.canStep(p, dir)) {
      this.bump(dir)
      return
    }
    p.step(dir, this.speed(run), () => this.afterStep())
    if (kind === 'tall') this.effects.push({ kind: 'rustle', x: tx, y: ty, t: 0 })
  }

  private bump(dir: Dir): void {
    this.player.bump(dir)
    if (this.bumpCooldown <= 0) {
      this.game.audio.sfx('bump')
      this.bumpCooldown = 16
    }
  }

  /** Called when the player finishes a step onto a new cell. */
  private afterStep(): void {
    const p = this.player
    if (!this.map.inside(p.x, p.y)) {
      const at = this.world.locate(this.map, p.x, p.y)
      if (at) {
        const prev = this.map
        prev.resetEdits()
        this.map = at.map
        p.place(at.x, at.y, p.facing)
        this.spawnNpcs()
        const music = this.currentMusic()
        if (this.game.audio.currentTrack !== music) this.game.audio.playMusic(music)
        if (at.map.def.name !== prev.def.name) this.showPopup()
        if (this.map.def.soar && !this.save.visited.includes(this.map.id)) this.save.visited.push(this.map.id)
        if (this.map.def.onEnter) {
          void this.run(this.map.def.onEnter)
          return
        }
      }
    }
    this.syncSave()

    const kind = this.map.kind(p.x, p.y)!
    const w = this.map.warpAt(p.x, p.y)
    if (w && kind !== 'mat') {
      const sound: SfxId = kind === 'stairsUp' || kind === 'stairsDown' || kind === 'ladderUp' || kind === 'ladderDown' ? 'stairs' : 'door'
      void this.warp(w.to, w.tx, w.ty, w.face ?? p.facing, sound)
      return
    }

    if (this.save.repel > 0) {
      this.save.repel--
      if (this.save.repel === 0) {
        void this.run(async (s) => s.say('The SHOO SPRAY wore off.'))
        return
      }
    }

    const trig = this.map.def.triggers?.find(
      (t) => p.x >= t.x && p.y >= t.y && p.x < t.x + (t.w ?? 1) && p.y < t.y + (t.h ?? 1) && (!t.when || t.when(this.save)),
    )
    if (trig) {
      void this.run(trig.script)
      return
    }

    if (this.checkTrainers()) return

    const enc = TERRAIN[kind].encounter
    const table = enc ? this.map.def.encounters?.[enc] : undefined
    if (table && this.rng.int(1, 100) <= table.rate) void this.encounter(table)
  }

  private idle(n: Npc): void {
    const move = n.def.move ?? 'still'
    if (move === 'still' || n.actor.busy || n.def.prop) return
    if (--n.timer > 0) return
    n.timer = 80 + this.rng.int(0, 140)
    const dirs: Dir[] = ['up', 'down', 'left', 'right']
    if (move === 'look' || move === 'spin') {
      n.actor.facing = move === 'spin' ? dirs[(dirs.indexOf(n.actor.facing) + 1) % 4] : this.rng.pick(dirs)
      if (n.def.trainer && !this.player.busy && this.game.top === this) this.checkTrainers()
      return
    }
    const dir = this.rng.pick(dirs)
    const d = DELTA[dir]
    const tx = n.actor.x + d.dx
    const ty = n.actor.y + d.dy
    if (Math.abs(tx - n.home.x) > 2 || Math.abs(ty - n.home.y) > 2 || !this.canStep(n.actor, dir) || !this.map.inside(tx, ty)) {
      n.actor.facing = dir
      return
    }
    n.actor.step(dir, WALK_FRAMES)
  }

  // ─── Trainers ────────────────────────────────────────────────────────

  /** A trainer who can see the player and hasn't been beaten starts their approach. */
  private checkTrainers(): boolean {
    for (const n of this.npcs) {
      const t = n.def.trainer
      if (!t || this.save.flags[`beat:${t.id}`] || n.actor.hidden || n.actor.busy) continue
      const d = DELTA[n.actor.facing]
      const sight = n.def.sight ?? 4
      for (let i = 1; i <= sight; i++) {
        const x = n.actor.x + d.dx * i
        const y = n.actor.y + d.dy * i
        if (this.player.x === x && this.player.y === y) {
          void this.run((s) => this.spotted(s, n, t))
          return true
        }
        if (this.map.solid(x, y) || this.npcAt(x, y)) break
      }
    }
    return false
  }

  private async spotted(s: ScriptCtx, n: Npc, t: TrainerDef): Promise<void> {
    void this.game.audio.playJingle('spotted')
    await s.emote(n.def.id)
    // Walk up to the player.
    const steps = Math.abs(n.actor.x - this.player.x) + Math.abs(n.actor.y - this.player.y) - 1
    for (let i = 0; i < steps; i++) await new Promise<void>((r) => n.actor.step(n.actor.facing as Dir, WALK_FRAMES, r))
    this.player.facing = OPPOSITE[n.actor.facing as Dir]
    await s.say(t.intro)
    await s.battle(t)
  }

  // ─── Encounters ──────────────────────────────────────────────────────

  pickWild(table: EncounterTable): { species: EncounterTable['slots'][number]['species']; level: number } {
    const slot = this.rng.weighted(table.slots, (s) => s.weight)
    return { species: slot.species, level: this.rng.int(slot.min, slot.max) }
  }

  private async encounter(table: EncounterTable): Promise<void> {
    const { species, level } = this.pickWild(table)
    const lead = this.save.party.find((c) => c.hp > 0)
    if (this.save.repel > 0 && lead && level < lead.level) return
    await this.run((s) => s.wild(species, level).then(() => undefined))
  }

  // ─── Interacting ─────────────────────────────────────────────────────

  private async interact(): Promise<void> {
    const f = this.front()
    let n = this.npcAt(f.x, f.y)
    // Talking across a counter.
    if (!n && (this.frontKind() === 'counter' || this.frontKind() === 'healer')) {
      const d = DELTA[this.player.facing]
      n = this.npcAt(f.x + d.dx, f.y + d.dy)
    }
    if (n) {
      await this.run((s) => this.talk(s, n!))
      return
    }
    const ball = this.itemAt(f.x, f.y)
    if (ball) {
      await this.run(async (s) => {
        s.set(`item:${ball.id}`)
        await s.give(ball.item, ball.qty ?? 1)
      })
      return
    }
    const hidden = this.map.def.items?.find((i) => i.hidden && i.x === f.x && i.y === f.y && !this.save.flags[`item:${i.id}`])
    if (hidden) {
      await this.run(async (s) => {
        s.set(`item:${hidden.id}`)
        await s.say(`${this.save.name} found something hidden!`)
        await s.give(hidden.item, hidden.qty ?? 1)
      })
      return
    }
    const sign = this.map.def.signs?.find((g) => g.x === f.x && g.y === f.y)
    if (sign) {
      await this.run((s) => s.say(sign.text))
      return
    }
    await this.run(hooks.facing)
  }

  private async talk(s: ScriptCtx, n: Npc): Promise<void> {
    if (!n.def.prop) s.faceEachOther(n.def.id)
    const t = n.def.trainer
    if (t && !this.save.flags[`beat:${t.id}`]) {
      await s.say(t.intro)
      await s.battle(t)
      return
    }
    if (n.def.script) {
      await n.def.script(s)
      return
    }
    if (t) {
      await s.say(t.after)
      return
    }
    const text = typeof n.def.text === 'function' ? n.def.text(this.save) : n.def.text
    if (text) await s.say(text)
  }

  // ─── Scripts ─────────────────────────────────────────────────────────

  async run(script: Script): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      await script(this.ctx())
    } finally {
      this.busy = false
      this.syncSave()
    }
  }

  private actorOf(who: Who): Actor | null {
    if (who === 'player') return this.player
    return this.npc(who)?.actor ?? null
  }

  ctx(): ScriptCtx {
    const game = this.game
    const save = this.save
    const self = this
    return {
      game,
      save,
      say: (text) => game.say(text),
      ask: (text, careful) => game.ask(text, { careful }),
      choose: (items, prompt) => game.choose(items, { prompt, cancel: items.length - 1 }),
      wait: (frames) => game.wait(frames),
      async walk(who, route, run) {
        const a = self.actorOf(who)
        if (!a) return
        for (const dir of parseRoute(route)) await new Promise<void>((r) => a.step(dir, run ? RUN_FRAMES : WALK_FRAMES, r))
        if (a === self.player) self.syncSave()
      },
      face(who, dir) {
        const a = self.actorOf(who)
        if (a) a.facing = dir
      },
      faceEachOther(who) {
        const a = self.actorOf(who)
        if (!a) return
        const dx = self.player.x - a.x
        const dy = self.player.y - a.y
        const toPlayer: Dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'
        a.facing = toPlayer
        self.player.facing = OPPOSITE[toPlayer]
      },
      actor: (who) => self.actorOf(who),
      show(id, x, y, face) {
        let n = self.npc(id)
        if (!n) {
          const def = self.map.def.npcs?.find((d) => d.id === id)
          if (!def) return
          n = { def, actor: new Actor(def.x, def.y, def.face ?? 'down'), timer: 60, home: { x: def.x, y: def.y } }
          self.npcs.push(n)
        }
        n.actor.hidden = false
        if (x !== undefined && y !== undefined) n.actor.place(x, y, face)
      },
      hide(id) {
        const n = self.npc(id)
        if (n) n.actor.hidden = true
      },
      async emote(who) {
        const a = self.actorOf(who)
        if (!a) return
        game.audio.sfx('exclaim')
        const e = { actor: a, t: 0 }
        self.emotes.push(e)
        await game.wait(40)
        self.emotes = self.emotes.filter((x) => x !== e)
      },
      battle: (t) => hooks.trainerBattle(self, t),
      wild: (species, level, o) => hooks.wildBattle(self, species, level, o ?? {}),
      async give(id, qty = 1, quiet = false) {
        addItem(save, id, qty)
        const it = itemData(id)
        if (!quiet) {
          const jingle = it.pocket === 'key' || it.pocket === 'discs' ? 'keyItemGet' : 'itemGet'
          void game.audio.playJingle(jingle)
          await game.say(`${save.name} got ${qty > 1 ? `${qty}× ` : ''}${it.name}!`)
        }
      },
      giveCritter: (species, level, nickname) => hooks.giveCritter(self, species, level, nickname ?? true),
      async heal() {
        await hooks.healParty(self)
      },
      flag: (name) => !!save.flags[name],
      set(name) {
        save.flags[name] = true
      },
      clear(name) {
        delete save.flags[name]
      },
      warp: (map, x, y, face) => self.warp(map, x, y, face),
      music: (id) => game.audio.playMusic(id),
      jingle: (id) => game.audio.playJingle(id),
      sfx: (id) => game.audio.sfx(id),
      fadeOut: (white) => game.fadeOut(white),
      fadeIn: () => game.fadeIn(),
      refresh: () => self.refreshNpcs(),
    }
  }

  // ─── Drawing ─────────────────────────────────────────────────────────

  camera(): { x: number; y: number } {
    return { x: this.player.x * 16 + this.player.ox - VIEW_X, y: this.player.y * 16 + this.player.oy - VIEW_Y }
  }

  private setPalettes(g: Gfx): void {
    const pals = slotPalettes(this.map.def)
    for (const [slot, id] of Object.entries(pals)) g.setPal(Number(slot), PAL[id])
  }

  draw(g: Gfx): void {
    this.setPalettes(g)
    g.clear(3, SLOT.land)
    const cam = this.camera()
    const frame = this.game.frame
    const cx0 = Math.floor(cam.x / 16)
    const cy0 = Math.floor(cam.y / 16)
    // Ground.
    for (let cy = cy0; cy <= cy0 + 9; cy++)
      for (let cx = cx0; cx <= cx0 + 10; cx++) {
        const kind = this.world.kindAt(this.map, cx, cy)
        const art = TILE_ART[kind]
        const sx = cx * 16 - cam.x
        const sy = cy * 16 - cam.y
        for (const l of art.layers) g.sprite(layerFrame(l, frame, art.speed), sx, sy, { slot: l.slot })
      }
    // Buildings on this map and its neighbours.
    this.drawBuildings(g, cam)
    // Items lying about.
    for (const it of this.map.def.items ?? []) {
      if (it.hidden || this.save.flags[`item:${it.id}`]) continue
      g.sprite(ITEM_BALL, it.x * 16 - cam.x, it.y * 16 - cam.y, { slot: SLOT.fx })
    }
    // People, back to front.
    const actors: { a: Actor; draw: () => void }[] = []
    for (const n of this.npcs) {
      if (n.actor.hidden) continue
      actors.push({ a: n.actor, draw: () => this.drawNpc(g, n, cam) })
    }
    actors.push({ a: this.player, draw: () => this.drawPlayer(g, cam) })
    actors.sort((p, q) => p.a.y * 16 + p.a.oy - (q.a.y * 16 + q.a.oy))
    for (const x of actors) x.draw()
    for (const e of this.effects) this.drawEffect(g, e, cam)
    for (const e of this.emotes) g.sprite(EMOTE, e.actor.x * 16 + e.actor.ox - cam.x + 4, e.actor.y * 16 + e.actor.oy - cam.y - 14, { slot: SLOT.fx })
    if (this.map.def.dark && !this.lit) this.darken(g)
    if (this.popup) this.drawPopup(g)
  }

  private drawBuildings(g: Gfx, cam: { x: number; y: number }): void {
    const maps: { m: WorldMap; ox: number; oy: number }[] = [{ m: this.map, ox: 0, oy: 0 }]
    for (const side of ['north', 'south', 'east', 'west'] as const) {
      const n = this.world.neighbor(this.map, side)
      if (n) maps.push({ m: n.map, ox: n.ox, oy: n.oy })
    }
    for (const { m, ox, oy } of maps)
      for (const b of m.def.buildings ?? []) {
        const size = BUILDING_SIZE[b.kind]
        const sx = (b.x + ox) * 16 - cam.x
        const sy = (b.y + oy) * 16 - cam.y
        if (sx > SCREEN_W || sy > SCREEN_H || sx + size.w * 16 < 0 || sy + size.h * 16 < 0) continue
        for (const l of buildingArt(b.kind).layers) g.sprite(l.sprite, sx, sy, { slot: l.slot })
      }
  }

  private personSprite(look: keyof typeof PEOPLE, a: Actor): { s: Sprite; slot: number } {
    const lk = PEOPLE[look]
    const frames = person(lk).frames[a.facing]
    return { s: frames[a.walkFrame()], slot: SLOT.people + (lk.tint ?? 0) }
  }

  private drawNpc(g: Gfx, n: Npc, cam: { x: number; y: number }): void {
    const a = n.actor
    const x = a.x * 16 + a.ox - cam.x
    const y = a.y * 16 + a.oy - cam.y - 4
    if (n.def.prop === 'hidden') return
    if (n.def.prop === 'capsule') {
      g.sprite(ITEM_BALL, x, y + 4, { slot: SLOT.fx })
      return
    }
    if (n.def.prop === 'boulder') {
      g.sprite(TILE_ART.rock.layers[1].frames[0], x, y + 4, { slot: SLOT.stone })
      return
    }
    if (n.def.prop === 'critter' && n.def.critter) {
      g.sprite(critterIcon(n.def.critter, Math.floor(this.game.frame / 20) % 2 ? 1 : 0), x, y + 4, { slot: SLOT.fx, flipX: a.facing === 'right' })
      return
    }
    const { s, slot } = this.personSprite(n.def.look, a)
    g.sprite(s, x, y, { slot })
    this.drawGrassOver(g, a, cam)
  }

  private drawPlayer(g: Gfx, cam: { x: number; y: number }): void {
    const a = this.player
    const x = VIEW_X + (a.x * 16 + a.ox - cam.x - VIEW_X)
    const y = a.y * 16 + a.oy - cam.y - 4 - a.lift
    if (a.lift > 0) g.sprite(SHADOW, x, a.y * 16 + a.oy - cam.y + 11, { slot: SLOT.fx })
    if (a.swimming) {
      const bob = Math.floor(a.tick / 16) % 2
      const lead = this.save.party.find((c) => c.hp > 0)
      if (lead) g.sprite(critterIcon(lead.species, 0), x, y + 6 + bob, { slot: SLOT.fx, flipX: a.facing === 'right' })
      const { s, slot } = this.personSprite('player', a)
      g.clip(0, 0, SCREEN_W, y + 10 + bob)
      g.sprite(s, x, y - 2 + bob, { slot })
      g.unclip()
      return
    }
    const { s, slot } = this.personSprite('player', a)
    g.sprite(s, x, y, { slot })
    this.drawGrassOver(g, a, cam)
  }

  /** Tall grass hides the feet of whoever stands in it. */
  private drawGrassOver(g: Gfx, a: Actor, cam: { x: number; y: number }): void {
    if (a.busy && a.lift > 0) return
    const kind = this.world.kindAt(this.map, a.x, a.y)
    const over = TILE_ART[kind].overlay
    if (!over || a.ox !== 0 || a.oy !== 0) return
    g.sprite(over.frames[0], a.x * 16 - cam.x, a.y * 16 - cam.y, { slot: over.slot })
  }

  private drawEffect(g: Gfx, e: Effect, cam: { x: number; y: number }): void {
    const x = e.x * 16 - cam.x
    const y = e.y * 16 - cam.y
    if (e.kind === 'rustle') {
      const k = Math.floor(e.t / 4)
      for (const [dx, dy] of [
        [2, 12],
        [12, 12],
      ])
        g.px(x + dx + (dx < 8 ? -k : k), y + dy - k, 3, SLOT.tree)
    } else if (e.kind === 'dust') {
      const k = Math.floor(e.t / 3)
      g.px(x + 2 - k, y + 14, 1, SLOT.land)
      g.px(x + 13 + k, y + 14, 1, SLOT.land)
    }
  }

  /** A dark cave: only a little circle around the player shows. */
  private darken(g: Gfx): void {
    const cx = VIEW_X + 8
    const cy = VIEW_Y + 6
    const r2 = 20 * 20
    for (let y = 0; y < SCREEN_H; y++)
      for (let x = 0; x < SCREEN_W; x++) {
        const d = (x - cx) ** 2 + (y - cy) ** 2
        if (d > r2) {
          const i = y * SCREEN_W + x
          g.shade[i] = 3
        }
      }
  }

  private drawPopup(g: Gfx): void {
    const t = this.popup!.t
    const slide = t < 10 ? 10 - t : t > 130 ? t - 130 : 0
    const name = this.popup!.name
    const w = Math.max(64, name.length * 8 + 16)
    g.window(0, -slide * 3, w, 24)
    g.text(name, 8, 8 - slide * 3)
  }
}

/** Avoids an unused import warning for MAPS/CLEAR in builds that strip effects. */
export const _unused = [MAPS, CLEAR, itemCount]
