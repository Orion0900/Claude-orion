import { Noise2D, hash2, smoothstep } from './noise'

describe('Noise2D', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = new Noise2D(42)
    const b = new Noise2D(42)
    const c = new Noise2D(43)
    let differs = false
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37
      const y = i * -0.61
      expect(a.noise(x, y)).toBe(b.noise(x, y))
      if (a.noise(x, y) !== c.noise(x, y)) differs = true
    }
    expect(differs).toBe(true)
  })

  it('stays within [-1, 1] and is finite, even for fractal sums', () => {
    const n = new Noise2D(7)
    for (let i = 0; i < 5000; i++) {
      const x = (i * 7.31) % 900 - 450
      const y = (i * 3.17) % 700 - 350
      const v = n.noise(x, y)
      const f = n.fbm(x * 0.05, y * 0.05, 5, 0.5)
      expect(Number.isFinite(v)).toBe(true)
      expect(Math.abs(v)).toBeLessThanOrEqual(1)
      expect(Math.abs(f)).toBeLessThanOrEqual(1)
    }
  })

  it('is continuous: tiny steps give tiny changes', () => {
    const n = new Noise2D(3)
    for (let i = 0; i < 500; i++) {
      const x = i * 0.913
      const y = i * 0.271
      expect(Math.abs(n.noise(x + 1e-4, y) - n.noise(x, y))).toBeLessThan(1e-3)
      expect(Math.abs(n.fbm(x, y + 1e-4, 4) - n.fbm(x, y, 4))).toBeLessThan(1e-2)
    }
  })

  it('actually varies (not a constant field)', () => {
    const n = new Noise2D(11)
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < 2000; i++) {
      const v = n.fbm(i * 0.173, i * 0.311, 3)
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    expect(max - min).toBeGreaterThan(0.6)
  })
})

describe('hash2', () => {
  it('is stable, in [0, 1) and spread out', () => {
    let sum = 0
    for (let i = 0; i < 1000; i++) {
      const h = hash2(i, i * 3, 9)
      expect(h).toBe(hash2(i, i * 3, 9))
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(1)
      sum += h
    }
    expect(sum / 1000).toBeGreaterThan(0.4)
    expect(sum / 1000).toBeLessThan(0.6)
  })
})

describe('smoothstep', () => {
  it('clamps and eases, in either direction', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
    expect(smoothstep(1, 0, 0)).toBe(1)
    expect(smoothstep(1, 0, 1)).toBe(0)
  })
})
