import * as THREE from 'three'
import type { StageDef } from '../game/types'
import { Noise2D, hash2, smoothstep } from './noise'
import type { HeightField } from './terrain'

export type TerrainPalette = Pick<StageDef['palette'], 'groundLow' | 'groundHigh' | 'cliff'>

/**
 * Turns the height grid into `chunks`² flat-shaded, non-indexed geometries:
 * two triangles per cell, one colour per triangle. Colour runs from
 * groundLow in the hollows to groundHigh on the tops, drifts in broad
 * patches so meadows read at a glance, turns to cliff on steep faces, and
 * jitters a little per face for the faceted look. Chunks let the renderer
 * cull what's off screen or outside the shadow camera.
 */
export function buildTerrainGeometries(field: HeightField, palette: TerrainPalette, seed: number, chunks = 4): THREE.BufferGeometry[] {
  const n = field.size
  const cells = n - 1
  const H = field.heights
  const cell = field.cell
  const { mean, spread } = heightStats(field)
  const patches = new Noise2D(seed ^ 0x7a11)

  const low = new THREE.Color(palette.groundLow)
  const high = new THREE.Color(palette.groundHigh)
  const cliff = new THREE.Color(palette.cliff)
  const c = new THREE.Color()

  const out: THREE.BufferGeometry[] = []
  for (let cj = 0; cj < chunks; cj++) {
    const j0 = Math.floor((cj * cells) / chunks)
    const j1 = Math.floor(((cj + 1) * cells) / chunks)
    for (let ci = 0; ci < chunks; ci++) {
      const i0 = Math.floor((ci * cells) / chunks)
      const i1 = Math.floor(((ci + 1) * cells) / chunks)
      const verts = (i1 - i0) * (j1 - j0) * 6
      const pos = new Float32Array(verts * 3)
      const nor = new Float32Array(verts * 3)
      const col = new Float32Array(verts * 3)
      let v = 0

      const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number, g: number, b: number): void => {
        const o = v * 3
        pos[o] = x
        pos[o + 1] = y
        pos[o + 2] = z
        nor[o] = nx
        nor[o + 1] = ny
        nor[o + 2] = nz
        col[o] = r
        col[o + 1] = g
        col[o + 2] = b
        v++
      }

      const face = (
        ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        cx: number, cy: number, cz: number,
        gx: number, gz: number, salt: number,
      ): void => {
        const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz)
        const nx = -gx * inv
        const ny = inv
        const nz = -gz * inv
        const mx = (ax + bx + cx) / 3
        const mz = (az + bz + cz) / 3
        const h = (ay + by + cy) / 3
        const patch = patches.fbm(mx * 0.045, mz * 0.045, 2)
        const t = Math.min(1, Math.max(0, 0.5 + (h - mean) / (2.4 * spread) + patch * 0.35))
        c.copy(low).lerp(high, t)
        c.lerp(cliff, smoothstep(0.86, 0.62, ny))
        const k = 1 + (hash2(salt, 0, seed) - 0.5) * 0.09
        put(ax, ay, az, nx, ny, nz, c.r * k, c.g * k, c.b * k)
        put(bx, by, bz, nx, ny, nz, c.r * k, c.g * k, c.b * k)
        put(cx, cy, cz, nx, ny, nz, c.r * k, c.g * k, c.b * k)
      }

      for (let j = j0; j < j1; j++) {
        const z0 = field.coord(j)
        const z1 = z0 + cell
        for (let i = i0; i < i1; i++) {
          const x0 = field.coord(i)
          const x1 = x0 + cell
          const k = j * n + i
          const h00 = H[k]
          const h10 = H[k + 1]
          const h01 = H[k + n]
          const h11 = H[k + n + 1]
          const salt = k * 2
          // Counter-clockwise seen from above, so the faces point up.
          face(x0, h00, z0, x0, h01, z1, x1, h10, z0, (h10 - h00) / cell, (h01 - h00) / cell, salt)
          face(x1, h10, z0, x0, h01, z1, x1, h11, z1, (h11 - h01) / cell, (h11 - h10) / cell, salt + 1)
        }
      }

      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      g.computeBoundingBox()
      g.computeBoundingSphere()
      out.push(g)
    }
  }
  return out
}

/** Mean and spread of the walkable heights, so colours use the whole low→high range on every stage. */
function heightStats(field: HeightField): { mean: number; spread: number } {
  let sum = 0
  let sum2 = 0
  let count = 0
  const reach = Math.min(field.halfSize, 80)
  for (let z = -reach; z <= reach; z += 2) {
    for (let x = -reach; x <= reach; x += 2) {
      const h = field.heightAt(x, z)
      sum += h
      sum2 += h * h
      count++
    }
  }
  const mean = sum / count
  const spread = Math.sqrt(Math.max(0, sum2 / count - mean * mean))
  return { mean, spread: Math.max(0.5, spread) }
}
