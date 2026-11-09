import { CH, wrap } from './font'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { Modal } from '../game/scene'

/** The text box: the bottom six tile rows of the screen. */
export const BOX_Y = 96
export const BOX_H = 48
export const TEXT_X = 8
export const LINE_Y = [BOX_Y + 12, BOX_Y + 28] as const
/** Characters per line of dialog. */
export const COLS = 18

/**
 * Breaks dialog into boxes of lines. '\f' starts a fresh box; within a box
 * the lines scroll up one at a time, as handheld text does.
 */
export function layoutDialog(text: string): string[][] {
  return text.split('\f').map((page) => wrap(page, COLS))
}

export interface DialogOptions {
  /** Frames per character: 0 prints instantly. */
  speed: number
  /** Leave the last box on screen and finish once it has printed (a question follows). */
  hold?: boolean
  /** Finish by itself this many frames after the last line prints (battle text). */
  auto?: number
  /** Called for each printed character. */
  onChar?: () => void
  /** Called when a page is advanced with A or B. */
  onAdvance?: () => void
}

type Phase = 'print' | 'wait' | 'scroll' | 'done'

/**
 * The text box. Prints a character at a time, shows the blinking ▼ when the
 * box is full, scrolls up a line on A, and finishes when the last line has
 * been read.
 */
export class Dialog extends Modal<void> {
  readonly opaque = false
  private readonly pages: string[][]
  private page = 0
  /** Index of the line on the top row. */
  private top = 0
  /** The line being printed (or last printed). */
  private line = 0
  private chars = 0
  private tick = 0
  private phase: Phase = 'print'
  private scrollT = 0
  private blink = 0
  private waited = 0

  constructor(
    text: string,
    private readonly o: DialogOptions,
  ) {
    super()
    this.pages = layoutDialog(text)
  }

  /** The text of the lines visible right now (for tests). */
  get visibleLines(): string[] {
    return this.pages[this.page].slice(this.top, this.top + 2)
  }

  private isLast(): boolean {
    return this.page === this.pages.length - 1 && this.line >= this.pages[this.page].length - 1
  }

  update(pad: Pad, top: boolean): void {
    this.blink++
    if (!top) return
    const lines = this.pages[this.page]
    const skip = pad.pressed('a') || pad.pressed('b')
    switch (this.phase) {
      case 'print': {
        const current = lines[this.line] ?? ''
        if (skip) {
          this.line = Math.min(lines.length - 1, this.top + 1)
          this.chars = (lines[this.line] ?? '').length
          this.phase = 'wait'
          this.waited = 0
        } else if (this.o.speed <= 0) {
          this.chars = current.length
        } else if (++this.tick >= this.o.speed || pad.held('a') || pad.held('b')) {
          this.tick = 0
          this.chars++
          if (current[this.chars - 1] && current[this.chars - 1] !== ' ') this.o.onChar?.()
        }
        if (this.phase === 'print' && this.chars >= current.length) {
          if (this.line < this.top + 1 && this.line < lines.length - 1) {
            this.line++
            this.chars = 0
          } else {
            this.phase = 'wait'
            this.waited = 0
          }
        }
        if (this.phase === 'wait' && this.o.hold && this.isLast()) this.finish()
        break
      }
      case 'wait': {
        this.waited++
        if (this.o.hold && this.isLast()) {
          this.finish()
          break
        }
        const auto = this.o.auto !== undefined && this.waited >= this.o.auto
        if (skip || auto) {
          if (skip) this.o.onAdvance?.()
          if (this.line < lines.length - 1) {
            this.phase = 'scroll'
            this.scrollT = 0
          } else if (this.page < this.pages.length - 1) {
            this.page++
            this.top = 0
            this.line = 0
            this.chars = 0
            this.phase = 'print'
          } else {
            this.phase = 'done'
            this.finish()
          }
        }
        break
      }
      case 'scroll':
        if (++this.scrollT >= 4) {
          this.top++
          this.line++
          this.chars = 0
          this.phase = 'print'
        }
        break
      case 'done':
        break
    }
  }

  draw(g: Gfx): void {
    drawBox(g)
    const lines = this.pages[this.page]
    const shift = this.phase === 'scroll' ? Math.round((this.scrollT / 4) * 16) : 0
    g.clip(TEXT_X, BOX_Y + 4, 144, BOX_H - 8)
    for (let row = 0; row < 3; row++) {
      const i = this.top + row
      if (i > this.line || i >= lines.length) break
      const text = i === this.line && this.phase === 'print' ? [...lines[i]].slice(0, this.chars).join('') : lines[i]
      g.text(text, TEXT_X, LINE_Y[0] + row * 16 - shift)
    }
    g.unclip()
    const showMore = this.phase === 'wait' && !(this.o.hold && this.isLast()) && this.o.auto === undefined
    if (showMore && Math.floor(this.blink / 20) % 2 === 0) g.text(CH.more, 148, BOX_Y + 36)
  }
}

export function drawBox(g: Gfx): void {
  g.window(0, BOX_Y, 160, BOX_H)
}

/** Static text in the text box (for menus that keep a prompt showing). */
export function drawBoxText(g: Gfx, text: string): void {
  drawBox(g)
  wrap(text, COLS)
    .slice(-2)
    .forEach((l, i) => g.text(l, TEXT_X, LINE_Y[i]))
}
