import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { Modal } from '../game/scene'

export type WipeKind = 'bars' | 'spiral' | 'blinds'

/**
 * The cut into battle: two white flashes, then the screen is eaten by black
 * — sliding bars for wild beasts, a spiral of blocks for trainers.
 */
export class Wipe extends Modal<void> {
  readonly opaque = false
  private t = 0
  private readonly spiral: { x: number; y: number }[] = []

  constructor(
    private readonly kind: WipeKind,
    private readonly frames = 44,
  ) {
    super()
    if (kind === 'spiral') {
      // Blocks of 16 px in spiral order from the edge inward.
      const cols = 15
      const rows = 10
      let x0 = 0
      let y0 = 0
      let x1 = cols - 1
      let y1 = rows - 1
      while (x0 <= x1 && y0 <= y1) {
        for (let x = x0; x <= x1; x++) this.spiral.push({ x, y: y0 })
        for (let y = y0 + 1; y <= y1; y++) this.spiral.push({ x: x1, y })
        if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) this.spiral.push({ x, y: y1 })
        if (x0 < x1) for (let y = y1 - 1; y > y0; y--) this.spiral.push({ x: x0, y })
        x0++
        y0++
        x1--
        y1--
      }
    }
  }

  private readonly flashFrames = 20

  update(_pad: Pad, _top: boolean): void {
    this.t++
    if (this.t >= this.flashFrames + this.frames + 4) this.finish()
  }

  draw(g: Gfx): void {
    if (this.t < this.flashFrames) {
      const phase = Math.floor(this.t / 5) % 2
      if (phase === 0) g.overlay('#ffffff', 0.85)
      return
    }
    const p = Math.min(1, (this.t - this.flashFrames) / this.frames)
    if (this.kind === 'bars') {
      const bars = 10
      for (let i = 0; i < bars; i++) {
        const w = Math.round(240 * Math.min(1, p * 1.3 - (i % 2) * 0.15))
        if (w <= 0) continue
        const y = i * 16
        if (i % 2 === 0) g.rect(0, y, w, 16, '#000')
        else g.rect(240 - w, y, w, 16, '#000')
      }
    } else if (this.kind === 'spiral') {
      const n = Math.round(this.spiral.length * p)
      for (let i = 0; i < n; i++) g.rect(this.spiral[i].x * 16, this.spiral[i].y * 16, 16, 16, '#000')
    } else {
      for (let x = 0; x < 240; x += 16) g.rect(x, 0, Math.round(16 * p), 160, '#000')
    }
  }
}
