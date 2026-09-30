/**
 * Seeded random numbers. Every roll in a run goes through one of these, so a
 * run can be replayed from its seed and tests can pin exact outcomes.
 * mulberry32: tiny, fast, and good enough for games.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** Integer in [min, max], both ends included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on an empty list')
    return items[Math.floor(this.next() * items.length)]
  }

  /** Picks by weight; entries with weight <= 0 are never chosen. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0
    for (const item of items) total += Math.max(0, weight(item))
    if (total <= 0) throw new Error('Rng.weighted with no positive weights')
    let roll = this.next() * total
    for (const item of items) {
      const w = Math.max(0, weight(item))
      if (roll < w) return item
      roll -= w
    }
    // Floating point can leave a sliver at the end; the last positive entry owns it.
    for (let i = items.length - 1; i >= 0; i--) if (weight(items[i]) > 0) return items[i]
    throw new Error('unreachable')
  }

  /** Fisher–Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  }

  /** An independent stream, so one system's rolls don't shift another's. */
  fork(salt: number): Rng {
    return new Rng((this.state ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0)
  }
}
