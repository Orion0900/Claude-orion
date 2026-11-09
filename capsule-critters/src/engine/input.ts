/**
 * The eight handheld buttons, fed by keyboard, gamepad and the on-screen pad.
 * The game only ever sees buttons, never keys, so every control scheme drives
 * it the same way. Sampled once per 60 Hz tick.
 */
export const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'] as const
export type Button = (typeof BUTTONS)[number]

export const DIRS = ['up', 'down', 'left', 'right'] as const

/** What one tick of play sees. */
export interface Pad {
  /** Held right now. */
  held(b: Button): boolean
  /** Went down this tick. */
  pressed(b: Button): boolean
  /**
   * Went down this tick, or has been held long enough to auto-repeat — for
   * scrolling through menus.
   */
  repeat(b: Button): boolean
  /** Ticks this button has been held (0 when up). */
  heldFor(b: Button): number
  /** The most recently pressed direction that is still held, if any. */
  dir(): (typeof DIRS)[number] | null
}

/** A pad that never has anything pressed: given to scenes that aren't on top. */
export const IDLE_PAD: Pad = {
  held: () => false,
  pressed: () => false,
  repeat: () => false,
  heldFor: () => 0,
  dir: () => null,
}

const REPEAT_DELAY = 18
const REPEAT_EVERY = 5

/**
 * Collects raw button state from any number of sources and turns it into a
 * per-tick Pad. Sources call `set(button, down, source)`; a button is held
 * while any source holds it.
 */
export class InputHub implements Pad {
  private readonly sources = new Map<string, Set<Button>>()
  private readonly ticks = new Map<Button, number>()
  /** Presses since the last tick, so a tap shorter than a frame still counts. */
  private readonly latched = new Set<Button>()
  private readonly order: Button[] = []
  /** Called on the first press of anything: browsers only allow audio after a gesture. */
  onFirstInput: (() => void) | null = null

  set(b: Button, down: boolean, source: string): void {
    let s = this.sources.get(source)
    if (!s) this.sources.set(source, (s = new Set()))
    if (down) {
      if (!s.has(b)) this.latched.add(b)
      s.add(b)
      if (this.onFirstInput) {
        const f = this.onFirstInput
        this.onFirstInput = null
        f()
      }
    } else s.delete(b)
  }

  /** Releases everything a source holds (window blur, gamepad unplugged). */
  clear(source?: string): void {
    if (source) this.sources.get(source)?.clear()
    else for (const s of this.sources.values()) s.clear()
  }

  private rawHeld(b: Button): boolean {
    for (const s of this.sources.values()) if (s.has(b)) return true
    return false
  }

  /** Advances one tick: call once per update, before the game reads the pad. */
  tick(): void {
    for (const b of BUTTONS) {
      if (this.rawHeld(b) || this.latched.has(b)) {
        const t = (this.ticks.get(b) ?? 0) + 1
        this.ticks.set(b, t)
        if (t === 1 && (DIRS as readonly string[]).includes(b)) {
          const i = this.order.indexOf(b)
          if (i >= 0) this.order.splice(i, 1)
          this.order.push(b)
        }
      } else {
        this.ticks.set(b, 0)
        const i = this.order.indexOf(b)
        if (i >= 0) this.order.splice(i, 1)
      }
    }
    this.latched.clear()
  }

  held(b: Button): boolean {
    return (this.ticks.get(b) ?? 0) > 0
  }

  pressed(b: Button): boolean {
    return this.ticks.get(b) === 1
  }

  repeat(b: Button): boolean {
    const t = this.ticks.get(b) ?? 0
    return t === 1 || (t > REPEAT_DELAY && (t - REPEAT_DELAY) % REPEAT_EVERY === 0)
  }

  heldFor(b: Button): number {
    return this.ticks.get(b) ?? 0
  }

  dir(): (typeof DIRS)[number] | null {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const b = this.order[i]
      if (this.held(b)) return b as (typeof DIRS)[number]
    }
    return null
  }
}

const KEYMAP: Record<string, Button> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyZ: 'a',
  Space: 'a',
  Enter: 'a',
  NumpadEnter: 'a',
  KeyJ: 'a',
  KeyX: 'b',
  Backspace: 'b',
  ShiftLeft: 'b',
  ShiftRight: 'b',
  KeyK: 'b',
  Escape: 'start',
  KeyM: 'start',
  KeyP: 'start',
  KeyC: 'select',
  Tab: 'select',
}

export function bindKeyboard(hub: InputHub, target: Window = window): void {
  target.addEventListener('keydown', (e) => {
    const b = KEYMAP[e.code]
    if (!b) return
    e.preventDefault()
    if (!e.repeat) hub.set(b, true, 'keyboard')
  })
  target.addEventListener('keyup', (e) => {
    const b = KEYMAP[e.code]
    if (!b) return
    e.preventDefault()
    hub.set(b, false, 'keyboard')
  })
  target.addEventListener('blur', () => hub.clear())
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hub.clear()
  })
}

/** Standard-mapping gamepads, polled each tick. */
export function pollGamepads(hub: InputHub): void {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
  const down = new Set<Button>()
  for (const gp of pads) {
    if (!gp || !gp.connected) continue
    const btn = (i: number) => !!gp.buttons[i]?.pressed
    if (btn(0)) down.add('a')
    if (btn(1)) down.add('b')
    if (btn(2)) down.add('b')
    if (btn(3)) down.add('a')
    if (btn(9)) down.add('start')
    if (btn(8)) down.add('select')
    if (btn(12)) down.add('up')
    if (btn(13)) down.add('down')
    if (btn(14)) down.add('left')
    if (btn(15)) down.add('right')
    const [ax = 0, ay = 0] = gp.axes
    if (ax < -0.5) down.add('left')
    if (ax > 0.5) down.add('right')
    if (ay < -0.5) down.add('up')
    if (ay > 0.5) down.add('down')
  }
  for (const b of BUTTONS) hub.set(b, down.has(b), 'gamepad')
}
