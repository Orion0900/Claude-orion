import * as THREE from 'three'
import { NUMBER_KINDS, NUMBER_STYLES, NumberPool, distanceScale, easeOutCubic, fadeOut, popScale } from './fxMath'

const FONT_STACK = 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
/** Sideways drift over a number's life, CSS pixels. */
const DRIFT_PX = 22
/** Numbers closer than this to the camera plane are skipped (they would be huge or behind it). */
const NEAR = 0.3
const MARGIN = 80

const _v = new THREE.Vector3()

/**
 * Floating damage and pickup numbers, drawn with Canvas 2D on one overlay
 * canvas instead of as sprites: crisp outlined text at any size, and a cost
 * that doesn't touch the WebGL frame.
 */
export class NumberLayer {
  readonly pool = new NumberPool(200)
  private readonly canvas: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D | null
  private readonly fonts: string[]
  private readonly observer: ResizeObserver | null = null
  private width = 0
  private height = 0
  private dpr = 1
  /** Whether the canvas has anything on it that the next draw must clear. */
  private dirty = false

  constructor(
    private readonly host: HTMLElement,
    /** What the camera projects onto: the game canvas. The overlay matches its size. */
    private readonly target: HTMLElement,
  ) {
    const canvas = document.createElement('canvas')
    canvas.className = 'fx-numbers'
    canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;'
    host.appendChild(canvas)
    this.canvas = canvas
    this.g = canvas.getContext('2d')
    this.fonts = NUMBER_KINDS.map((kind) => {
      const style = NUMBER_STYLES[kind]
      return `${style.italic ? 'italic ' : ''}900 ${style.size}px ${FONT_STACK}`
    })
    this.resize()
    window.addEventListener('resize', this.resize)
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.resize)
      this.observer.observe(host)
      if (target !== host) this.observer.observe(target)
    }
  }

  /** Redraws every live number where `camera` currently sees it; clears if there is no camera. */
  draw(camera: THREE.Camera | null): void {
    const g = this.g
    if (!g) return
    if (this.dirty) {
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, this.canvas.width, this.canvas.height)
      this.dirty = false
    }
    const pool = this.pool
    if (!camera || pool.count === 0 || this.width === 0) return

    const view = camera.matrixWorldInverse
    const projection = camera.projectionMatrix
    const w = this.width * this.dpr
    const h = this.height * this.dpr
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.miterLimit = 2

    // Kind by kind, so the font and colours are set at most seven times a frame.
    for (let k = 0; k < NUMBER_KINDS.length; k++) {
      const style = NUMBER_STYLES[NUMBER_KINDS[k]]
      let styled = false
      for (let i = 0; i < pool.capacity; i++) {
        if (!pool.active[i] || pool.kind[i] !== k) continue
        const t = pool.progress(i)
        const alpha = fadeOut(t, 0.55)
        if (alpha <= 0.01) continue
        const rise = style.rise * easeOutCubic(t)
        _v.set(pool.x[i], pool.y[i] + rise, pool.z[i]).applyMatrix4(view)
        const depth = -_v.z
        if (depth < NEAR) continue
        _v.applyMatrix4(projection)
        const sx = (_v.x * 0.5 + 0.5) * w + pool.drift[i] * DRIFT_PX * this.dpr * easeOutCubic(t)
        const sy = (0.5 - _v.y * 0.5) * h
        if (sx < -MARGIN || sx > w + MARGIN || sy < -MARGIN || sy > h + MARGIN) continue

        if (!styled) {
          g.font = this.fonts[k]
          g.fillStyle = style.fill
          g.strokeStyle = style.stroke
          g.lineWidth = Math.max(3, style.size * 0.2)
          styled = true
        }
        const scale = popScale(pool.pop[i]) * distanceScale(depth) * this.dpr
        g.globalAlpha = alpha
        g.setTransform(scale, 0, 0, scale, sx, sy)
        g.strokeText(pool.text[i], 0, 0)
        g.fillText(pool.text[i], 0, 0)
        this.dirty = true
      }
    }
    g.globalAlpha = 1
    g.setTransform(1, 0, 0, 1, 0, 0)
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize)
    this.observer?.disconnect()
    this.canvas.remove()
    this.pool.clear()
  }

  private readonly resize = (): void => {
    let rect = this.target.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) rect = this.host.getBoundingClientRect()
    const cssW = rect.width >= 2 ? rect.width : window.innerWidth
    const cssH = rect.height >= 2 ? rect.height : window.innerHeight
    // Past 2× the extra pixels only cost fill rate.
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.width = cssW
    this.height = cssH
    this.dpr = dpr
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    this.canvas.width = Math.max(1, Math.round(cssW * dpr))
    this.canvas.height = Math.max(1, Math.round(cssH * dpr))
    // Resizing wiped the canvas.
    this.dirty = false
  }
}
