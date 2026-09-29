import { ColliderGrid, PLAY_LIMIT, segmentPointDistance } from './colliders'

const HALF = 110

describe('ColliderGrid', () => {
  it('pushes a body out of a solid circle along the line between centres', () => {
    const grid = new ColliderGrid([{ x: 10, z: 10, r: 1 }], HALF)
    const pos = { x: 10.5, z: 10, y: 3 }
    grid.collide(pos, 0.5)
    expect(pos.x).toBeCloseTo(11.5)
    expect(pos.z).toBeCloseTo(10)
    expect(pos.y).toBe(3)
  })

  it('leaves bodies that do not touch anything alone', () => {
    const grid = new ColliderGrid([{ x: 10, z: 10, r: 1 }], HALF)
    const pos = { x: 12, z: 10 }
    grid.collide(pos, 0.5)
    expect(pos).toEqual({ x: 12, z: 10 })
  })

  it('finds solids across cell borders and handles big bodies', () => {
    // Collider centred just across a cell edge from the body.
    const grid = new ColliderGrid([{ x: 4.1, z: 0, r: 0.5 }], HALF, PLAY_LIMIT, 4)
    const pos = { x: 1.5, z: 0 }
    grid.collide(pos, 2.5)
    expect(Math.hypot(pos.x - 4.1, pos.z)).toBeCloseTo(3)
  })

  it('handles a body dead on a solid centre without NaN', () => {
    const grid = new ColliderGrid([{ x: 0, z: 30, r: 1 }], HALF)
    const pos = { x: 0, z: 30 }
    grid.collide(pos, 0.5)
    expect(Number.isFinite(pos.x) && Number.isFinite(pos.z)).toBe(true)
    expect(Math.hypot(pos.x, pos.z - 30)).toBeCloseTo(1.5)
  })

  it('keeps bodies inside the walkable square, minding their radius', () => {
    const grid = new ColliderGrid([], HALF)
    const pos = { x: 500, z: -500 }
    grid.collide(pos, 1)
    expect(pos.x).toBe(PLAY_LIMIT - 1)
    expect(pos.z).toBe(-(PLAY_LIMIT - 1))
    const inside = { x: 20, z: -40 }
    grid.collide(inside, 1)
    expect(inside).toEqual({ x: 20, z: -40 })
  })

  it('recovers a NaN position instead of spreading it', () => {
    const grid = new ColliderGrid([{ x: 5, z: 5, r: 1 }], HALF)
    const pos = { x: NaN, z: 7 }
    grid.collide(pos, 0.5)
    expect(Number.isFinite(pos.x)).toBe(true)
    expect(pos.z).toBe(7)
  })

  it('agrees with a brute-force check on a random field', () => {
    const circles = Array.from({ length: 400 }, (_, i) => ({
      x: ((i * 73) % 190) - 95,
      z: ((i * 131) % 190) - 95,
      r: 0.4 + (i % 5) * 0.4,
    }))
    const grid = new ColliderGrid(circles, HALF)
    for (let i = 0; i < 500; i++) {
      const x = ((i * 17.3) % 180) - 90
      const z = ((i * 29.1) % 180) - 90
      const r = 0.3 + (i % 4) * 0.5
      const brute = circles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r)
      expect(grid.blocked(x, z, r)).toBe(brute)
    }
  })

  it('squeezes a body out from between two solids after a few frames', () => {
    // The gap between the two is narrower than the body, so it has to leave sideways.
    const circles = [
      { x: 0, z: 0, r: 1 },
      { x: 3, z: 0, r: 1 },
    ]
    const grid = new ColliderGrid(circles, HALF)
    const pos = { x: 1.5, z: 0.2 }
    for (let k = 0; k < 30; k++) grid.collide(pos, 0.8)
    for (const c of circles) expect(Math.hypot(pos.x - c.x, pos.z - c.z)).toBeGreaterThan(c.r + 0.8 - 0.02)
    expect(pos.z).toBeGreaterThan(0)
  })

  it('finds every solid near a segment, each once, agreeing with a brute-force check', () => {
    const circles = Array.from({ length: 600 }, (_, i) => ({
      x: ((i * 73) % 190) - 95,
      z: ((i * 131) % 190) - 95,
      r: 0.3 + (i % 7) * 0.5,
    }))
    const grid = new ColliderGrid(circles, HALF)
    const out: number[] = []
    for (let i = 0; i < 300; i++) {
      const ax = ((i * 17.3) % 180) - 90
      const az = ((i * 29.1) % 180) - 90
      const bx = ax + ((i * 7) % 13) - 6
      const bz = az + ((i * 11) % 17) - 8
      const pad = (i % 4) * 0.8
      grid.querySegment(ax, az, bx, bz, pad, out)
      expect(new Set(out).size).toBe(out.length)
      const brute = circles.flatMap((c, n) => (segmentPointDistance(ax, az, bx, bz, c.x, c.z) < c.r + pad ? [n] : []))
      expect([...out].sort((a, b) => a - b)).toEqual(brute)
    }
  })

  it('answers an empty segment query on an empty grid', () => {
    const out = [1, 2, 3]
    expect(new ColliderGrid([], HALF).querySegment(0, 0, 10, 10, 2, out)).toEqual([])
  })
})

describe('segmentPointDistance', () => {
  it('measures to the nearest point of the segment, ends included', () => {
    expect(segmentPointDistance(0, 0, 10, 0, 5, 3)).toBeCloseTo(3)
    expect(segmentPointDistance(0, 0, 10, 0, -4, 3)).toBeCloseTo(5)
    expect(segmentPointDistance(0, 0, 10, 0, 13, -4)).toBeCloseTo(5)
    expect(segmentPointDistance(2, 2, 2, 2, 5, 6)).toBeCloseTo(5)
  })
})
