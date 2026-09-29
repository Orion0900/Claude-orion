import { tierOf } from '../enemies/enemyDefs'
import type { Enemy, GameContext, InteractableKind } from '../game/types'
import {
  arrowAngle,
  clampToCircle,
  markerColor,
  pinsToEdge,
  sampleHeights,
  shadeTerrain,
  worldToMap,
  type Point2,
} from './mapMath'

/** Texels per side of the baked terrain picture. */
const BAKE_SIZE = 160
/** Metres from the player to the minimap's rim. */
const VIEW_RADIUS = 55
/** Enemies scanned per frame for elite/boss dots; the list can hold hundreds. */
const ENEMY_SCAN_CAP = 400
const OUTLINE = '#140e26'

/**
 * Draws the stage map twice over: the small rotating minimap and the big
 * north-up map of the Tab overlay. The terrain is baked once per stage into
 * an offscreen canvas; each frame only blits it and draws a few dozen markers.
 */
export class MapView {
  private baked: HTMLCanvasElement | null = null
  private bakedHalf = 1
  private readonly tmp: Point2 = { x: 0, y: 0 }
  private clock = 0

  /** Forgets the baked terrain so the next draw re-bakes for the current stage. */
  invalidate(): void {
    this.baked = null
  }

  tick(dt: number): void {
    this.clock += dt
  }

  private ensureBaked(ctx: GameContext): HTMLCanvasElement | null {
    if (this.baked) return this.baked
    const world = ctx.world
    const half = world.halfSize > 0 ? world.halfSize : 1
    const canvas = document.createElement('canvas')
    canvas.width = BAKE_SIZE
    canvas.height = BAKE_SIZE
    const g = canvas.getContext('2d')
    if (!g) return null
    const heights = sampleHeights((x, z) => world.heightAt(x, z), half, BAKE_SIZE)
    const p = ctx.stage.palette
    const img = g.createImageData(BAKE_SIZE, BAKE_SIZE)
    shadeTerrain(heights, BAKE_SIZE, (half * 2) / BAKE_SIZE, { low: p.groundLow, high: p.groundHigh, cliff: p.cliff }, img.data)
    g.putImageData(img, 0, 0)
    this.baked = canvas
    this.bakedHalf = half
    return canvas
  }

  /** The small rotating map: player in the middle, camera forward up. `size` is the canvas's CSS size. */
  drawMini(canvas: HTMLCanvasElement, size: number, ctx: GameContext): void {
    const g = canvas.getContext('2d')
    const baked = this.ensureBaked(ctx)
    if (!g || !baked || size <= 0) return
    const dpr = canvas.width / size
    const c = size / 2
    const rim = c - 3
    const scale = rim / VIEW_RADIUS
    const yaw = ctx.camera.yaw
    const player = ctx.player.pos
    const half = this.bakedHalf

    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, size, size)
    g.save()
    g.beginPath()
    g.arc(c, c, rim, 0, Math.PI * 2)
    g.clip()
    g.fillStyle = '#0d0a1f'
    g.fillRect(0, 0, size, size)

    g.save()
    g.translate(c, c)
    g.rotate(yaw)
    g.scale(scale, scale)
    g.translate(-player.x, -player.z)
    g.imageSmoothingEnabled = true
    g.drawImage(baked, -half, -half, half * 2, half * 2)
    g.strokeStyle = 'rgba(10,6,24,0.8)'
    g.lineWidth = 3 / scale
    g.strokeRect(-half, -half, half * 2, half * 2)
    g.restore()

