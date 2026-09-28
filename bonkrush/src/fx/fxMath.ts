/**
 * The pure half of the effects system: easing curves, camera-shake trauma
 * and the floating-number pool with its merge policy. No DOM or WebGL, so
 * all of it runs under test.
 */

export type NumberKind = 'damage' | 'crit' | 'heal' | 'player' | 'gold' | 'xp' | 'info'

export const NUMBER_KINDS: readonly NumberKind[] = ['damage', 'crit', 'heal', 'player', 'gold', 'xp', 'info']

export interface NumberStyle {
  /** Font size in CSS pixels at the reference distance. */
  size: number
  fill: string
  stroke: string
  italic: boolean
  /** Seconds on screen. */
  life: number
  /** Metres it floats up over its life. */
  rise: number
}

export const NUMBER_STYLES: Record<NumberKind, NumberStyle> = {
  damage: { size: 20, fill: '#ffffff', stroke: '#221733', italic: false, life: 0.7, rise: 1.3 },
  crit: { size: 29, fill: '#ffd23f', stroke: '#5a2300', italic: false, life: 0.9, rise: 1.7 },
  heal: { size: 22, fill: '#6dff7a', stroke: '#0d3a16', italic: false, life: 0.9, rise: 1.4 },
  player: { size: 25, fill: '#ff4d5e', stroke: '#3a0710', italic: false, life: 0.9, rise: 1.2 },
  gold: { size: 20, fill: '#ffd23f', stroke: '#4a3000', italic: false, life: 0.8, rise: 1.3 },
  xp: { size: 18, fill: '#5ff3ff', stroke: '#0a2e3a', italic: false, life: 0.7, rise: 1.2 },
  info: { size: 22, fill: '#ffffff', stroke: '#221733', italic: true, life: 1.1, rise: 1.0 },
}

/** Kinds that show whatever the damage-number setting says. */
export function alwaysShown(kind: NumberKind): boolean {
  return kind === 'info' || kind === 'player'
}

// ───────────────────────────── easing ─────────────────────────────

export function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t)
  return 1 - u * u * u
}

export function easeOutQuad(t: number): number {
  const u = 1 - clamp01(t)
  return 1 - u * u
}

/** Full opacity until `start`, then a linear fade to zero at t = 1. */
export function fadeOut(t: number, start: number): number {
  if (t <= start) return 1
  return start >= 1 ? 0 : 1 - clamp01((t - start) / (1 - start))
}

/**
 * The spawn "pop" of a floating number: it bursts in from half size to
 * `peak`, then settles to 1 by `duration` seconds.
 */
export function popScale(age: number, duration = 0.18, peak = 1.55): number {
  if (!(age < duration)) return 1
  const grow = duration * 0.3
  if (age < grow) return 0.5 + (peak - 0.5) * easeOutQuad(age / grow)
  return peak + (1 - peak) * easeOutCubic((age - grow) / (duration - grow))
}

/** Particles hold their size, then shrink away at the end of their life. */
export function shrinkOut(t: number): number {
  const c = clamp01(t)
  return 1 - c * c * c
}

/** Ground rings shoot out fast and ease to their full radius. */
export function ringScale(t: number): number {
  return 0.12 + 0.88 * easeOutCubic(t)
}

export function ringAlpha(t: number): number {
  const c = clamp01(t)
  return 1 - c * c
}

/** Far numbers shrink and near ones grow a little, within limits that keep them readable. */
export function distanceScale(distance: number, reference = 11): number {
  if (!(distance > 0)) return 1.3
  return Math.min(1.3, Math.max(0.55, reference / distance))
}

// ───────────────────────────── shake ─────────────────────────────

/** Adds trauma from a hit; trauma lives in 0..1. */
export function addTrauma(trauma: number, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return trauma
  return Math.min(1, trauma + amount)
}

/** Trauma falls linearly, so a big hit shakes for about 1/rate seconds. */
export function decayTrauma(trauma: number, dt: number, rate = 1.6): number {
  if (!(dt > 0)) return trauma
  return Math.max(0, trauma - rate * dt)
}

/**
 * Shake displacement for a trauma level: squared, so small bumps stay subtle
 * and big hits really kick.
 */
export function shakeMagnitude(trauma: number, max: number): number {
  const t = clamp01(trauma)
  return t * t * max
}

/** Smooth pseudo-noise in [-1, 1]: three incommensurate sines, a different mix per seed. */
export function shakeNoise(time: number, seed: number): number {
  return (
    0.55 * Math.sin(time * 19.3 + seed) +
    0.3 * Math.sin(time * 33.7 + seed * 2.3) +
    0.15 * Math.sin(time * 57.1 + seed * 5.1)
  )
}

// ───────────────────────────── numbers ─────────────────────────────

/** A plain number ("12", "+3", "4.5"), or NaN for text like "DODGE". */
export function parseAmount(text: string): number {
  return /^\s*\+?\d+(\.\d+)?\s*$/.test(text) ? Number(text.replace('+', '')) : Number.NaN
}

/** Merged sums read as whole numbers, with one decimal only for small ones. */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value) >= 10 || Number.isInteger(value)) return String(Math.round(value))
  return value.toFixed(1).replace(/\.0$/, '')
}

