import { CH, measure, wrap } from './font'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { Modal } from '../game/scene'

export const BOX_Y = 112
export const BOX_H = 48
const TEXT_X = 10
const LINE_Y = [BOX_Y + 7, BOX_Y + 23]
const TEXT_W = 218

/**
 * Breaks dialog into boxes of lines. '\f' starts a fresh box; within a box
 * the lines scroll up one at a time, as handheld text does.
 */
export function layoutDialog(text: string): string[][] {
  return text.split('\f').map((page) => wrap(page, TEXT_W))
}

export interface DialogOptions {
  /** Frames per character: 0 prints instantly. */
  speed: number
  /** Leave the last box on screen and finish as soon as it has printed (a question follows). */
  hold?: boolean
  /** Called for each printed character, to blip. */
  onChar?: () => void
  /** Called when a page is advanced with A or B. */
  onAdvance?: () => void
}

type Phase = 'print' | 'wait' | 'scroll' | 'done'

/**
 * The text box at the bottom of the screen. Prints a character at a time,
 * shows the blinking ▼ when a line is full, scrolls up a line on A, and
 * finishes when the last line has been read.
 */
export class Dialog extends Modal<void> {
  readonly opaque = false
  private readonly pages: string[][]
  private page = 0
  /** Index of the line shown on the top row. */
  private top = 0
  /** Lines of the current page fully shown so far (within the window). */
  private line = 0
  private chars = 0
  private tick = 0
  private phase: Phase = 'print'
  private scrollT = 0
  private blink = 0

  constructor(
    text: string,
    private readonly o: DialogOptions,
  ) {
    super()
    this.pages = layoutDialog(text)
  }

  /** The full text of the lines visible right now, for tests and the hold mode. */
  get visibleLines(): string[] {
    return this.pages[this.page].slice(this.top, this.top + 2)
  }

  update(pad: Pad, top: boolean): void {
    this.blink++
    if (!top) return
    const lines = this.pages[this.page]
    const skip = pad.pressed('a') || pad.pressed('b')
    switch (this.phase) {
      case 'print': {
        if (skip) {
          // Finish the visible lines at once.
          this.line = Math.min(lines.length - 1, this.top + 1)
          this.chars = (lines[this.line] ?? '').length
          this.phase = 'wait'
          if (this.o.hold && this.isLast()) this.finish()
          break
        }
        const current = lines[this.line] ?? ''
        if (this.o.speed <= 0) {
          this.chars = current.length
        } else if (++this.tick >= this.o.speed || pad.held('a') || pad.held('b')) {
          this.tick = 0
          this.chars++
          if (current[this.chars - 1] && current[this.chars - 1] !== ' ') this.o.onChar?.()
        }
        if (this.chars >= current.length) {
          if (this.line < this.top + 1 && this.line < lines.length - 1) {
            this.line++
            this.chars = 0
          } else this.phase = 'wait'
        }
        if (this.phase === 'wait' && this.o.hold && this.isLast()) this.finish()
        break
      }
      case 'wait':
        if (this.o.hold && this.isLast()) {
          this.finish()
          break
        }
        if (skip) {
          this.o.onAdvance?.()
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

  private isLast(): boolean {
    return this.page === this.pages.length - 1 && this.line >= this.pages[this.page].length - 1
  }

  draw(g: Gfx): void {
    drawBox(g)
    const lines = this.pages[this.page]
    const shift = this.phase === 'scroll' ? Math.round((this.scrollT / 4) * 16) : 0
    g.clip(TEXT_X - 2, BOX_Y + 5, 224, 38)
    for (let row = 0; row < 3; row++) {
      const i = this.top + row
      if (i > this.line || i >= lines.length) break
      const text = i === this.line && this.phase === 'print' ? lines[i].slice(0, this.chars) : lines[i]
      g.text(text, TEXT_X, LINE_Y[0] + row * 16 - shift)
    }
    g.unclip()
    if (this.phase === 'wait' && !(this.o.hold && this.isLast()) && Math.floor(this.blink / 16) % 2 === 0) {
      const last = lines[this.line] ?? ''
      const row = this.line - this.top
      const x = Math.min(TEXT_X + measure(last) + 3, 226)
      g.text(CH.more, x, LINE_Y[Math.max(0, Math.min(1, row))] + 2, { shadow: null, color: '#e04848' })
    }
  }
}

export function drawBox(g: Gfx): void {
  g.window(0, BOX_Y, 240, BOX_H)
}

/** Draws static text in the dialog box (for menus that keep a prompt showing). */
export function drawBoxText(g: Gfx, text: string): void {
  drawBox(g)
  wrap(text, TEXT_W)
    .slice(-2)
    .forEach((l, i) => g.text(l, TEXT_X, LINE_Y[i]))
}
