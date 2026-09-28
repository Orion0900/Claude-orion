/**
 * The pure half of input: which key means what, how held keys and a
 * thumbstick become a movement vector, and how pointer motion becomes look.
 */

export type KeyIntent = 'up' | 'down' | 'left' | 'right' | 'jump' | 'slide' | 'interact' | 'pause' | 'tab'

/** Physical keys (KeyboardEvent.code), so WASD sits in the same place on AZERTY. */
const KEYS: Readonly<Record<string, KeyIntent>> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'slide',
  ShiftRight: 'slide',
  ControlLeft: 'slide',
  ControlRight: 'slide',
  KeyE: 'interact',
  Escape: 'pause',
  KeyP: 'pause',
  Tab: 'tab',
}

/** Some browsers and virtual keyboards leave `code` empty; `key` is the fallback. */
const KEY_NAMES: Readonly<Record<string, KeyIntent>> = {
  ' ': 'jump',
  Shift: 'slide',
  Control: 'slide',
  Escape: 'pause',
  Tab: 'tab',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

export function keyIntent(code: string, key = ''): KeyIntent | null {
  return KEYS[code] ?? KEY_NAMES[key] ?? null
}

/** Intents that fire once per press; key repeat must not re-fire them. */
export function isOneShot(intent: KeyIntent): boolean {
  return intent === 'jump' || intent === 'interact' || intent === 'pause'
}

export interface Vec2 {
  x: number
  y: number
}

/** Held direction keys → movement (x = right, y = forward), diagonals normalised. */
export function moveFromKeys(up: boolean, down: boolean, left: boolean, right: boolean, out: Vec2): Vec2 {
  const x = (right ? 1 : 0) - (left ? 1 : 0)
  const y = (up ? 1 : 0) - (down ? 1 : 0)
  const len = Math.hypot(x, y)
  out.x = len > 0 ? x / len : 0
  out.y = len > 0 ? y / len : 0
  return out
}

/**
 * A floating thumbstick: `dx, dy` is the finger's offset in screen pixels
 * from where it touched down (y grows downwards). Returns movement with
 * length <= 1; the dead zone is rescaled away so small pushes still creep.
 */
export function joystickVector(dx: number, dy: number, radius: number, deadZone: number, out: Vec2): Vec2 {
  const len = Math.hypot(dx, dy)
  const mag = radius > 0 ? Math.min(1, len / radius) : 0
  if (!(mag > deadZone) || len === 0) {
    out.x = 0
    out.y = 0
    return out
  }
  const scaled = (mag - deadZone) / (1 - deadZone)
  out.x = (dx / len) * scaled
  out.y = (-dy / len) * scaled
  return out
}

/** Where to draw the knob: the finger's offset, held inside the ring. */
export function clampToRadius(dx: number, dy: number, radius: number, out: Vec2): Vec2 {
  const len = Math.hypot(dx, dy)
  const k = len > radius && len > 0 ? radius / len : 1
  out.x = dx * k
  out.y = dy * k
  return out
}

/** Radians per pixel of mouse motion at sensitivity 1. */
export const MOUSE_LOOK = 0.0022
/** Radians per pixel of touch drag at sensitivity 1. */
export const TOUCH_LOOK = 0.006
/** Pixels in one mouse event beyond which it's a glitch (pointer-lock spikes), not a flick. */
export const MAX_MOUSE_STEP = 500

/** Browsers sometimes report a huge bogus jump, often right around locking; those are dropped, not clamped. */
export function isMouseSpike(dx: number, dy: number): boolean {
  return !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > MAX_MOUSE_STEP || Math.abs(dy) > MAX_MOUSE_STEP
}

export interface Look {
  yaw: number
  pitch: number
}

/**
 * Adds pointer motion to a look delta. Positive yaw turns right; positive
 * pitch looks further down on the player (dragging down, unless inverted).
 */
export function addLook(dx: number, dy: number, radPerPixel: number, sensitivity: number, invertY: boolean, out: Look): Look {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return out
  const k = radPerPixel * (Number.isFinite(sensitivity) ? Math.max(0, sensitivity) : 1)
  out.yaw += dx * k
  out.pitch += dy * k * (invertY ? -1 : 1)
  return out
}