/**
 * How a kind dresses plain numbers: crits shout, heals and pickups gain a
 * "+", damage to the player a "−". Anything else is shown as given.
 */
export function decorate(kind: NumberKind, text: string): string {
  const value = parseAmount(text)
  if (!Number.isFinite(value)) return text
  const plain = formatAmount(value)
  switch (kind) {
    case 'crit':
      return `${plain}!`
    case 'heal':
    case 'gold':
    case 'xp':
      return `+${plain}`
    case 'player':
      return `-${plain}`
    default:
      return plain
  }
}

/** Numbers of the same kind this young and this close add up instead of stacking. */
export const MERGE_WINDOW = 0.25
export const MERGE_DISTANCE = 1.0
/** Beyond this many new plain damage numbers in one frame, more are dropped. */
export const FRAME_BUDGET = 40

/**
 * Floating numbers in fixed parallel arrays. `spawn` merges a number into a
 * young one of the same kind nearby, and when the pool is full it recycles
 * the oldest, so a huge fight costs the same as a small one.
 */
export class NumberPool {
  readonly active: Uint8Array
  readonly kind: Uint8Array
  readonly x: Float32Array
  readonly y: Float32Array
  readonly z: Float32Array
  /** Seconds since spawn. */
  readonly age: Float32Array
  /** Seconds since the last pop (spawn or merge). */
  readonly pop: Float32Array
  readonly life: Float32Array
  /** Sideways drift, -1..1. */
  readonly drift: Float32Array
  /** The summed amount for mergeable numbers, NaN otherwise. */
  readonly value: Float64Array
  readonly text: string[]
  private live = 0
  private spawnedThisFrame = 0
  private cursor = 0

  constructor(
    readonly capacity = 200,
    private readonly random: () => number = Math.random,
  ) {
    this.active = new Uint8Array(capacity)
    this.kind = new Uint8Array(capacity)
    this.x = new Float32Array(capacity)
    this.y = new Float32Array(capacity)
    this.z = new Float32Array(capacity)
    this.age = new Float32Array(capacity)
    this.pop = new Float32Array(capacity)
    this.life = new Float32Array(capacity)
    this.drift = new Float32Array(capacity)
    this.value = new Float64Array(capacity)
    this.text = new Array<string>(capacity).fill('')
  }

  get count(): number {
    return this.live
  }

  /** Returns the slot used (new or merged into), or -1 if the number was dropped. */
  spawn(x: number, y: number, z: number, text: string, kind: NumberKind): number {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -1
    const k = NUMBER_KINDS.indexOf(kind)
    if (k < 0) return -1
    const amount = parseAmount(text)

    if (Number.isFinite(amount) && kind !== 'info') {
      const into = this.findMergeTarget(x, y, z, k)
      if (into >= 0) {
        this.value[into] += amount
        this.text[into] = decorate(kind, formatAmount(this.value[into]))
        this.pop[into] = 0
        return into
      }
    }

    if (kind === 'damage' && this.spawnedThisFrame >= FRAME_BUDGET) return -1
    this.spawnedThisFrame++

    const i = this.live < this.capacity ? this.freeSlot() : this.oldest()
    if (!this.active[i]) this.live++
    this.active[i] = 1
    this.kind[i] = k
    this.x[i] = x
    this.y[i] = y
    this.z[i] = z
    this.age[i] = 0
    this.pop[i] = 0
    this.life[i] = NUMBER_STYLES[kind].life
    this.drift[i] = this.random() * 2 - 1
    this.value[i] = amount
    this.text[i] = decorate(kind, text)
    return i
  }

  /** Ages every number, retires the finished ones and opens a new frame budget. */
  update(dt: number): void {
    this.spawnedThisFrame = 0
    if (!(dt > 0)) return
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue
      this.age[i] += dt
      this.pop[i] += dt
      if (this.age[i] >= this.life[i]) {
        this.active[i] = 0
        this.text[i] = ''
        this.live--
      }
    }
  }

  /** Life fraction 0..1 of a slot. */
  progress(i: number): number {
    return this.life[i] > 0 ? Math.min(1, this.age[i] / this.life[i]) : 1
  }

  clear(): void {
    this.active.fill(0)
    this.text.fill('')
    this.live = 0
    this.spawnedThisFrame = 0
  }

  private findMergeTarget(x: number, y: number, z: number, k: number): number {
    const r2 = MERGE_DISTANCE * MERGE_DISTANCE
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i] || this.kind[i] !== k || this.age[i] >= MERGE_WINDOW || !Number.isFinite(this.value[i])) continue
      const dx = this.x[i] - x
      const dy = this.y[i] - y
      const dz = this.z[i] - z
      if (dx * dx + dy * dy + dz * dz <= r2) return i
    }
    return -1
  }

  private freeSlot(): number {
    for (let n = 0; n < this.capacity; n++) {
      const i = (this.cursor + n) % this.capacity
      if (!this.active[i]) {
        this.cursor = (i + 1) % this.capacity
        return i
      }
    }
    return this.oldest()
  }

  /** The slot furthest through its life. */
  private oldest(): number {
    let best = 0
    let bestProgress = -1
    for (let i = 0; i < this.capacity; i++) {
      const p = this.progress(i)
      if (p > bestProgress) {
        best = i
        bestProgress = p
      }
    }
    return best
  }
}
