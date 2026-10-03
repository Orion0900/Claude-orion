import type { Audio } from '../audio/api'
import { Gfx } from '../engine/gfx'
import { IDLE_PAD, type InputHub } from '../engine/input'
import { Dialog } from '../ui/Dialog'
import { ChoiceMenu, type ChoiceOptions } from '../ui/Menu'
import { DEFAULT_OPTIONS, type Options, type SaveData } from './state'
import type { Modal, Scene } from './scene'

const TEXT_FRAMES: Record<Options['textSpeed'], number> = { 0: 4, 1: 2, 2: 1 }

/**
 * The shell every scene runs in: the scene stack, the clock, the fade
 * curtain and the services (screen, input, sound, the save). Scenes and
 * scripts talk to the game through here, mostly with async helpers —
 * `await game.say(...)`, `await game.run(menu)` — so cutscenes read top to
 * bottom like a script.
 */
export class Game {
  readonly gfx: Gfx
  private readonly stack: Scene[] = []
  private timers: { at: number; resolve: () => void }[] = []
  /** Ticks since boot, for animation. */
  frame = 0
  /** The saved game in play; null on the title screen. */
  save: SaveData | null = null
  options: Options = { ...DEFAULT_OPTIONS }
  private fadeLevel = 0
  private fadeColor = '#000'
  private fadeTween: { from: number; to: number; t: number; frames: number; resolve: () => void } | null = null

  constructor(
    ctx: CanvasRenderingContext2D,
    readonly input: InputHub,
    readonly audio: Audio,
  ) {
    this.gfx = new Gfx(ctx)
  }

  get top(): Scene | undefined {
    return this.stack[this.stack.length - 1]
  }

  get depth(): number {
    return this.stack.length
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

  /** Clears the stack and starts over from `scene` (title, new game, continue). */
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

  /** Shows text in the dialog box and resolves once it has been read. */
  say(text: string, o: { hold?: boolean; speed?: number } = {}): Promise<void> {
    return this.run(
      new Dialog(text, {
        speed: o.speed ?? TEXT_FRAMES[this.options.textSpeed],
        hold: o.hold,
        onAdvance: () => this.audio.sfx('select'),
      }),
    )
  }

  /** Asks a question with YES / NO; B answers NO. `careful` starts the cursor on NO. */
  async ask(text: string, o: { careful?: boolean } = {}): Promise<boolean> {
    await this.say(text, { hold: true })
    const i = await this.choose(['YES', 'NO'], { prompt: text, cancel: 1, start: o.careful ? 1 : 0 })
    return i === 0
  }

  /** A menu of options, optionally with a prompt kept in the text box. */
  choose(items: readonly string[], o: ChoiceOptions = {}): Promise<number> {
    return this.run(new ChoiceMenu(items, { sound: (k) => this.audio.sfx(k), ...o }))
  }

  /** Fades the screen to `color` over `frames` ticks. */
  fadeOut(frames = 16, color = '#000'): Promise<void> {
    this.fadeColor = color
    return this.tweenFade(1, frames)
  }

  fadeIn(frames = 16): Promise<void> {
    return this.tweenFade(0, frames)
  }

  /** Sets the curtain directly, e.g. to start a scene faded out. */
  setFade(level: number, color = '#000'): void {
    this.fadeTween?.resolve()
    this.fadeTween = null
    this.fadeLevel = level
    this.fadeColor = color
  }

  get faded(): number {
    return this.fadeLevel
  }

  private tweenFade(to: number, frames: number): Promise<void> {
    this.fadeTween?.resolve()
    return new Promise((resolve) => {
      if (frames <= 0) {
        this.fadeLevel = to
        this.fadeTween = null
        resolve()
        return
      }
      this.fadeTween = { from: this.fadeLevel, to, t: 0, frames, resolve }
    })
  }

  /**
   * Offers a tap at game pixel (x, y) to the top scene. False means nobody
   * claimed it, and the caller treats it as a press of A.
   */
  tap(x: number, y: number): boolean {
    const top = this.top
    return !!top?.tap?.(x, y)
  }

  /** One 60 Hz tick. */
  update(): void {
    this.frame++
    const top = this.top
    // Copy: scenes may push or pop while updating.
    for (const s of [...this.stack]) {
      if (!this.stack.includes(s)) continue
      s.update(s === top ? this.input : IDLE_PAD, s === top)
    }
    if (this.fadeTween) {
      const f = this.fadeTween
      f.t++
      this.fadeLevel = f.from + (f.to - f.from) * Math.min(1, f.t / f.frames)
      if (f.t >= f.frames) {
        this.fadeTween = null
        f.resolve()
      }
    }
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.frame)
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.frame)
        for (const t of due) t.resolve()
      }
    }
  }

  draw(): void {
    let from = 0
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].opaque) {
        from = i
        break
      }
    }
    if (this.stack.length === 0 || !this.stack[from]?.opaque) this.gfx.clear('#000')
    for (let i = from; i < this.stack.length; i++) this.stack[i].draw(this.gfx)
    this.gfx.overlay(this.fadeColor, this.fadeLevel)
  }
}
