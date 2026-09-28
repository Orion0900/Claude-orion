import { Vector3 } from 'three'
import { STAGES } from '../data/stages'
import { generateTerrain, HeightField, TERRAIN_SHAPE, WORLD_HALF_SIZE } from './terrain'
import { buildTerrainGeometries } from './terrainMesh'

const fields = STAGES.map((s) => generateTerrain(s.terrain))

describe('generateTerrain', () => {
  it('samples a 1 m grid over the whole map', () => {
    const f = fields[0]
    expect(f.halfSize).toBe(WORLD_HALF_SIZE)
    expect(f.size).toBe(2 * WORLD_HALF_SIZE + 1)
    expect(f.heights.length).toBe(f.size * f.size)
  })

  it('is deterministic by seed, and a different seed gives a different map', () => {
    const params = STAGES[0].terrain
    const a = generateTerrain(params)
    const b = generateTerrain(params)
    const c = generateTerrain({ ...params, seed: params.seed + 1 })
    expect(a.heights).toEqual(b.heights)
    let diff = 0
    for (let k = 0; k < a.heights.length; k++) diff += Math.abs(a.heights[k] - c.heights[k])
    expect(diff / a.heights.length).toBeGreaterThan(0.5)
  })

  it('has only finite heights', () => {
    for (const f of fields) expect(f.heights.every(Number.isFinite)).toBe(true)
  })

  it('keeps the start area flat', () => {
    for (const f of fields) {
      const h0 = f.heightAt(0, 0)
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        for (const r of [2, 6, 10, TERRAIN_SHAPE.startRadius - 1]) {
          expect(Math.abs(f.heightAt(Math.cos(a) * r, Math.sin(a) * r) - h0)).toBeLessThan(0.05)
        }
      }
      expect(f.flatness(0, 0)).toBeGreaterThan(0.999)
    }
  })

  it('raises a rim well above the centre near the boundary', () => {
    for (const f of fields) {
      const centre = f.heightAt(0, 0)
      let sum = 0
      let n = 0
      for (let t = -100; t <= 100; t += 5) {
        for (const [x, z] of [[t, 104], [t, -104], [104, t], [-104, t]]) {
          sum += f.heightAt(x, z)
          n++
        }
      }
      expect(sum / n).toBeGreaterThan(centre + 10)
    }
  })

  it('leaves the middle of the map walkable (under 50° almost everywhere)', () => {
    for (const f of fields) {
      let steep = 0
      let total = 0
      for (let z = -70; z <= 70; z += 2) {
        for (let x = -70; x <= 70; x += 2) {
          total++
          if (f.flatness(x, z) < Math.cos((50 * Math.PI) / 180)) steep++
        }
      }
      expect(steep / total).toBeLessThan(0.01)
    }
  })

  it('actually has hills to slide down', () => {
    for (const f of fields) {
      let min = Infinity
      let max = -Infinity
      for (let z = -70; z <= 70; z += 2) {
        for (let x = -70; x <= 70; x += 2) {
          const h = f.heightAt(x, z)
          min = Math.min(min, h)
          max = Math.max(max, h)
        }
      }
      expect(max - min).toBeGreaterThan(5)
    }
  })
})

describe('HeightField', () => {
  it('interpolates between grid nodes and matches them exactly on nodes', () => {
    const f = new HeightField(2, 1)
    // A tilted plane h = x + 2z is reproduced exactly by bilinear sampling.
    for (let j = 0; j < f.size; j++) for (let i = 0; i < f.size; i++) f.heights[j * f.size + i] = f.coord(i) + 2 * f.coord(j)
    expect(f.heightAt(1, 1)).toBeCloseTo(3)
    expect(f.heightAt(0.25, -0.5)).toBeCloseTo(0.25 - 1)
    expect(f.heightAt(-1.7, 0.3)).toBeCloseTo(-1.7 + 0.6)
  })

  it('clamps outside the grid and survives NaN', () => {
    const f = fields[1]
    expect(f.heightAt(500, 0)).toBe(f.heightAt(f.halfSize, 0))
    expect(f.heightAt(-1e9, -1e9)).toBe(f.heightAt(-f.halfSize, -f.halfSize))
    expect(Number.isFinite(f.heightAt(NaN, NaN))).toBe(true)
  })

  it('gives unit normals that point up and lean downhill', () => {
    const out = new Vector3()
    for (const f of fields) {
      for (let i = 0; i < 400; i++) {
        const x = ((i * 37) % 200) - 100
        const z = ((i * 53) % 200) - 100
        f.normalAt(x, z, out)
        expect(out.length()).toBeCloseTo(1, 6)
        expect(out.y).toBeGreaterThan(0)
        expect(out.y).toBeCloseTo(f.flatness(x, z), 6)
      }
    }
    const plane = new HeightField(4, 1)
    for (let j = 0; j < plane.size; j++) for (let i = 0; i < plane.size; i++) plane.heights[j * plane.size + i] = plane.coord(i)
    plane.normalAt(0, 0, out)
    // Ground rising toward +x: the normal leans toward -x.
    expect(out.x).toBeLessThan(0)
    expect(out.x).toBeCloseTo(-Math.SQRT1_2, 6)
    expect(out.z).toBeCloseTo(0, 6)
  })

  it('flattens a disc to a level and eases back out', () => {
    const f = generateTerrain(STAGES[0].terrain)
    const before = f.heightAt(60, 30)
    f.flatten(60, 30, 5, 4, 3)
    expect(f.heightAt(60, 30)).toBeCloseTo(3, 5)
    expect(f.heightAt(63, 32)).toBeCloseTo(3, 5)
    expect(f.heightAt(60 + 15, 30)).toBe(generateTerrain(STAGES[0].terrain).heightAt(75, 30))
    expect(before).not.toBe(3)
  })
})

describe('buildTerrainGeometries', () => {
  it('builds flat, non-indexed chunks covering every cell, with finite colours', () => {
    const f = fields[2]
    const geos = buildTerrainGeometries(f, STAGES[2].palette, 5, 4)
    expect(geos.length).toBe(16)
    let verts = 0
    for (const g of geos) {
      expect(g.index).toBeNull()
      const pos = g.getAttribute('position')
      const col = g.getAttribute('color')
      const nor = g.getAttribute('normal')
      expect(col.count).toBe(pos.count)
      expect(nor.count).toBe(pos.count)
      let colourMin = Infinity
      let colourMax = -Infinity
      for (const v of col.array as Float32Array) {
        colourMin = Math.min(colourMin, v)
        colourMax = Math.max(colourMax, v)
      }
      expect(colourMin).toBeGreaterThanOrEqual(0)
      expect(colourMax).toBeLessThanOrEqual(1.2)
      let lowestNormalY = Infinity
      for (let k = 1; k < nor.array.length; k += 3) lowestNormalY = Math.min(lowestNormalY, nor.array[k])
      expect(lowestNormalY).toBeGreaterThan(0)
      expect((pos.array as Float32Array).every(Number.isFinite)).toBe(true)
      verts += pos.count
      g.dispose()
    }
    expect(verts).toBe((f.size - 1) ** 2 * 6)
  })

  it('puts triangle corners exactly on the height grid', () => {
    const f = fields[0]
    const [g] = buildTerrainGeometries(f, STAGES[0].palette, 1, 1)
    const pos = g.getAttribute('position')
    for (let v = 0; v < pos.count; v += 997) {
      expect(pos.getY(v)).toBeCloseTo(f.heightAt(pos.getX(v), pos.getZ(v)), 4)
    }
    g.dispose()
  })
})
