import type { Facing, Look } from '../art/look'
import type { EmoteKind } from '../art/world'
import type { Dir } from './terrain'
import { DELTA } from './WorldMap'

export const TILE = 16
export const WALK_FRAMES = 16
export const RUN_FRAMES = 8
export const JUMP_FRAMES = 32

/**
 * Anyone standing on the grid: the player or a person on the map. Moves one
 * cell at a time, sliding smoothly between cells; the overworld decides
 * whether a step is allowed before calling `step`.
 */
export class Actor {
  x: number
  y: number
  facing: Facing
  /** Pixels still to travel toward (x, y) — the actor is drawn behind its cell by this much. */
  private remaining = 0
  private stepLen = WALK_FRAMES
  private stepT = 0
  /** Alternates the leading foot each step. */
  private foot: 1 | 2 = 1
  /** Ledge hop: covers two cells with an arc. */
  jumping = false
  private jumpT = 0
  /** Walking on the spot into a wall. */
  private bumpT = 0
  emote: { kind: EmoteKind; t: number } | null = null
  hidden = false
  surfing = false
  /** A hook for when the current step finishes. */
  private onArrive: (() => void) | null = null

  constructor(
    readonly id: string,
    x: number,
    y: number,
    facing: Facing,
    public look: Look,
  ) {
    this.x = x
    this.y = y
    this.facing = facing
  }

  get moving(): boolean {
    return this.remaining > 0
  }

  get busy(): boolean {
    return this.moving || this.bumpT > 0
  }

  /**
   * Starts a step in `dir`. The actor's cell changes now; the sprite slides
   * there over the next frames. `frames` is 16 walking and 8 running.
   */
  step(dir: Dir, frames = WALK_FRAMES, onArrive?: () => void): void {
    const d = DELTA[dir]
    this.facing = dir
    this.x += d.dx
    this.y += d.dy
    this.stepLen = frames
    this.stepT = 0
    this.remaining = TILE
    this.jumping = false
    this.foot = this.foot === 1 ? 2 : 1
    this.onArrive = onArrive ?? null
  }

  /** Hops a ledge: two cells in `dir` with a jump arc. */
  hop(dir: Dir, onArrive?: () => void): void {
    const d = DELTA[dir]
    this.facing = dir
    this.x += d.dx * 2
    this.y += d.dy * 2
    this.stepLen = JUMP_FRAMES
    this.stepT = 0
    this.remaining = TILE * 2
    this.jumping = true
    this.jumpT = 0
    this.onArrive = onArrive ?? null
  }

  /** Walks on the spot facing `dir` (blocked). */
  bump(dir: Dir): void {
    this.facing = dir
    if (this.bumpT <= 0) {
      this.bumpT = WALK_FRAMES
      this.foot = this.foot === 1 ? 2 : 1
    }
  }

  /** Jumps straight to a cell (warps, script placement). */
  place(x: number, y: number, facing?: Facing): void {
    this.x = x
    this.y = y
    if (facing) this.facing = facing
    this.remaining = 0
    this.jumping = false
    this.bumpT = 0
    this.onArrive = null
  }

  update(): void {
    if (this.emote) {
      this.emote.t++
      if (this.emote.t > 60) this.emote = null
    }
    if (this.bumpT > 0) this.bumpT--
    if (this.remaining <= 0) return
    this.stepT++
    const total = this.jumping ? TILE * 2 : TILE
    this.remaining = Math.max(0, Math.round(total - (total * this.stepT) / this.stepLen))
    if (this.jumping) this.jumpT++
    if (this.remaining <= 0) {
      this.jumping = false
      const f = this.onArrive
      this.onArrive = null
      f?.()
    }
  }

  /** Pixel offset of the sprite from its cell (it trails behind while moving). */
  offset(): { dx: number; dy: number } {
    if (this.remaining <= 0) return { dx: 0, dy: 0 }
    const d = DELTA[this.facing]
    return { dx: -d.dx * this.remaining, dy: -d.dy * this.remaining }
  }

  /** Height of the ledge-hop arc in pixels. */
  lift(): number {
    if (!this.jumping) return 0
    const t = this.jumpT / JUMP_FRAMES
    return Math.round(Math.sin(Math.PI * Math.min(1, t)) * 10)
  }

  /** Which walk frame to draw: 0 standing, 1/2 a foot forward. */
  frame(): 0 | 1 | 2 {
    if (this.jumping) return 0
    if (this.remaining > 0) {
      const t = this.stepT / this.stepLen
      return t > 0.2 && t < 0.8 ? this.foot : 0
    }
    if (this.bumpT > 0) {
      const t = 1 - this.bumpT / WALK_FRAMES
      return t > 0.2 && t < 0.8 ? this.foot : 0
    }
    return 0
  }
}
