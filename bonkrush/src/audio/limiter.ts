import type { SfxId } from '../game/types'

/** How often, how many at once and how important one sound effect is. */
export interface SfxRule {
  /** Starts per second, refilled continuously. */
  rate: number
  /** Starts allowed back to back before `rate` applies. */
  burst: number
  /** Voices of this id sounding at once; a new start cuts the oldest. */
  voices: number
  /** With every voice busy, a sound may only cut voices of equal or lower priority. */
  priority: number
  /** Seconds the sound rings, so its voice slot frees itself afterwards. */
  length: number
  /** Random pitch spread (± fraction) so a stream of repeats doesn't sound machine-gunned. */
  vary: number
}

/**
 * Tuned so a 300-enemy horde reads as a crunchy rhythm rather than a wall of
 * noise: hit sounds are rate-capped hard, rewards and UI win any contest for
 * a voice, and the long one-shots can't restart on top of themselves.
 */
export const SFX_RULES: Record<SfxId, SfxRule> = {
  bonk: { rate: 25, burst: 3, voices: 6, priority: 2, length: 0.2, vary: 0.08 },
  crit: { rate: 12, burst: 2, voices: 4, priority: 3, length: 0.32, vary: 0.05 },
  kill: { rate: 18, burst: 3, voices: 5, priority: 2, length: 0.16, vary: 0.1 },
  shoot: { rate: 14, burst: 2, voices: 4, priority: 1, length: 0.15, vary: 0.06 },
  swing: { rate: 10, burst: 2, voices: 3, priority: 1, length: 0.22, vary: 0.08 },
  zap: { rate: 10, burst: 2, voices: 3, priority: 1, length: 0.26, vary: 0.1 },
  fire: { rate: 8, burst: 2, voices: 3, priority: 1, length: 0.4, vary: 0.08 },
  explode: { rate: 8, burst: 2, voices: 4, priority: 3, length: 0.7, vary: 0.1 },
  xp: { rate: 20, burst: 2, voices: 4, priority: 1, length: 0.1, vary: 0.012 },
  gold: { rate: 12, burst: 2, voices: 3, priority: 2, length: 0.34, vary: 0.02 },
  heal: { rate: 4, burst: 1, voices: 2, priority: 3, length: 0.45, vary: 0.03 },
  levelUp: { rate: 2, burst: 1, voices: 1, priority: 6, length: 1.0, vary: 0 },
  chest: { rate: 2, burst: 1, voices: 1, priority: 6, length: 0.9, vary: 0 },
  rarity: { rate: 2, burst: 1, voices: 1, priority: 6, length: 1.1, vary: 0 },
  hurt: { rate: 6, burst: 1, voices: 2, priority: 5, length: 0.26, vary: 0.06 },
  jump: { rate: 8, burst: 2, voices: 2, priority: 4, length: 0.2, vary: 0.04 },
  land: { rate: 6, burst: 1, voices: 2, priority: 3, length: 0.2, vary: 0.08 },
  slide: { rate: 3, burst: 1, voices: 1, priority: 3, length: 0.36, vary: 0.05 },
  shrine: { rate: 2, burst: 1, voices: 1, priority: 5, length: 1.1, vary: 0 },
  bossRoar: { rate: 1, burst: 1, voices: 1, priority: 6, length: 1.6, vary: 0.03 },
  portal: { rate: 2, burst: 1, voices: 1, priority: 6, length: 1.25, vary: 0 },
  uiMove: { rate: 25, burst: 2, voices: 2, priority: 7, length: 0.05, vary: 0 },
  uiSelect: { rate: 8, burst: 2, voices: 2, priority: 7, length: 0.22, vary: 0 },
  death: { rate: 1, burst: 1, voices: 1, priority: 8, length: 1.9, vary: 0 },
  victory: { rate: 1, burst: 1, voices: 1, priority: 8, length: 2.1, vary: 0 },
}

