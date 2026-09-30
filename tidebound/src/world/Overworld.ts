import { PLAYER_LOOKS, type Facing } from '../art/look'
import type { EmoteKind, FieldEffect } from '../art/world'
import type { JingleId, SfxId, TrackId } from '../audio/api'
import type { Outcome } from '../battle/types'
import { dex, type SpeciesId } from '../data/dex'
import { item, type ItemId } from '../data/items'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import type { Scene } from '../game/scene'
import { addItem, hasFlag, itemCount, nextSeed, setFlag, type SaveData } from '../game/state'
import { Rng } from '../core/rng'
import { Actor, RUN_FRAMES, TILE, WALK_FRAMES } from './Actor'
import { MapPainter } from './render'
import { fillText, parsePath, type Script, type ScriptCtx, type WildOptions } from './script'
import { TERRAIN, type Dir } from './terrain'
import { DELTA, OPPOSITE, World, type WorldMap } from './WorldMap'
import type { EncounterTable, ItemBallDef, NpcDef, Side, TrainerDef } from './mapTypes'
import { overworldHooks } from './hooks'

interface Npc {
  def: NpcDef
  actor: Actor
  home: { x: number; y: number }
  timer: number
}

interface Effect {
  kind: FieldEffect
  x: number
  y: number
  t: number
  /** Ticks per frame. */
  speed: number
  frames: number
}

const PLAYER_X = 112
const PLAYER_Y = 72

/**
 * Walking around: the map, the player and everyone on it. Handles movement,
 * doors and edges, talking, trainers who spot you, wild encounters, surfing
 * and fishing, and runs the scripts that make up the story.
 */
export class Overworld implements Scene {
  readonly opaque = true
  readonly world: World
  map!: WorldMap
  readonly player: Actor
  npcs: Npc[] = []
  private readonly painter: MapPainter
  /** A script (or an event) has control. */
  busy = false
  private popup: { name: string; t: number } | null = null
  private effects: Effect[] = []
  private bumpCooldown = 0
  /** Frames the direction has been held since the player turned on the spot. */
  private turnHold = 0
  private readonly rng: Rng

  constructor(
    readonly game: Game,
    readonly save: SaveData,
    defs: ReadonlyMap<string, import('./mapTypes').MapDef>,
  ) {
    this.world = new World(defs)
    this.painter = new MapPainter(this.world)
    this.rng = new Rng(nextSeed(save))
    this.player = new Actor('player', save.x, save.y, save.facing, PLAYER_LOOKS[save.lookIndex] ?? PLAYER_LOOKS[0])
    this.player.surfing = save.surfing
  }

  enter(): void {
    this.load(this.save.map, this.save.x, this.save.y, this.save.facing)
    this.game.audio.playMusic(this.map.def.music)
    this.showPopup()
    void this.runEnterScript()
  }

  // ─── Maps ────────────────────────────────────────────────────────────

  /** Switches to a map and places the player; no fades, no music. */
  load(mapId: string, x: number, y: number, facing?: Facing): void {
    this.map = this.world.map(mapId)
    this.save.map = mapId
    this.player.place(x, y, facing)
    this.spawnNpcs()
    this.effects = []
  }

  private spawnNpcs(): void {
    this.npcs = (this.map.def.npcs ?? [])
      .filter((d) => !d.when || d.when(this.save))
      .map((def) => ({
        def,
        actor: new Actor(def.id, def.x, def.y, def.face ?? 'down', def.look),
        home: { x: def.x, y: def.y },
        timer: 60 + ((def.x * 7 + def.y * 13) % 120),
      }))
  }

  /** Re-checks which people should be present (after a story flag changes). */
  refreshNpcs(): void {
    const keep = new Map(this.npcs.map((n) => [n.def.id, n]))
    this.npcs = (this.map.def.npcs ?? [])
      .filter((d) => !d.when || d.when(this.save))
      .map(
        (def) =>
          keep.get(def.id) ?? {
            def,
            actor: new Actor(def.id, def.x, def.y, def.face ?? 'down', def.look),
            home: { x: def.x, y: def.y },
            timer: 90,
          },
      )
  }

