import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'

/**
 * One layer of the game: the overworld, a menu, a battle, a text box. Scenes
 * stack; only the top one gets real input, but every scene keeps updating so
 * water ripples and people keep walking behind an open text box.
 */
export interface Scene {
  /** Covers the whole screen, so the scenes beneath needn't be drawn. */
  readonly opaque: boolean
  update(pad: Pad, top: boolean): void
  draw(g: Gfx): void
  /** Called once when the scene is pushed. */
  enter?(): void
  /** Called once when the scene is removed. */
  exit?(): void
}

/**
 * A scene that finishes with a result, such as a menu choice. `Game.run`
 * pushes it and resolves with whatever it passes to `finish`.
 */
export abstract class Modal<T> implements Scene {
  abstract readonly opaque: boolean
  private resolver: ((v: T) => void) | null = null
  done = false

  /** Wired up by Game.run. */
  bind(resolve: (v: T) => void): void {
    this.resolver = resolve
  }

  protected finish(value: T): void {
    if (this.done) return
    this.done = true
    const r = this.resolver
    this.resolver = null
    r?.(value)
  }

  abstract update(pad: Pad, top: boolean): void
  abstract draw(g: Gfx): void
}