    const p = this.tmp
    const markers = ctx.interactables.markers
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i]
      if (m.kind === 'pot') continue
      worldToMap(m.pos.x - player.x, m.pos.z - player.z, yaw, scale, p)
      if (clampToCircle(p, rim - 6) && !pinsToEdge(m.kind)) continue
      this.marker(g, c + p.x, c + p.y, m.kind, m.used, m.golden === true, 1)
    }

    const list = ctx.enemies.list
    const n = Math.min(list.length, ENEMY_SCAN_CAP)
    for (let i = 0; i < n; i++) {
      const e = list[i]
      if (!e.alive || !(e.elite || isBig(e))) continue
      worldToMap(e.pos.x - player.x, e.pos.z - player.z, yaw, scale, p)
      if (clampToCircle(p, rim - 5) && !isBig(e)) continue
      this.enemyDot(g, c + p.x, c + p.y, e.boss, 1)
    }

    this.arrow(g, c, c, arrowAngle(yaw, ctx.player.yaw), 1)

    // North (-Z) on the rim, so the rotation reads.
    worldToMap(0, -1, yaw, 1, p)
    const nx = c + p.x * (rim - 9)
    const ny = c + p.y * (rim - 9)
    g.font = '900 10px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineWidth = 3
    g.strokeStyle = OUTLINE
    g.strokeText('N', nx, ny)
    g.fillStyle = '#ffffff'
    g.fillText('N', nx, ny)
    g.restore()
  }

  /** The whole stage, north up, for the Tab overlay. */
  drawFull(canvas: HTMLCanvasElement, size: number, ctx: GameContext): void {
    const g = canvas.getContext('2d')
    const baked = this.ensureBaked(ctx)
    if (!g || !baked || size <= 0) return
    const dpr = canvas.width / size
    const half = this.bakedHalf
    const scale = size / (half * 2)
    const toX = (x: number) => (x + half) * scale
    const toY = (z: number) => (z + half) * scale

    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.imageSmoothingEnabled = true
    g.drawImage(baked, 0, 0, size, size)

    const markers = ctx.interactables.markers
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i]
      if (m.kind === 'pot') continue
      this.marker(g, toX(m.pos.x), toY(m.pos.z), m.kind, m.used, m.golden === true, 1.4)
    }
    const list = ctx.enemies.list
    const n = Math.min(list.length, ENEMY_SCAN_CAP)
    for (let i = 0; i < n; i++) {
      const e = list[i]
      if (e.alive && (e.elite || isBig(e))) this.enemyDot(g, toX(e.pos.x), toY(e.pos.z), e.boss, 1.3)
    }
    const player = ctx.player.pos
    this.arrow(g, toX(player.x), toY(player.z), arrowAngle(0, ctx.player.yaw), 1.5)
  }

  private marker(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    kind: InteractableKind,
    used: boolean,
    golden: boolean,
    k: number,
  ): void {
    g.globalAlpha = used ? 0.32 : 1
    g.fillStyle = markerColor(kind, golden)
    g.strokeStyle = OUTLINE
    g.lineWidth = 1.5
    g.beginPath()
    switch (kind) {
      case 'chest':
        g.rect(x - 3.5 * k, y - 2.8 * k, 7 * k, 5.6 * k)
        break
      case 'altar': {
        // A little skull: cranium, jaw and two eyes.
        g.arc(x, y - 0.8 * k, 5 * k, 0, Math.PI * 2)
        g.rect(x - 2.8 * k, y + 2 * k, 5.6 * k, 3.2 * k)
        g.fill()
        g.stroke()
        g.fillStyle = OUTLINE
        g.beginPath()
        g.arc(x - 1.9 * k, y - 0.8 * k, 1.3 * k, 0, Math.PI * 2)
        g.arc(x + 1.9 * k, y - 0.8 * k, 1.3 * k, 0, Math.PI * 2)
        g.fill()
        g.globalAlpha = 1
        return
      }
      case 'portal': {
        const r = (6 + Math.sin(this.clock * 5) * 1.2) * k
        g.arc(x, y, r, 0, Math.PI * 2)
        g.lineWidth = 3.5 * k
        g.strokeStyle = markerColor('portal')
        g.stroke()
        g.globalAlpha = 1
        return
      }
      default:
        g.arc(x, y, 3.6 * k, 0, Math.PI * 2)
    }
    g.fill()
    g.stroke()
    g.globalAlpha = 1
  }

  private enemyDot(g: CanvasRenderingContext2D, x: number, y: number, boss: boolean, k: number): void {
    const r = (boss ? 5.5 + Math.sin(this.clock * 8) : 3) * k
    g.fillStyle = boss ? '#ff2e4d' : '#ff8a3d'
    g.strokeStyle = boss ? '#ffffff' : OUTLINE
    g.lineWidth = boss ? 2 : 1.3
    g.beginPath()
    if (boss) g.arc(x, y, r, 0, Math.PI * 2)
    else {
      // Elites wear a diamond, like their floating marker.
      g.moveTo(x, y - r * 1.3)
      g.lineTo(x + r, y)
      g.lineTo(x, y + r * 1.3)
      g.lineTo(x - r, y)
      g.closePath()
    }
    g.fill()
    g.stroke()
  }

  private arrow(g: CanvasRenderingContext2D, x: number, y: number, angle: number, k: number): void {
    g.save()
    g.translate(x, y)
    g.rotate(angle)
    g.scale(k, k)
    g.beginPath()
    g.moveTo(0, -8)
    g.lineTo(6, 6)
    g.lineTo(0, 3)
    g.lineTo(-6, 6)
    g.closePath()
    g.fillStyle = '#ffffff'
    g.strokeStyle = OUTLINE
    g.lineWidth = 2
    g.lineJoin = 'round'
    g.stroke()
    g.fill()
    g.restore()
  }
}

/** Bosses and minibosses: always drawn, and pinned to the rim when off the map so they can be found. */
function isBig(e: Enemy): boolean {
  return e.boss || tierOf(e.def) === 'miniboss'
}
