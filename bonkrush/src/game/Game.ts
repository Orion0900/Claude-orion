/**
 * The game shell: owns the renderer, the title screen and the loop, and
 * builds a `GameContext` for each run. Systems are created here in
 * dependency order; everything else happens inside the systems.
 */
import * as THREE from 'three'
import { EventBus } from '../core/events'
import { Rng } from '../core/rng'
import { CHARACTERS } from '../data/characters'
import { STAGES } from '../data/stages'
import { AudioEngine } from '../audio/AudioEngine'
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera'
import { EnemyManager } from '../enemies/EnemyManager'
import { Spawner } from '../enemies/Spawner'
import { Fx } from '../fx/Fx'
import { Input } from '../input/Input'
import { InteractableManager } from '../interactables/InteractableManager'
import { PickupManager } from '../pickups/PickupManager'
import { Player } from '../player/Player'
import { Progression } from '../progression/Progression'
import { Ui } from '../ui/Ui'
import { WeaponManager } from '../weapons/WeaponManager'
import { World } from '../world/World'
import { loadSave, silverForRun, writeSave } from './save'
import type {
  CharacterDef,
  GameContext,
  GameEvents,
  MetaSave,
  RunState,
  Settings,
  ShellApi,
  StageDef,
} from './types'

/** Longest frame the simulation will take in one step; slower frames run in slow motion. */
const MAX_DT = 1 / 20

type MutableContext = { -readonly [K in keyof GameContext]: GameContext[K] }

export class Game implements ShellApi {
  readonly meta: MetaSave
  readonly characters: readonly CharacterDef[] = CHARACTERS
  readonly renderer: THREE.WebGLRenderer
  readonly camera: THREE.PerspectiveCamera
  readonly input: Input
  readonly audio: AudioEngine
  readonly ui: Ui

  private scene = new THREE.Scene()
  private run: MutableContext | null = null
  private lastFrame = 0
  private simTime = 0
  private titleWorld: World | null = null
  private titleAngle = 0
  private readonly fxHost: HTMLElement
  private readonly params = new URLSearchParams(location.search)
  private unsubs: Array<() => void> = []
  private ending = false

  constructor(private readonly host: HTMLElement) {
    this.meta = loadSave()

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.meta.settings.quality !== 'low',
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'game-canvas'
    host.appendChild(this.renderer.domElement)

    this.fxHost = document.createElement('div')
    this.fxHost.className = 'fx-layer'
    host.appendChild(this.fxHost)

    const uiHost = document.createElement('div')
    uiHost.className = 'ui-layer'
    host.appendChild(uiHost)

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400)
    this.input = new Input(this.renderer.domElement, uiHost)
    this.audio = new AudioEngine()
    this.ui = new Ui(this, uiHost)
    this.ui.autoPick = this.params.has('bot')

    this.applySettings()
    window.addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.resize()

