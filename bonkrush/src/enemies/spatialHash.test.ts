import { Rng } from '../core/rng'
import { SpatialHash } from './spatialHash'

function scatter(hash: SpatialHash, rng: Rng, n: number, extent: number): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  hash.clear()
  for (let i = 0; i < n; i++) {
    const x = rng.range(-extent, extent)
    const z = rng.range(-extent, extent)
    pts.push([x, z])
    hash.insert(i, x, z)
  }
  hash.build()
  return pts
}

describe('SpatialHash', () => {
  it('finds exactly the points a brute-force scan finds', () => {
    const rng = new Rng(3)
    const hash = new SpatialHash(100, 4, 16)
    const pts = scatter(hash, rng, 400, 100)
    const out: number[] = []
    for (let q = 0; q < 50; q++) {
      const x = rng.range(-100, 100)
      const z = rng.range(-100, 100)
      const r = rng.range(0.5, 20)
      const expected = pts
        .map(([px, pz], i) => ((px - x) ** 2 + (pz - z) ** 2 <= r * r ? i : -1))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)
      expect([...hash.query(x, z, r, out)].sort((a, b) => a - b)).toEqual(expected)
    }
  })

  it('clears the output array before filling it', () => {
    const hash = new SpatialHash(10, 2)
    hash.insert(7, 0, 0)
    hash.build()
    const out = [1, 2, 3]
    expect(hash.query(0, 0, 1, out)).toEqual([7])
    expect(hash.query(9, 9, 1, out)).toEqual([])
  })

  it('files points outside the grid in the edge cells', () => {
    const hash = new SpatialHash(10, 2)
    hash.insert(1, 50, 50)
    hash.insert(2, -50, 0)
    hash.build()
    expect(hash.query(50, 50, 1, [])).toEqual([1])
    expect(hash.query(-50, 0, 1, [])).toEqual([2])
  })

  it('rebuilds from scratch each frame', () => {
    const hash = new SpatialHash(20, 3)
    hash.insert(1, 0, 0)
    hash.build()
    hash.clear()
    hash.insert(2, 5, 5)
    hash.build()
    expect(hash.count).toBe(1)
    expect(hash.query(0, 0, 1, [])).toEqual([])
    expect(hash.query(5, 5, 1, [])).toEqual([2])
  })

  it('grows past its starting capacity', () => {
    const hash = new SpatialHash(50, 5, 2)
    for (let i = 0; i < 100; i++) hash.insert(i, i - 50, 0)
    hash.build()
    expect(hash.count).toBe(100)
    expect(hash.query(0, 0, 1.5, []).sort((a, b) => a - b)).toEqual([49, 50, 51])
  })

  it('finds the nearest point like a brute-force scan', () => {
    const rng = new Rng(11)
    const hash = new SpatialHash(80, 4)
    const pts = scatter(hash, rng, 300, 80)
    for (let q = 0; q < 60; q++) {
      const x = rng.range(-80, 80)
      const z = rng.range(-80, 80)
      const max = rng.range(1, 40)
      let best = -1
      let bestD = max * max
      pts.forEach(([px, pz], i) => {
        const d = (px - x) ** 2 + (pz - z) ** 2
        if (d <= bestD) {
          bestD = d
          best = i
        }
      })
      const got = hash.nearest(x, z, max)
      if (best < 0) expect(got).toBe(-1)
      else {
        const [gx, gz] = pts[got]
        expect((gx - x) ** 2 + (gz - z) ** 2).toBeCloseTo(bestD, 3)
      }
    }
  })

  it('skips rejected points when finding the nearest', () => {
    const hash = new SpatialHash(20, 2)
    hash.insert(1, 1, 0)
    hash.insert(2, 3, 0)
    hash.build()
    expect(hash.nearest(0, 0, 10)).toBe(1)
    expect(hash.nearest(0, 0, 10, (id) => id !== 1)).toBe(2)
    expect(hash.nearest(0, 0, 2, (id) => id !== 1)).toBe(-1)
  })

  it('returns nothing when empty', () => {
    const hash = new SpatialHash(20, 2)
    hash.build()
    expect(hash.query(0, 0, 5, [])).toEqual([])
    expect(hash.nearest(0, 0, 5)).toBe(-1)
  })
})
