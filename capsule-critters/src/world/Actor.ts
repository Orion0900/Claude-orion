import type { Facing } from '../game/state'
import { DELTA, type Dir } from './terrain'

/** Frames to walk one cell, to run (or ride) one, and to hop a ledge. */
export const WALK_FRAMES = 16
export const RUN_FRAMES = 8
export const BIKE_FRAMES = 6
export const HOP_FRAMES = 32

/**
 * Anything that walks the grid: the player and every person or prop on a
 * map. It stands on a cell, and while stepping it slides toward the next one
 * a pixel or two a frame, flipping between walking frames.
 */
export class Actor {
  x: number
  y: number
  facing: Facing
  /** Pixel offset from the cell while moving. */
  ox = 0
  oy = 0
  /** Height off the ground while hopping. */
  lift = 0
  hidden = false
  swimming = false
  biking = false
  private move: { dx: number; dy: number; t: number; frames: number; cells: number; hop: boolean; done?: () => void } | null = null
  private bumpT = 0
  /** Counts steps, for the walk cycle. */
  private stepCount = 0
  private animT = 0

  constructor(x: number, y: number, facing: Facing = 'down') {
    this.x = x
    this.y = y
    this.facing = facing
  }

  get busy(): boolean {
    return this.move !== null
  }

  place(x: number, y: number, facing?: Facing): void {
    this.x = x
    this.y = y
    if (facing) this.facing = facing
    this.move = null
    this.ox = this.oy = this.lift = 0
  }

  /** Starts walking one cell; `done` runs once it arrives. */
  step(dir: Dir, frames: number, done?: () => void): void {
    this.facing = dir
    const d = DELTA[dir]
    this.x += d.dx
    this.y += d.dy
    this.ox = -d.dx * 16
    this.oy = -d.dy * 16
    this.move = { dx: d.dx, dy: d.dy, t: 0, frames, cells: 1, hop: false, done }
    this.stepCount++
  }

  /** Hops down a ledge: two cells in an arc. */
  hop(dir: Dir, done?: () => void): void {
    this.facing = dir
    const d = DELTA[dir]
    this.x += d.dx * 2
    this.y += d.dy * 2
    this.ox = -d.dx * 32
    this.oy = -d.dy * 32
    this.move = { dx: d.dx, dy: d.dy, t: 0, frames: HOP_FRAMES, cells: 2, hop: true, done }
    this.stepCount++
  }

  /** Walks on the spot against a wall. */
  bump(dir: Dir): void {
    this.facing = dir
    this.bumpT = 16
  }

  update(): void {
    this.animT++
    if (this.bumpT > 0) this.bumpT--
    const m = this.move
    if (!m) return
    m.t++
    const remain = 1 - m.t / m.frames
    this.ox = -m.dx * 16 * m.cells * remain
    this.oy = -m.dy * 16 * m.cells * remain
    if (m.hop) this.lift = Math.round(Math.sin((m.t / m.frames) * Math.PI) * 8)
    if (m.t >= m.frames) {
      this.ox = this.oy = this.lift = 0
      this.move = null
      m.done?.()
    }
  }

  /** Which sprite frame to show: 0 standing, 1 and 2 the two walking poses. */
  walkFrame(): 0 | 1 | 2 {
    const m = this.move
    if (m) {
      const half = m.t < m.frames / 2
      if (!half) return 0
      return this.stepCount % 2 ? 1 : 2
    }
    if (this.bumpT > 0) return this.bumpT > 8 ? (this.stepCount % 2 ? 1 : 2) : 0
    return 0
  }

  /** For idle animations (water bobbing). */
  get tick(): number {
    return this.animT
  }
}
