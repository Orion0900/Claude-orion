import { Rng } from '../core/rng'

/**
 * Seeded 2D gradient noise (classic Perlin). Values stay within [-1, 1] and
 * are continuous, so heights built from it never jump.
 */
export class Noise2D {
  private readonly perm = new Uint8Array(512)
  /** Per-instance offset so lattice zeros don't all sit on the origin. */
  private readonly ox: number
  private readonly oy: number

  constructor(seed: number) {
    const rng = new Rng(seed)
    const p: number[] = []
    for (let i = 0; i < 256; i++) p.push(i)
    rng.shuffle(p)
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
    this.ox = rng.range(0, 256)
    this.oy = rng.range(0, 256)
  }

  noise(x: number, y: number): number {
    x += this.ox
    y += this.oy
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const X = xi & 255
    const Y = yi & 255
    const p = this.perm
    const aa = p[p[X] + Y]
    const ab = p[p[X] + Y + 1]
    const ba = p[p[X + 1] + Y]
    const bb = p[p[X + 1] + Y + 1]
    const u = fade(xf)
    const v = fade(yf)
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u)
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u)
    return lerp(x1, x2, v)
  }

  /**
   * Fractal sum of `octaves` layers, each at double the frequency and `gain`
   * the amplitude, normalised back into roughly [-1, 1]. Each layer is
   * rotated a little so the lattice never lines up into visible grids.
   */
  fbm(x: number, y: number, octaves: number, gain = 0.5, lacunarity = 2): number {
    let sum = 0
    let amp = 1
    let norm = 0
    let fx = x
    let fy = y
    const n = Math.max(1, Math.floor(octaves))
    for (let o = 0; o < n; o++) {
      sum += this.noise(fx + o * 31.7, fy - o * 17.3) * amp
      norm += amp
      amp *= gain
      // Rotate ~37° and scale for the next layer.
      const rx = fx * 0.8 - fy * 0.6
      const ry = fx * 0.6 + fy * 0.8
      fx = rx * lacunarity
      fy = ry * lacunarity
    }
    return sum / norm
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function grad(hash: number, x: number, y: number): number {
  switch (hash & 7) {
    case 0:
      return x + y
    case 1:
      return -x + y
    case 2:
      return x - y
    case 3:
      return -x - y
    case 4:
      return x
    case 5:
      return -x
    case 6:
      return y
    default:
      return -y
  }
}

/** Stateless integer hash of two ints and a seed, as a float in [0, 1). */
export function hash2(i: number, j: number, seed: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
