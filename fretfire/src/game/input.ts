import { laneAtPoint, type Layout } from '../render/layout'
import type { InputScheme } from './session'

/**
 * Turns touches, keys and game controllers into lane presses, strums and
 * star power, each stamped with the time the event actually happened (not
 * when the code got round to it), so judging is as fair as the hardware.
 */

export interface InputSink {
  press(lane: number, ms: number): void
  release(lane: number, ms: number): void
  strum(ms: number): void
  star(ms: number): void
  pause(): void
}

export interface InputOptions {
  scheme: InputScheme
  lefty: boolean
  flick: boolean
}

const LANE_KEYS: Record<string, number> = {
  KeyA: 0,
  KeyS: 1,
  KeyD: 2,
  KeyF: 3,
  KeyG: 4,
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  F1: 0,
  F2: 1,
  F3: 2,
  F4: 3,
  F5: 4,
}
const STRUM_KEYS = new Set(['Enter', 'NumpadEnter', 'Space', 'ArrowUp', 'ArrowDown'])
const STAR_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'KeyE', 'Backspace'])
const PAUSE_KEYS = new Set(['Escape', 'KeyP'])

/** Standard gamepad buttons: A B X Y LB as frets (guitar controllers use the same). */
const PAD_FRETS: [number, number][] = [
  [0, 0],
  [1, 1],
  [3, 2],
  [2, 3],
  [4, 4],
]
const PAD_STRUM = [12, 13]
const PAD_STAR = [5, 8]
const PAD_PAUSE = 9
/** Rotation, in degrees per second, that counts as flicking the phone up. */
const FLICK_RATE = 320

/** A usable event time: modern browsers stamp events on the performance.now() clock. */
export function eventTime(e: Event): number {
  const now = performance.now()
  const t = e.timeStamp
  return Number.isFinite(t) && t > 0 && t <= now + 50 && t > now - 1000 ? t : now
}

export class InputController {
  private readonly touches = new Map<number, number>()
  private readonly keys = new Map<string, number>()
  private readonly pads = new Map<number, boolean[]>()
  private lastFlick = 0
  private attached = false

  constructor(
    private readonly el: HTMLElement,
    private readonly layout: () => Layout,
    private readonly options: InputOptions,
    private readonly sink: InputSink,
  ) {}

  attach(): void {
    if (this.attached) return
    this.attached = true
    this.el.addEventListener('touchstart', this.onTouchStart, { passive: false })
    this.el.addEventListener('touchend', this.onTouchEnd, { passive: false })
    this.el.addEventListener('touchcancel', this.onTouchEnd, { passive: false })
    this.el.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    if (this.options.flick) window.addEventListener('devicemotion', this.onMotion)
  }

  detach(): void {
    if (!this.attached) return
    this.attached = false
    this.el.removeEventListener('touchstart', this.onTouchStart)
    this.el.removeEventListener('touchend', this.onTouchEnd)
    this.el.removeEventListener('touchcancel', this.onTouchEnd)
    this.el.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('devicemotion', this.onMotion)
    this.releaseAll(performance.now())
  }

  /** Lets go of everything held, e.g. when the game pauses. */
  releaseAll(ms: number): void {
    for (const lane of this.touches.values()) if (lane >= 0) this.sink.release(lane, ms)
    for (const lane of this.keys.values()) this.sink.release(lane, ms)
    for (const [index, state] of this.pads) {
      PAD_FRETS.forEach(([button, lane]) => {
        if (state[button]) this.sink.release(lane, ms)
      })
      this.pads.set(index, [])
    }
    this.touches.clear()
    this.keys.clear()
  }

  /** Gamepads have no events; call once per frame. */
  pollGamepads(): void {
    if (typeof navigator.getGamepads !== 'function') return
    const now = performance.now()
    for (const pad of navigator.getGamepads()) {
      if (!pad || !pad.connected) continue
      const prev = this.pads.get(pad.index) ?? []
      const next = pad.buttons.map((b) => b.pressed)
      const edge = (button: number) => next[button] && !prev[button]
      for (const [button, lane] of PAD_FRETS) {
        if (edge(button)) this.sink.press(this.lane(lane), now)
        else if (!next[button] && prev[button]) this.sink.release(this.lane(lane), now)
      }
      if (PAD_STRUM.some(edge)) this.sink.strum(now)
      if (PAD_STAR.some(edge)) this.sink.star(now)
      if (edge(PAD_PAUSE)) this.sink.pause()
      this.pads.set(pad.index, next)
    }
  }

  /** Mirrors lanes for left-handed players. */
  private lane(lane: number): number {
    return this.options.lefty ? 4 - lane : lane
  }

  private touchDown(id: number, x: number, y: number, ms: number): void {
    const layout = this.layout()
    const column = laneAtPoint(layout, x, y)
    const lane = this.lane(column)
    if (this.options.scheme === 'guitar' && y < layout.fretTop) {
      this.touches.set(id, -1)
      this.sink.strum(ms)
      return
    }
    this.touches.set(id, lane)
    this.sink.press(lane, ms)
  }

  private touchUp(id: number, ms: number): void {
    const lane = this.touches.get(id)
    this.touches.delete(id)
    if (lane !== undefined && lane >= 0) this.sink.release(lane, ms)
  }

  private readonly onTouchStart = (e: TouchEvent) => {
    e.preventDefault()
    const ms = eventTime(e)
    const rect = this.el.getBoundingClientRect()
    for (const t of Array.from(e.changedTouches)) this.touchDown(t.identifier, t.clientX - rect.left, t.clientY - rect.top, ms)
  }

  private readonly onTouchEnd = (e: TouchEvent) => {
    e.preventDefault()
    const ms = eventTime(e)
    for (const t of Array.from(e.changedTouches)) this.touchUp(t.identifier, ms)
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    // Touch arrives through the touch events; this is for mice and pens.
    if (e.pointerType === 'touch') return
    const rect = this.el.getBoundingClientRect()
    this.touchDown(-1 - e.pointerId, e.clientX - rect.left, e.clientY - rect.top, eventTime(e))
  }

  private readonly onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    this.touchUp(-1 - e.pointerId, eventTime(e))
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const ms = eventTime(e)
    if (PAUSE_KEYS.has(e.code)) {
      e.preventDefault()
      if (!e.repeat) this.sink.pause()
      return
    }
    const lane = LANE_KEYS[e.code]
    if (lane !== undefined) {
      e.preventDefault()
      if (e.repeat || this.keys.has(e.code)) return
      const mapped = this.lane(lane)
      this.keys.set(e.code, mapped)
      this.sink.press(mapped, ms)
      return
    }
    if (STRUM_KEYS.has(e.code)) {
      e.preventDefault()
      if (!e.repeat) this.sink.strum(ms)
      return
    }
    if (STAR_KEYS.has(e.code)) {
      e.preventDefault()
      if (!e.repeat) this.sink.star(ms)
    }
  }

  private readonly onKeyUp = (e: KeyboardEvent) => {
    const lane = this.keys.get(e.code)
    if (lane === undefined) return
    this.keys.delete(e.code)
    this.sink.release(lane, eventTime(e))
  }

  private readonly onMotion = (e: DeviceMotionEvent) => {
    const r = e.rotationRate
    if (!r) return
    const rate = Math.max(Math.abs(r.alpha ?? 0), Math.abs(r.beta ?? 0), Math.abs(r.gamma ?? 0))
    const now = performance.now()
    if (rate > FLICK_RATE && now - this.lastFlick > 1200) {
      this.lastFlick = now
      this.sink.star(now)
    }
  }
}
