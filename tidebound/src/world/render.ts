import type { Neighbors } from '../art/world'
import { Art } from '../game/art'
import { toCanvas, type Gfx, SCREEN_H, SCREEN_W } from '../engine/gfx'
import { BUILDING_SIZE, type TerrainKind } from './terrain'
import { TILE } from './Actor'
import type { World, WorldMap } from './WorldMap'

/** Ticks per animation frame for each animated terrain. */
const ANIM_TICKS: Partial<Record<TerrainKind, number>> = { water: 16, caveWater: 20, flowers: 28, tallgrass: 30 }

interface Baked {
  canvas: HTMLCanvasElement
  /** Animated cells not hidden under a building. */
  animated: { x: number; y: number; kind: TerrainKind; n: Neighbors }[]
}

const NEIGHBOR_STEPS: readonly [number, number][] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
]

/**
 * Draws maps. Each map's still layer (terrain at frame 0 plus buildings) is
 * baked once into a canvas; animated cells and the border beyond the edges
 * are drawn per frame from cached tiles.
 */
export class MapPainter {
  private readonly baked = new Map<string, Baked>()

  constructor(private readonly world: World) {}

  neighbors(map: WorldMap, x: number, y: number): Neighbors {
    return NEIGHBOR_STEPS.map(([dx, dy]) => this.world.kindAt(map, x + dx, y + dy))
  }

  private bake(map: WorldMap): Baked {
    let b = this.baked.get(map.id)
    if (b) return b
    const canvas = document.createElement('canvas')
    canvas.width = map.w * TILE
    canvas.height = map.h * TILE
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    const animated: Baked['animated'] = []
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const kind = map.kind(x, y)!
        const n = this.neighbors(map, x, y)
        const moving = Art.frames(kind) > 1
        // Animated cells use the same pattern variant for every frame.
        const tile = moving ? Art.tileLoose(kind, n, x, y, 0) : Art.tile(kind, n, x, y, 0)
        ctx.drawImage(toCanvas(tile), x * TILE, y * TILE)
        if (moving && !map.building(x, y)) animated.push({ x, y, kind, n })
      }
    }
    for (const bd of map.def.buildings ?? []) {
      const img = Art.building(bd.kind, bd.variant ?? 0)
      const size = BUILDING_SIZE[bd.kind]
      // Buildings stand on their footprint's bottom edge.
      ctx.drawImage(toCanvas(img), bd.x * TILE, (bd.y + size.h) * TILE - img.h)
    }
    b = { canvas, animated }
    this.baked.set(map.id, b)
    return b
  }

  /** Forget baked maps (after the art changes). */
  flush(): void {
    this.baked.clear()
  }

  private animFrame(kind: TerrainKind, tick: number): number {
    const frames = Art.frames(kind)
    return frames > 1 ? Math.floor(tick / (ANIM_TICKS[kind] ?? 20)) % frames : 0
  }

  /**
   * Draws everything the camera sees. (camX, camY) is the view's top-left in
   * `map`'s pixel coordinates.
   */
  draw(g: Gfx, map: WorldMap, camX: number, camY: number, tick: number): void {
    const x0 = Math.floor(camX / TILE)
    const y0 = Math.floor(camY / TILE)
    const x1 = Math.floor((camX + SCREEN_W - 1) / TILE)
    const y1 = Math.floor((camY + SCREEN_H - 1) / TILE)

    // Border cells first: anywhere no map covers.
    const border = map.def.border
    const borderN: Neighbors = new Array(8).fill(border)
    const bf = this.animFrame(border, tick)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.world.locate(map, x, y)) continue
        g.image(Art.tileLoose(border, borderN, x, y, bf), x * TILE - camX, y * TILE - camY)
      }
    }

    // The map itself and any connected maps in view.
    const layers: { m: WorldMap; ox: number; oy: number }[] = [{ m: map, ox: 0, oy: 0 }]
    for (const side of ['north', 'south', 'east', 'west'] as const) {
      const n = this.world.neighbor(map, side)
      if (n) layers.push({ m: n.map, ox: n.ox, oy: n.oy })
    }
    for (const { m, ox, oy } of layers) {
      const left = ox * TILE - camX
      const top = oy * TILE - camY
      if (left > SCREEN_W || top > SCREEN_H || left + m.w * TILE < 0 || top + m.h * TILE < 0) continue
      const b = this.bake(m)
      g.image(b.canvas, left, top)
      for (const a of b.animated) {
        const sx = left + a.x * TILE
        const sy = top + a.y * TILE
        if (sx <= -TILE || sy <= -TILE || sx >= SCREEN_W || sy >= SCREEN_H) continue
        const f = this.animFrame(a.kind, tick)
        if (f === 0) continue
        g.image(Art.tileLoose(a.kind, a.n, a.x, a.y, f), sx, sy)
      }
    }
  }
}