  private showPopup(): void {
    if (!this.map.def.indoor) this.popup = { name: this.map.def.name, t: 0 }
  }

  private async runEnterScript(): Promise<void> {
    const s = this.map.def.onEnter
    if (s) await this.run(s)
  }

  /** Fades out, moves to another map, fades in. */
  async warp(mapId: string, x: number, y: number, facing?: Facing, sound: SfxId | null = null): Promise<void> {
    const wasBusy = this.busy
    this.busy = true
    if (sound) this.game.audio.sfx(sound)
    await this.game.fadeOut(12)
    const prevName = this.map.def.name
    const prevMusic = this.map.def.music
    this.load(mapId, x, y, facing)
    this.syncSave()
    if (this.map.def.music !== prevMusic && !this.save.surfing) this.game.audio.playMusic(this.map.def.music)
    if (this.map.def.name !== prevName) this.showPopup()
    await this.game.fadeIn(12)
    this.busy = wasBusy
    // Stepping out of a door or a cave mouth: walk clear of it.
    const k = this.map.kind(x, y)
    if (this.map.doorAt(x, y) || k === 'caveEntrance') {
      await this.autoStep('down')
    }
    await this.runEnterScript()
  }

  private autoStep(dir: Dir): Promise<void> {
    return new Promise((resolve) => this.player.step(dir, WALK_FRAMES, resolve))
  }

  /** Keeps the save's position in step with the player. */
  syncSave(): void {
    this.save.map = this.map.id
    this.save.x = this.player.x
    this.save.y = this.player.y
    this.save.facing = this.player.facing
    this.save.surfing = this.player.surfing
  }

  // ─── Queries ─────────────────────────────────────────────────────────

  npcAt(x: number, y: number): Npc | null {
    return this.npcs.find((n) => !n.actor.hidden && n.actor.x === x && n.actor.y === y) ?? null
  }

  itemAt(x: number, y: number): ItemBallDef | null {
    return this.map.def.items?.find((i) => i.x === x && i.y === y && !hasFlag(this.save, `item:${i.id}`)) ?? null
  }

  private occupied(x: number, y: number, except?: Actor): boolean {
    if (this.player !== except && this.player.x === x && this.player.y === y) return true
    if (this.npcs.some((n) => n.actor !== except && !n.actor.hidden && n.actor.x === x && n.actor.y === y)) return true
    return !!this.itemAt(x, y)
  }

  /** Whether `a` may step from its cell in `dir` (plain walking, or surfing). */
  private canStep(a: Actor, dir: Dir): boolean {
    const d = DELTA[dir]
    const tx = a.x + d.dx
    const ty = a.y + d.dy
    const at = this.world.locate(this.map, tx, ty)
    if (!at) return false
    if (this.occupied(tx, ty, a)) return false
    const kind = at.map.kind(at.x, at.y)!
    if (at.map.building(at.x, at.y)) return false
    if (a.surfing) return !!TERRAIN[kind].surf || TERRAIN[kind].walk
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
    this.effects = this.effects.filter((e) => e.t < e.speed * e.frames)
    if (this.popup && ++this.popup.t > 150) this.popup = null
    if (this.bumpCooldown > 0) this.bumpCooldown--
    if (!top || this.busy) return

    if (this.player.busy) return
    if (pad.pressed('start')) {
      this.game.audio.sfx('menuOpen')
      void this.run(overworldHooks.startMenu)
      return
    }
    if (pad.pressed('select')) {
      void this.run(overworldHooks.select)
      return
    }
    if (pad.pressed('a')) {
      void this.interact()
      return
    }
    const dir = pad.dir()
    if (!dir) {
      this.turnHold = 0
      return
    }
    if (dir !== this.player.facing && this.turnHold === 0 && pad.heldFor(dir) < 4) {
      // A tap turns on the spot; holding walks.
      this.player.facing = dir
      this.turnHold = 1
      return
    }
    if (this.turnHold > 0 && this.turnHold < 6 && pad.heldFor(dir) < 6) {
      this.turnHold++
      return
    }
    this.turnHold = 0
    const run = pad.held('b') && itemCount(this.save, 'sprintShoes') > 0 && !this.player.surfing
    this.tryMove(dir, run)
  }

