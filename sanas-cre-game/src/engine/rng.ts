/**
 * A small seeded generator (mulberry32). Its whole state is one 32-bit
 * number, so it rides along in the save and a seed always replays the same
 * career.
 */
export class Rng {
  private s: number

  constructor(state: number) {
    this.s = state | 0
  }

  get state(): number {
    return this.s
  }

  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** Integer in [min, max], both ends included. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((sum, [, w]) => sum + Math.max(0, w), 0)
    let roll = this.next() * total
    for (const [item, w] of items) {
      roll -= Math.max(0, w)
      if (roll <= 0) return item
    }
    return items[items.length - 1][0]
  }

  /** Normally distributed, by Box-Muller. */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12)
    const v = this.next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
}
