/**
 * Minimap maths, kept apart from the canvas so it can be tested: the
 * camera-relative projection, edge clamping, marker colours, and baking a
 * shaded terrain picture from the height function.
 */
import type { InteractableKind } from '../game/types'

export interface Point2 {
  x: number
  y: number
}

/**
 * Projects a world offset from the player (dx, dz) onto the rotating minimap:
 * the camera's forward is up and its right is right. Yaw follows the game's
 * convention (0 looks down -Z, forward = (-sin, -cos)). Canvas y grows down.
 * This is exactly `ctx.rotate(yaw)`, so the baked terrain can be drawn with
 * the same transform.
 */
export function worldToMap(dx: number, dz: number, yaw: number, scale: number, out: Point2): Point2 {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  out.x = (dx * c - dz * s) * scale
  out.y = (dx * s + dz * c) * scale
  return out
}

/** Canvas rotation of the player arrow: pointing up when the player faces where the camera looks. */
export function arrowAngle(cameraYaw: number, playerYaw: number): number {
  return cameraYaw - playerYaw
}

/** Pulls a point back onto a circle of `radius` round the origin; true if it had to move. */
export function clampToCircle(p: Point2, radius: number): boolean {
  const d2 = p.x * p.x + p.y * p.y
  if (d2 <= radius * radius || d2 === 0) return false
  const k = radius / Math.sqrt(d2)
  p.x *= k
  p.y *= k
  return true
}

/** Minimap colours per interactable; golden charge shrines read as gold. */
export function markerColor(kind: InteractableKind, golden = false): string {
  switch (kind) {
    case 'chest':
      return '#ffd23f'
    case 'shrineCharge':
      return golden ? '#ffb020' : '#3de0c8'
    case 'shrineGreed':
      return '#f5a300'
    case 'shrineMagnet':
      return '#4aa8ff'
    case 'shrineChallenge':
      return '#c86bff'
    case 'shrineCurse':
      return '#ff4d5e'
    case 'altar':
      return '#f4ecd8'
    case 'portal':
      return '#b36bff'
    case 'pot':
      return '#c9885a'
  }
}

/** Markers worth finding from afar stay pinned to the rim when out of view. */
export function pinsToEdge(kind: InteractableKind): boolean {
  return kind === 'altar' || kind === 'portal'
}

export type Rgb = [number, number, number]

/** '#rgb' or '#rrggbb' to 0..255 channels; anything unreadable is mid grey. */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = /^[0-9a-f]{6}$/i.test(h) ? parseInt(h, 16) : 0x808080
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Samples `heightAt` on an n×n grid covering [-halfSize, halfSize]², row-major by z then x, at cell centres. */
export function sampleHeights(heightAt: (x: number, z: number) => number, halfSize: number, n: number): Float32Array {
  const out = new Float32Array(n * n)
  const cell = (halfSize * 2) / n
  for (let j = 0; j < n; j++) {
    const z = -halfSize + (j + 0.5) * cell
    for (let i = 0; i < n; i++) {
      const h = heightAt(-halfSize + (i + 0.5) * cell, z)
      out[j * n + i] = Number.isFinite(h) ? h : 0
    }
  }
  return out
}

export interface TerrainPalette {
  low: string
  high: string
  cliff: string
}

/** Slope (rise over run) above which the ground is drawn as cliff: about 40°. */
const CLIFF_SLOPE = 0.84

/**
 * Shades a height grid into RGBA pixels: low→high colour by height, cliff
 * colour on steep cells, and a soft light from the top-left so hills read.
 * Returns `out` (length n*n*4).
 */
export function shadeTerrain(
  heights: Float32Array,
  n: number,
  cellSize: number,
  palette: TerrainPalette,
  out: Uint8ClampedArray = new Uint8ClampedArray(n * n * 4),
): Uint8ClampedArray {
  let min = Infinity
  let max = -Infinity
  for (let k = 0; k < heights.length; k++) {
    const h = heights[k]
    if (h < min) min = h
    if (h > max) max = h
  }
  const span = max - min > 1e-6 ? max - min : 1
  const low = hexToRgb(palette.low)
  const high = hexToRgb(palette.high)
  const cliff = hexToRgb(palette.cliff)
  const step = cellSize > 0 ? cellSize : 1

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const h = heights[k]
      const hx = heights[j * n + Math.min(n - 1, i + 1)] - heights[j * n + Math.max(0, i - 1)]
      const hz = heights[Math.min(n - 1, j + 1) * n + i] - heights[Math.max(0, j - 1) * n + i]
      const dx = hx / (2 * step)
      const dz = hz / (2 * step)
      const slope = Math.sqrt(dx * dx + dz * dz)
      const t = (h - min) / span
      const c = Math.min(1, Math.max(0, (slope - CLIFF_SLOPE * 0.7) / (CLIFF_SLOPE * 0.3)))
      // Light from up-left (-x, -z): faces tilted toward it are brighter.
      const light = Math.min(1.25, Math.max(0.6, 1 - (dx + dz) * 0.9))
      const o = k * 4
      for (let ch = 0; ch < 3; ch++) {
        const ground = low[ch] + (high[ch] - low[ch]) * t
        out[o + ch] = (ground + (cliff[ch] - ground) * c) * light
      }
      out[o + 3] = 255
    }
  }
  return out
}