/**
 * Decides which sound effects actually start. Each id has a token bucket
 * (rate + burst) and a voice cap where the newest start cuts the oldest;
 * all ids share a global voice cap where a start may cut the oldest voice of
 * equal or lower priority, or is dropped. Times are the audio clock's seconds.
 *
 * Allocation-free: voices live in parallel arrays and cut voices are reported
 * through the reused `stolen` list.
 */
export class VoiceLimiter {
  /** Handles of the voices the last `request` cut; the engine fades them out. */
  readonly stolen: number[] = []
  private readonly handles: Int32Array
  private readonly ids: string[]
  private readonly starts: Float64Array
  private readonly ends: Float64Array
  private readonly priorities: Float64Array
  private count = 0
  private nextHandle = 1
  private readonly buckets = new Map<string, { tokens: number; last: number }>()

  constructor(
    private readonly rules: Readonly<Record<string, SfxRule>>,
    readonly maxVoices = 32,
  ) {
    this.handles = new Int32Array(maxVoices)
    this.ids = new Array<string>(maxVoices).fill('')
    this.starts = new Float64Array(maxVoices)
    this.ends = new Float64Array(maxVoices)
    this.priorities = new Float64Array(maxVoices)
  }

  /** Voices still sounding at the time of the last request or prune. */
  get active(): number {
    return this.count
  }

  /** Voices of one id still sounding. */
  activeOf(id: string): number {
    let n = 0
    for (let i = 0; i < this.count; i++) if (this.ids[i] === id) n++
    return n
  }

  /** Returns a voice handle (> 0) if `id` may start at `now`, or 0 if it is dropped. */
  request(id: string, now: number): number {
    this.stolen.length = 0
    const rule = this.rules[id]
    if (!rule || !Number.isFinite(now)) return 0
    this.prune(now)

    let bucket = this.buckets.get(id)
    if (!bucket) {
      bucket = { tokens: rule.burst, last: now }
      this.buckets.set(id, bucket)
    }
    bucket.tokens = Math.min(rule.burst, bucket.tokens + Math.max(0, now - bucket.last) * rule.rate)
    bucket.last = now
    if (bucket.tokens < 1) return 0

    if (this.activeOf(id) >= rule.voices) {
      this.steal(this.oldest(id, Infinity))
    } else if (this.count >= this.maxVoices) {
      const victim = this.oldest(null, rule.priority)
      if (victim < 0) return 0
      this.steal(victim)
    }

    bucket.tokens -= 1
    const i = this.count++
    const handle = this.nextHandle++
    this.handles[i] = handle
    this.ids[i] = id
    this.starts[i] = now
    this.ends[i] = now + rule.length
    this.priorities[i] = rule.priority
    return handle
  }

  /** Frees the slots of voices that have finished ringing. */
  prune(now: number): void {
    for (let i = 0; i < this.count; ) {
      if (this.ends[i] <= now) this.removeAt(i)
      else i++
    }
  }

  /** Forgets every voice (the engine silenced them all). */
  reset(): void {
    this.count = 0
    this.stolen.length = 0
  }

  /**
   * The slot to cut: the lowest priority first, then the oldest. With `id`
   * set only that id's voices are candidates.
   */
  private oldest(id: string | null, maxPriority: number): number {
    let best = -1
    for (let i = 0; i < this.count; i++) {
      if (id !== null && this.ids[i] !== id) continue
      if (this.priorities[i] > maxPriority) continue
      if (
        best < 0 ||
        this.priorities[i] < this.priorities[best] ||
        (this.priorities[i] === this.priorities[best] && this.starts[i] < this.starts[best])
      )
        best = i
    }
    return best
  }

  private steal(i: number): void {
    if (i < 0) return
    this.stolen.push(this.handles[i])
    this.removeAt(i)
  }

  private removeAt(i: number): void {
    const last = --this.count
    if (i === last) return
    this.handles[i] = this.handles[last]
    this.ids[i] = this.ids[last]
    this.starts[i] = this.starts[last]
    this.ends[i] = this.ends[last]
    this.priorities[i] = this.priorities[last]
  }
}