  private tryMove(dir: Dir, run: boolean): void {
    const p = this.player
    p.facing = dir
    const d = DELTA[dir]
    const tx = p.x + d.dx
    const ty = p.y + d.dy
    const here = this.map.kind(p.x, p.y)

    // Leaving a building through the doormat.
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
          void this.warp(to.map, to.x, to.y, 'up')
        })
        return
      }
    }

    // Ledges: hop over when moving the way they drop.
    if (kind && TERRAIN[kind].ledge === dir && !p.surfing) {
      const lx = tx + d.dx
      const ly = ty + d.dy
      const land = this.world.locate(this.map, lx, ly)
      if (land && !this.occupied(lx, ly, p) && !land.map.building(land.x, land.y) && TERRAIN[land.map.kind(land.x, land.y)!].walk) {
        this.busy = true
        this.game.audio.sfx('ledge')
        p.hop(dir, () => {
          this.busy = false
          this.effect('dust', p.x, p.y, 3)
          this.afterStep()
        })
        return
      }
    }

    // Surfing onto land: hop off.
    if (p.surfing && kind && TERRAIN[kind].walk && at && !at.map.building(at.x, at.y) && !this.occupied(tx, ty, p)) {
      this.busy = true
      p.step(dir, WALK_FRAMES, () => {
        p.surfing = false
        this.save.surfing = false
        this.game.audio.playMusic(this.map.def.music)
        this.busy = false
        this.afterStep()
      })
      return
    }

    if (!this.canStep(p, dir)) {
      this.bump(dir)
      return
    }
    p.step(dir, run ? RUN_FRAMES : WALK_FRAMES, () => this.afterStep())
    if (kind === 'tallgrass') this.effect('grassRustle', tx, ty, 5)
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
    // Crossing into a connected map.
    if (!this.map.inside(p.x, p.y)) {
      const at = this.world.locate(this.map, p.x, p.y)
      if (at) {
        const prev = this.map
        this.map = at.map
        p.place(at.x, at.y, p.facing)
        this.spawnNpcs()
        if (at.map.def.music !== prev.def.music && !p.surfing) this.game.audio.playMusic(at.map.def.music)
        if (at.map.def.name !== prev.def.name) this.showPopup()
        void this.runEnterScript()
      }
    }
    this.syncSave()

    const kind = this.map.kind(p.x, p.y)!
    // Warps: stairs, cave mouths, ladders (doormats are handled on leaving).
    const w = this.map.warpAt(p.x, p.y)
    if (w && kind !== 'mat') {
      const sound: SfxId = kind === 'stairsUp' || kind === 'stairsDown' || kind === 'caveLadder' ? 'stairs' : 'door'
      void this.warp(w.to, w.tx, w.ty, w.face ?? p.facing, sound)
      return
    }

    if (this.save.repel > 0) {
      this.save.repel--
      if (this.save.repel === 0) {
        void this.run(async (s) => s.say('The MUSK SPRAY wore off...'))
        return
      }
    }

    // Story triggers.
    const trig = this.map.def.triggers?.find(
      (t) => p.x >= t.x && p.y >= t.y && p.x < t.x + (t.w ?? 1) && p.y < t.y + (t.h ?? 1) && (!t.when || t.when(this.save)),
    )
    if (trig) {
      void this.run(trig.script)
      return
    }

    if (this.checkTrainers()) return

    const enc = TERRAIN[kind].encounter
    if (enc) {
      const table = this.map.def.encounters?.[enc]
      if (table && this.rng.int(1, 100) <= table.rate) void this.encounter(table)
    }
  }

  private idle(n: Npc): void {
    const move = n.def.move ?? 'still'
    if (move === 'still' || n.actor.busy) return
    if (--n.timer > 0) return
    n.timer = 90 + this.rng.int(0, 150)
    const dirs: Dir[] = ['up', 'down', 'left', 'right']
    const dir = this.rng.pick(dirs)
    if (move === 'look') {
      n.actor.facing = dir
      if (n.def.trainer && !this.player.busy && !this.game.top?.opaque) this.checkTrainers()
      return
    }
    const d = DELTA[dir]
    const tx = n.actor.x + d.dx
    const ty = n.actor.y + d.dy
    if (Math.abs(tx - n.home.x) > 2 || Math.abs(ty - n.home.y) > 2) {
      n.actor.facing = dir
      return
    }
    if (this.map.inside(tx, ty) && this.canStep(n.actor, dir) && this.map.kind(tx, ty) !== 'mat' && !this.map.warpAt(tx, ty))
      n.actor.step(dir, WALK_FRAMES)
    else n.actor.facing = dir
  }

  // ─── Trainers ────────────────────────────────────────────────────────

  /** Starts a battle with any unbeaten trainer who can see the player. */
  private checkTrainers(): boolean {
    if (this.busy) return false
    const p = this.player
    for (const n of this.npcs) {
      const t = n.def.trainer
      if (!t || n.actor.hidden || hasFlag(this.save, `beat:${t.id}`)) continue
      const d = DELTA[n.actor.facing]
      const range = n.def.sight ?? 4
      for (let i = 1; i <= range; i++) {
        const cx = n.actor.x + d.dx * i
        const cy = n.actor.y + d.dy * i
        if (cx === p.x && cy === p.y) {
          void this.run((s) => this.spotted(s, n, t))
          return true
        }
        if (this.map.solid(cx, cy) || this.npcAt(cx, cy) || this.itemAt(cx, cy)) break
      }
    }
    return false
  }

  private async spotted(s: ScriptCtx, n: Npc, t: TrainerDef): Promise<void> {
    const a = n.actor
    s.sfx('exclaim')
    void this.game.audio.playJingle('trainerSpotted')
    await s.emote(a, 'exclaim')
    // Walk up until next to the player.
    let steps = Math.abs(this.player.x - a.x) + Math.abs(this.player.y - a.y) - 1
    while (steps-- > 0) await new Promise<void>((r) => a.step(a.facing, WALK_FRAMES, r))
    this.player.facing = OPPOSITE[a.facing]
    await s.say(t.intro)
    await s.battle(t, a)
  }

  // ─── Encounters ──────────────────────────────────────────────────────

  private pickWild(table: EncounterTable): { species: SpeciesId; level: number } {
    const slot = this.rng.weighted(table.slots, (s) => s.weight)
    return { species: slot.species, level: this.rng.int(slot.min, slot.max) }
  }

  private async encounter(table: EncounterTable): Promise<void> {
    const { species, level } = this.pickWild(table)
    if (this.save.repel > 0) {
      const lead = this.save.party.find((c) => c.hp > 0)
      if (lead && level < lead.level) return
    }
    await this.run((s) => s.wild(species, level).then(() => undefined))
  }

  // ─── Talking and using things ────────────────────────────────────────

  private async interact(): Promise<void> {
    const p = this.player
    const d = DELTA[p.facing]
    let tx = p.x + d.dx
    let ty = p.y + d.dy
    const kind = this.world.kindAt(this.map, tx, ty)
    // Counters: talk to whoever stands behind.
    if (TERRAIN[kind]?.counter) {
      tx += d.dx
      ty += d.dy
    }
    const npc = this.npcAt(tx, ty)
    if (npc) {
      await this.run((s) => this.talk(s, npc))
      return
    }
    const ball = this.itemAt(p.x + d.dx, p.y + d.dy)
    if (ball) {
      await this.run(async (s) => {
        setFlag(this.save, `item:${ball.id}`)
        const qty = ball.qty ?? 1
        addItem(this.save, ball.item, qty)
        s.jingle('itemGet')
        await s.say(`{PLAYER} found ${qty > 1 ? `${qty} ` : ''}${item(ball.item).name}!\f{PLAYER} put the ${item(ball.item).name} in the BAG.`)
      })
      return
    }
    const sx = p.x + d.dx
    const sy = p.y + d.dy
    const sign = this.map.def.signs?.find((g) => g.x === sx && g.y === sy)
    if (sign) {
      await this.run(async (s) => s.say(sign.text))
      return
    }
    const at = this.world.locate(this.map, sx, sy)
    const info = at ? TERRAIN[at.map.kind(at.x, at.y)!] : null
    if (info?.interact) await this.run((s) => overworldHooks.use(s, this, info.interact!))
  }

  private async talk(s: ScriptCtx, n: Npc): Promise<void> {
    const a = n.actor
    const t = n.def.trainer
    if (!n.def.prop) s.faceEach(a, this.player)
    if (t) {
      if (hasFlag(this.save, `beat:${t.id}`)) await s.say(t.after)
      else {
        await s.say(t.intro)
        await s.battle(t, a)
      }
      return
    }
    if (n.def.script) await n.def.script(s)
    else if (n.def.text) await s.say(n.def.text)
  }

  /** Surf or fish at the water in front. */
  canSurf(): SpeciesId | null {
    if (itemCount(this.save, 'tideCharm') === 0) return null
    const c = this.save.party.find((m) => m.hp > 0 && dex(m.species).types.includes('tide'))
    return c ? c.species : null
  }

  async startSurf(s: ScriptCtx): Promise<void> {
    const p = this.player
    this.busy = true
    s.sfx('splash')
    await new Promise<void>((r) => p.step(p.facing, WALK_FRAMES, r))
    p.surfing = true
    this.save.surfing = true
    this.game.audio.playMusic('surf')
    this.effect('splash', p.x, p.y, 4)
  }

  /** Casts the rod into the water ahead. */
  async fish(s: ScriptCtx): Promise<void> {
    const table = this.map.def.encounters?.fish
    s.sfx('rodCast')
    await s.say('{PLAYER} cast the DRIFT ROD… … …')
    if (!table || this.rng.int(1, 100) > table.rate) {
      await s.say('Not even a nibble…')
      return
    }
    s.sfx('bite')
    await s.say('Oh! A bite!')
    const { species, level } = this.pickWild(table)
    await s.wild(species, level)
  }

  /** Whether the player faces open water right now. */
  facingWater(): boolean {
    const d = DELTA[this.player.facing]
    const k = this.world.kindAt(this.map, this.player.x + d.dx, this.player.y + d.dy)
    return !!TERRAIN[k].surf
  }

  // ─── Scripts ─────────────────────────────────────────────────────────

  /** Runs a script with the player held still; nested runs share control. */
  async run(script: Script): Promise<void> {
    const outer = this.busy
    this.busy = true
    try {
      await script(this.ctx())
    } catch (e) {
      console.error('script failed', e)
    } finally {
      if (!outer) this.busy = false
    }
    this.syncSave()
  }

  private ctxCache: ScriptCtx | null = null

  ctx(): ScriptCtx {
    if (this.ctxCache) return this.ctxCache
    const ow = this
    const game = this.game
    const save = this.save
    const c: ScriptCtx = {
      game,
      save,
      player: this.player,
      npc(id) {
        const n = ow.npcs.find((m) => m.def.id === id)
        if (!n) throw new Error(`no one called ${id} on ${ow.map.id}`)
        return n.actor
      },
      say: (text) => game.say(fillText(text, save)),
      ask: (text) => game.ask(fillText(text, save)),
      choose: (prompt, items, cancel) => game.choose(items, { prompt: fillText(prompt, save), cancel: cancel === undefined ? items.length - 1 : cancel }),
      async walk(actor, path, run) {
        // Someone no longer on the map (it reloaded) just arrives, rather than hanging the script.
        if (actor !== ow.player && !ow.npcs.some((n) => n.actor === actor)) {
          for (const dir of parsePath(path)) {
            const d = DELTA[dir]
            actor.place(actor.x + d.dx, actor.y + d.dy, dir)
          }
          return
        }
        for (const dir of parsePath(path)) {
          await new Promise<void>((r) => actor.step(dir, run ? RUN_FRAMES : WALK_FRAMES, r))
          if (actor === ow.player) {
            ow.syncSave()
            if (ow.map.kind(actor.x, actor.y) === 'tallgrass') ow.effect('grassRustle', actor.x, actor.y, 5)
          }
        }
      },
      face(actor, dir) {
        actor.facing = dir
      },
      faceEach(a, b) {
        if (a.x < b.x) {
          a.facing = 'right'
          b.facing = 'left'
        } else if (a.x > b.x) {
          a.facing = 'left'
          b.facing = 'right'
        } else if (a.y < b.y) {
          a.facing = 'down'
          b.facing = 'up'
        } else if (a.y > b.y) {
          a.facing = 'up'
          b.facing = 'down'
        }
      },
      async emote(actor, kind: EmoteKind) {
        actor.emote = { kind, t: 0 }
        await game.wait(40)
      },
      wait: (frames) => game.wait(frames),
      flag: (f) => hasFlag(save, f),
      setFlag(f) {
        setFlag(save, f)
        ow.refreshNpcs()
      },
      async give(id: ItemId, qty = 1) {
        addItem(save, id, qty)
        const data = item(id)
        void game.audio.playJingle(data.pocket === 'key' ? 'keyItemGet' : 'itemGet')
        await game.say(fillText(`{PLAYER} received ${qty > 1 ? `${qty} ` : ''}${data.name}!`, save))
      },
      giveBeast: (species, level, place) => overworldHooks.giveBeast(c, ow, species, level, place ?? ow.map.def.name),
      heal: () => overworldHooks.healParty(save),
      battle: (t: TrainerDef, npc?: Actor) => overworldHooks.trainerBattle(c, ow, t, npc),
      wild: (species: SpeciesId, level: number, o?: WildOptions): Promise<Outcome> => overworldHooks.wildBattle(c, ow, species, level, o),
      music(id: TrackId | null) {
        if (id) game.audio.playMusic(id)
        else game.audio.stopMusic()
      },
      sfx: (id: SfxId) => game.audio.sfx(id),
      jingle: (id: JingleId) => game.audio.playJingle(id),
      warp: (map, x, y, face) => ow.warp(map, x, y, face),
      hide(actor) {
        actor.hidden = true
      },
      show(actor) {
        actor.hidden = false
      },
      money(delta) {
        save.money = Math.max(0, Math.min(999999, save.money + delta))
      },
    }
    this.ctxCache = c
    return c
  }

  // ─── Drawing ─────────────────────────────────────────────────────────

  effect(kind: FieldEffect, x: number, y: number, speed: number): void {
    const frames = { grassRustle: 3, splash: 3, shadow: 1, dust: 3, ripple: 3, sparkle: 4 }[kind]
    this.effects.push({ kind, x, y, t: 0, speed, frames })
  }

  /** The camera's top-left in map pixels. */
  camera(): { x: number; y: number } {
    const o = this.player.offset()
    return { x: this.player.x * TILE + o.dx - PLAYER_X, y: this.player.y * TILE + o.dy - PLAYER_Y }
  }

  draw(g: Gfx): void {
    const cam = this.camera()
    this.painter.draw(g, this.map, cam.x, cam.y, this.game.frame)

    for (const ball of this.map.def.items ?? []) {
      if (hasFlag(this.save, `item:${ball.id}`)) continue
      const img = Art.groundItem()
      g.image(img, ball.x * TILE - cam.x + (16 - img.w) / 2, ball.y * TILE - cam.y + (16 - img.h) / 2)
    }

    // Props: orbs on a table, or nothing at all for hidden ones.
    for (const n of this.npcs) {
      if (n.def.prop !== 'orb' || n.actor.hidden) continue
      const img = Art.orb('orb', 0)
      g.image(img, n.actor.x * TILE - cam.x + (16 - img.w) / 2, n.actor.y * TILE - cam.y + (16 - img.h) / 2 - 3)
    }

    const actors = [this.player, ...this.npcs.filter((n) => !n.actor.hidden && !n.def.prop).map((n) => n.actor)]
    const withPos = actors.map((a) => {
      const o = a.offset()
      return { a, px: a.x * TILE + o.dx - cam.x, py: a.y * TILE + o.dy - cam.y }
    })
    withPos.sort((p, q) => p.py - q.py)

    for (const { a, px, py } of withPos) {
      if (a.jumping) {
        const sh = Art.effect('shadow', 0)
        if (sh) g.image(sh, px, py + 2)
      }
    }
    for (const e of this.effects.filter((e) => e.kind === 'ripple')) this.drawEffect(g, e, cam)

    for (const { a, px, py } of withPos) {
      const lift = a.lift()
      if (a.surfing) {
        const img = Art.surf(a.look, a.facing, (Math.floor(this.game.frame / 24) % 2) as 0 | 1)
        g.image(img, px + 8 - img.w / 2, py + 16 - img.h + 2)
      } else {
        const img = Art.person(a.look, a.facing === 'right' ? 'left' : a.facing, a.frame())
        g.image(img, px + 8 - img.w / 2, py + 16 - img.h - lift, { flipX: a.facing === 'right' })
      }
    }

    // Tall grass in front of feet.
    for (const { a, px, py } of withPos) {
      if (a.jumping || a.surfing) continue
      const k = this.map.kind(a.x, a.y)
      if (k !== 'tallgrass') continue
      const ov = Art.overlay('tallgrass', 0)
      if (!ov) continue
      const cx = a.x * TILE - cam.x
      const cy = a.y * TILE - cam.y
      // Only once the actor is mostly into the cell, so the grass swallows them as they arrive.
      if (Math.abs(px - cx) < 10 && Math.abs(py - cy) < 10) g.image(ov, cx, cy)
    }

    for (const e of this.effects.filter((e) => e.kind !== 'ripple')) this.drawEffect(g, e, cam)

    for (const { a, px, py } of withPos) {
      if (!a.emote) continue
      const img = Art.emote(a.emote.kind)
      const bob = a.emote.t < 8 ? 8 - a.emote.t : 0
      g.image(img, px + 8 - img.w / 2, py - 30 - bob)
    }

    if (this.popup) this.drawPopup(g)
  }

  private drawEffect(g: Gfx, e: Effect, cam: { x: number; y: number }): void {
    const f = Math.min(e.frames - 1, Math.floor(e.t / e.speed))
    const img = Art.effect(e.kind, f)
    if (img) g.image(img, e.x * TILE - cam.x + 8 - img.w / 2, e.y * TILE - cam.y + 16 - img.h)
  }

  private drawPopup(g: Gfx): void {
    const t = this.popup!.t
    const slide = t < 12 ? t / 12 : t > 130 ? Math.max(0, (150 - t) / 20) : 1
    const y = Math.round(-28 + slide * 30)
    const w = Math.max(96, this.popup!.name.length * 6 + 22)
    g.panel(2, y, w, 24, '#f8f0d8', '#584028')
    g.rect(4, y + 2, w - 4, 1, '#c8a878')
    g.rect(4, y + 21, w - 4, 1, '#c8a878')
    g.text(this.popup!.name, 11, y + 7)
  }
}

export type OverworldSide = Side
