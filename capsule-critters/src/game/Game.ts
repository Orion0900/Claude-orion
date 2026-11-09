import type { Audio } from '../audio/api'
import { Gfx } from '../engine/gfx'
import { IDLE_PAD, type InputHub } from '../engine/input'
import { PAL, UI_SLOT } from '../engine/palettes'
import { Dialog } from '../ui/Dialog'
import { ChoiceMenu, type ChoiceOptions } from '../ui/Menu'
import { DEFAULT_OPTIONS, type Options, type SaveData } from './state'
import type { Modal, Scene } from './scene'

/** Frames per character at each text speed. */
const TEXT_FRAMES: Record<Options['textSpeed'], number> = { 0: 3, 1: 2, 2: 1 }

/** Frames per handheld fade step. */
const FADE_STEP = 5

/**
 * The shell every scene runs in: the scene stack, the clock, the fade and the
 * services (screen, input, sound, the save). Scenes and scripts talk to the
 * game through here, mostly with async helpers — `await game.say(...)`,
 * `await game.run(menu)` — so cutscenes read top to bottom like a script.
 */
export class Game {
  readonly gfx = new Gfx()
  private readonly stack: Scene[] = []
  private timers: { at: number; resolve: () => void }[] = []
  /** Ticks since boot, for animation. */
  frame = 0
  /** The game in play; null on the title screen. */
  save: SaveData | null = null
  options: Options = { ...DEFAULT_OPTIONS }
  private fadeTarget = 0
  private fadeWaiters: (() => void)[] = []
  private fadeClock = 0

  constructor(
    private readonly ctx: CanvasRenderingContext2D | null,
    readonly input: InputHub,
    readonly audio: Audio,
  ) {}

  get top(): Scene | undefined {
    return this.stack[this.stack.length - 1]
  }

  get depth(): number {
    return this.stack.length
  }

  /** The scenes on the stack, bottom first (for tests). */
  get scenes(): readonly Scene[] {
    return this.stack
  }

  push(scene: Scene): void {
    this.stack.push(scene)
    scene.enter?.()
  }

  /** Removes a scene (the top one by default). */
  pop(scene?: Scene): void {
    const i = scene ? this.stack.lastIndexOf(scene) : this.stack.length - 1
    if (i < 0) return
    const [gone] = this.stack.splice(i, 1)
    gone.exit?.()
  }

  /** Clears the stack and starts over from `scene`. */
  reset(scene: Scene): void {
    while (this.stack.length) this.pop()
    this.timers = []
    this.push(scene)
  }

  /** Pushes a modal scene and resolves with its result once it finishes; it pops itself. */
  run<T>(scene: Modal<T>): Promise<T> {
    return new Promise<T>((resolve) => {
      scene.bind((v) => {
        this.pop(scene)
        resolve(v)
      })
      this.push(scene)
    })
  }

  /** Resolves after `frames` ticks. */
  wait(frames: number): Promise<void> {
    return new Promise((resolve) => this.timers.push({ at: this.frame + Math.max(1, Math.round(frames)), resolve }))
  }

  get textFrames(): number {
    return TEXT_FRAMES[this.options.textSpeed]
  }

  /** Shows text in the text box and resolves once it has been read. */
  say(text: string, o: { hold?: boolean; auto?: number } = {}): Promise<void> {
    return this.run(new Dialog(text, { speed: this.textFrames, hold: o.hold, auto: o.auto, onAdvance: () => this.audio.sfx('select') }))
  }

  /** A question with YES / NO; B answers NO. */
  async ask(text: string, o: { careful?: boolean } = {}): Promise<boolean> {
    await this.say(text, { hold: true })
    const i = await this.choose(['YES', 'NO'], { prompt: text, cancel: 1, start: o.careful ? 1 : 0 })
    return i === 0
  }

  /** A menu of options, optionally keeping a prompt in the text box. */
  choose(items: readonly string[], o: ChoiceOptions = {}): Promise<number> {
    return this.run(new ChoiceMenu(items, { sound: (k) => this.audio.sfx(k), ...o }))
  }

  /** Fades to black (or white) in handheld steps. */
  fadeOut(white = false): Promise<void> {
    return this.fadeTo(white ? -3 : 3)
  }

  fadeIn(): Promise<void> {
    return this.fadeTo(0)
  }

  /** Sets the fade directly (e.g. start a scene black). */
  setFade(level: number): void {
    this.fadeTarget = level
    this.gfx.fade = level
    this.flushFadeWaiters()
  }

  get faded(): boolean {
    return this.gfx.fade !== 0
  }

  private fadeTo(level: number): Promise<void> {
    this.fadeTarget = level
    this.fadeClock = 0
    if (this.gfx.fade === level) return Promise.resolve()
    return new Promise((resolve) => this.fadeWaiters.push(resolve))
  }

  private flushFadeWaiters(): void {
    const w = this.fadeWaiters
    this.fadeWaiters = []
    for (const r of w) r()
  }

  /** Offers a tap to the top scene; false means nobody claimed it (it counts as A). */
  tap(x: number, y: number): boolean {
    return !!this.top?.tap?.(x, y)
  }

  /** One 60 Hz tick. */
  update(): void {
    this.frame++
    const top = this.top
    for (const s of [...this.stack]) {
      if (!this.stack.includes(s)) continue
      s.update(s === top ? this.input : IDLE_PAD, s === top)
    }
    if (this.gfx.fade !== this.fadeTarget) {
      if (++this.fadeClock >= FADE_STEP) {
        this.fadeClock = 0
        this.gfx.fade += Math.sign(this.fadeTarget - this.gfx.fade)
        if (this.gfx.fade === this.fadeTarget) this.flushFadeWaiters()
      }
    } else if (this.fadeWaiters.length) this.flushFadeWaiters()
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.frame)
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.frame)
        for (const t of due) t.resolve()
      }
    }
  }

  draw(): void {
    const g = this.gfx
    g.mode = this.options.display
    g.setPal(UI_SLOT, PAL.ui)
    let from = 0
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].opaque) {
        from = i
        break
      }
    }
    if (this.stack.length === 0 || !this.stack[from]?.opaque) g.clear(0, UI_SLOT)
    for (let i = from; i < this.stack.length; i++) this.stack[i].draw(g)
    if (this.ctx) g.present(this.ctx)
  }
}