    // Browsers only allow sound after a gesture.
    const unlock = () => this.audio.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)

    // Handy in the console and for automated play-tests.
    ;(window as unknown as { __bonk: Game }).__bonk = this
  }

  get ctx(): GameContext | null {
    return this.run
  }

  start(): void {
    this.showTitle()
    const character = this.params.get('play')
    if (character && this.characters.some((c) => c.id === character)) this.startRun(character)
    this.lastFrame = performance.now()
    requestAnimationFrame(this.frame)
  }

  // ─────────────────────────── shell api ───────────────────────────

  isUnlocked(characterId: string): boolean {
    const c = this.characters.find((x) => x.id === characterId)
    return !!c && (c.unlockCost <= 0 || this.meta.unlockedCharacters.includes(characterId))
  }

  unlockCharacter(id: string): boolean {
    const c = this.characters.find((x) => x.id === id)
    if (!c || this.isUnlocked(id) || this.meta.silver < c.unlockCost) return false
    this.meta.silver -= c.unlockCost
    this.meta.unlockedCharacters.push(id)
    this.saveMeta()
    return true
  }

  saveMeta(): void {
    writeSave(this.meta)
    this.applySettings()
  }

  startRun(characterId: string): void {
    const character = this.characters.find((c) => c.id === characterId) ?? this.characters[0]
    this.teardownRun()
    this.disposeTitleWorld()
    this.ending = false

    const seed = Number(this.params.get('seed')) || Math.floor(Math.random() * 2 ** 31)
    const run: RunState = {
      seed,
      characterId: character.id,
      stageIndex: 0,
      stageTime: 0,
      totalTime: 0,
      stageDuration: STAGES[0].duration,
      kills: 0,
      gold: 0,
      silver: 0,
      damageDealt: 0,
      damageTaken: 0,
      chestsOpened: 0,
      shrinesUsed: 0,
      bossesKilled: 0,
      elitesKilled: 0,
      bossSpawned: false,
      bossDefeated: false,
      portalOpen: false,
      curse: 0,
    }

    const events = new EventBus<GameEvents>()
    const rng = new Rng(seed)
    const game = this
    const ctx = {
      scene: this.scene,
      renderer: this.renderer,
      rng,
      events,
      run,
      meta: this.meta,
      settings: this.meta.settings,
      character,
      stage: STAGES[0],
      input: this.input,
      audio: this.audio,
      ui: this.ui,
      get time() {
        return game.simTime
      },
      addGold(amount: number, raw = false) {
        const delta = amount > 0 && !raw ? amount * ctx.progression.stats.goldGain : amount
        run.gold = Math.max(0, run.gold + delta)
        events.emit('goldChanged', { gold: run.gold, delta })
      },
      advanceStage() {
        void game.advanceStage()
      },
    } as MutableContext
    this.run = ctx

    // Per-run systems first, then the stage.
    ctx.progression = new Progression(ctx)
    this.buildStage(ctx, STAGES[0])
    ctx.player = new Player(ctx)
    ctx.camera = new ThirdPersonCamera(ctx, this.camera)
    ctx.weapons = new WeaponManager(ctx)
    ctx.weapons.add(character.startWeapon)
    ctx.progression.recompute()
    ctx.player.refresh()
    ctx.camera.snap()

    this.listen(ctx)
    this.ui.attach(ctx)
    this.audio.startMusic(0)
    this.meta.runs++
    writeSave(this.meta)
    if (!this.input.isTouch && !this.params.has('bot')) this.input.requestLook()
  }

  quitToTitle(): void {
    this.teardownRun()
    this.showTitle()
  }

  // ─────────────────────────── run lifecycle ───────────────────────────

  /** Builds the per-stage systems. Order matters: each may read the ones before it. */
  private buildStage(ctx: MutableContext, stage: StageDef): void {
    ctx.stage = stage
    ctx.run.stageIndex = stage.index
    ctx.run.stageTime = 0
    ctx.run.stageDuration = stage.duration
    ctx.run.bossSpawned = false
    ctx.run.bossDefeated = false
    ctx.run.portalOpen = false
    ctx.run.curse = 0
    ctx.world = new World(ctx)
    ctx.fx = new Fx(ctx, this.fxHost)
    ctx.enemies = new EnemyManager(ctx)
    ctx.spawner = new Spawner(ctx)
    ctx.pickups = new PickupManager(ctx)
    ctx.interactables = new InteractableManager(ctx)
  }

  private disposeStage(ctx: MutableContext): void {
    ctx.interactables?.dispose()
    ctx.pickups?.dispose()
    ctx.enemies?.dispose()
    ctx.fx?.dispose()
    ctx.world?.dispose()
  }

  private async advanceStage(): Promise<void> {
    const ctx = this.run
    if (!ctx || this.ending) return
    ctx.events.emit('stageCleared', { stageIndex: ctx.run.stageIndex })
    const next = ctx.run.stageIndex + 1
    this.meta.bestStage = Math.max(this.meta.bestStage, next)
    if (next >= STAGES.length) {
      await this.endRun(true)
      return
    }
    this.input.releaseLook()
    this.audio.play('portal')
    await this.ui.openModal({ kind: 'stageClear', nextStage: next })
    if (this.run !== ctx) return
    this.disposeStage(ctx)
    this.buildStage(ctx, STAGES[next])
    const start = ctx.world.spots.playerStart
    ctx.player.pos.copy(start)
    ctx.player.vel.set(0, 0, 0)
    ctx.player.refresh()
    ctx.camera.snap()
    this.ui.attach(ctx)
    this.audio.startMusic(next)
    if (!this.input.isTouch && !this.params.has('bot')) this.input.requestLook()
  }

  private async endRun(victory: boolean): Promise<void> {
    const ctx = this.run
    if (!ctx || this.ending) return
    this.ending = true
    const r = ctx.run
    const earned = silverForRun({ ...r, silverGain: ctx.progression.stats.silverGain })
    r.silver = earned
    this.meta.silver += earned
    this.meta.bestTime = Math.max(this.meta.bestTime, r.totalTime)
    this.meta.bestKills = Math.max(this.meta.bestKills, r.kills)
    this.meta.bestStage = Math.max(this.meta.bestStage, r.stageIndex + (victory ? 1 : 0))
    writeSave(this.meta)
    this.input.releaseLook()
    this.audio.stopMusic()
    this.audio.play(victory ? 'victory' : 'death')
    await this.ui.openModal({ kind: victory ? 'victory' : 'gameOver' })
  }

  private listen(ctx: MutableContext): void {
    const on = <K extends keyof GameEvents>(type: K, fn: (p: GameEvents[K]) => void) =>
      this.unsubs.push(ctx.events.on(type, fn))

    on('playerDied', () => void this.endRun(false))
    on('enemyKilled', ({ enemy }) => {
      ctx.run.kills++
      if (enemy.elite) ctx.run.elitesKilled++
    })
    on('enemyHit', ({ amount }) => {
      ctx.run.damageDealt += amount
    })
    on('playerDamaged', ({ amount }) => {
      ctx.run.damageTaken += amount
    })
    on('bossSpawned', () => {
      ctx.run.bossSpawned = true
    })
    on('bossKilled', ({ enemy }) => {
      ctx.run.bossesKilled++
      if (ctx.run.bossDefeated) return
      ctx.run.bossDefeated = true
      // Like the original: beating the boss skips the clock to the last ten seconds.
      ctx.run.stageTime = Math.max(ctx.run.stageTime, ctx.run.stageDuration - 10)
      ctx.interactables.openPortal(enemy.pos.clone())
    })
    on('portalOpened', () => {
      ctx.run.portalOpen = true
    })
    on('chestOpened', () => {
      ctx.run.chestsOpened++
    })
    on('shrineUsed', () => {
      ctx.run.shrinesUsed++
    })
  }

  private teardownRun(): void {
    const ctx = this.run
    if (!ctx) return
    for (const off of this.unsubs) off()
    this.unsubs = []
    this.ui.attach(null)
    this.disposeStage(ctx)
    ctx.weapons?.dispose()
    ctx.player?.dispose()
    ctx.events.clear()
    this.audio.stopMusic()
    this.input.releaseLook()
    this.run = null
    this.clearScene()
  }

  // ─────────────────────────── title screen ───────────────────────────

  private showTitle(): void {
    this.ui.showTitle()
    if (this.titleWorld) return
    // A slowly orbiting view of the first stage sits behind the menus.
    // World only reads scene, stage, rng and settings when built.
    const preview = {
      scene: this.scene,
      renderer: this.renderer,
      rng: new Rng(7),
      stage: STAGES[0],
      settings: this.meta.settings,
      meta: this.meta,
      events: new EventBus<GameEvents>(),
    } as unknown as GameContext
    this.titleWorld = new World(preview)
  }

  private disposeTitleWorld(): void {
    this.titleWorld?.dispose()
    this.titleWorld = null
    this.clearScene()
  }

  private clearScene(): void {
    for (const child of [...this.scene.children]) this.scene.remove(child)
    this.scene.fog = null
    this.scene.background = null
  }

  // ─────────────────────────── loop ───────────────────────────

  private frame = (now: number) => {
    requestAnimationFrame(this.frame)
    const realDt = Math.min(0.25, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    const dt = Math.min(MAX_DT, realDt)

    const ctx = this.run
    if (ctx) this.tick(ctx, dt)
    else this.tickTitle(dt)

    this.audio.update(realDt)
    this.ui.update(realDt)
    this.input.endFrame()
    this.renderer.render(this.scene, this.camera)
  }

  private tick(ctx: MutableContext, dt: number): void {
    const input = this.input.state
    if (input.pausePressed && !this.ui.modalOpen && !this.ending) {
      this.input.releaseLook()
      void this.ui.openModal({ kind: 'pause' }).then(() => {
        if (this.run === ctx && !this.input.isTouch && !this.params.has('bot')) this.input.requestLook()
      })
    }

    const paused = this.ui.modalOpen || this.ending
    if (!paused) {
      this.simTime += dt
      ctx.run.stageTime += dt
      ctx.run.totalTime += dt

      if (input.interactPressed) ctx.interactables.interact()

      ctx.progression.update(dt)
      ctx.player.update(dt)
      ctx.spawner.update(dt)
      ctx.enemies.update(dt)
      ctx.weapons.update(dt)
      ctx.pickups.update(dt)
      ctx.interactables.update(dt)
      ctx.world.update(dt)
      ctx.fx.update(dt)
      this.audio.setIntensity(ctx.spawner.intensity)

      if (ctx.progression.pendingLevelUps > 0 && !this.ui.modalOpen && ctx.player.alive) {
        this.input.releaseLook()
        void this.ui.openModal({ kind: 'levelUp' }).then(() => {
          if (this.run === ctx && !this.ui.modalOpen && !this.input.isTouch && !this.params.has('bot'))
            this.input.requestLook()
        })
      }
    } else {
      // Keep floating numbers and particles settled while paused.
      ctx.fx.update(0)
    }
    ctx.camera.update(paused ? 0 : dt)
  }

  private tickTitle(dt: number): void {
    this.titleAngle += dt * 0.05
    const world = this.titleWorld
    const r = 60
    const x = Math.cos(this.titleAngle) * r
    const z = Math.sin(this.titleAngle) * r
    const ground = world ? world.heightAt(x, z) : 0
    this.camera.position.set(x, ground + 22, z)
    this.camera.lookAt(0, world ? world.heightAt(0, 0) + 2 : 0, 0)
    world?.update(dt)
  }

  // ─────────────────────────── settings ───────────────────────────

  private applySettings(): void {
    const s: Settings = this.meta.settings
    const ratioCap = s.quality === 'high' ? 2 : s.quality === 'medium' ? 1.5 : 1
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratioCap))
    this.renderer.shadowMap.enabled = s.quality !== 'low'
    this.audio.setVolumes(s.master, s.music, s.sfx)
    this.input.configure(s.sensitivity, s.invertY)
    this.resize()
  }

  private resize = () => {
    const w = this.host.clientWidth || window.innerWidth
    const h = this.host.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private onVisibility = () => {
    const ctx = this.run
    if (document.hidden && ctx && !this.ui.modalOpen && !this.ending) {
      this.input.releaseLook()
      void this.ui.openModal({ kind: 'pause' })
    }
  }
}
