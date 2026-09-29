import * as THREE from 'three'
import type { Settings } from '../game/types'

interface MoteStyle {
  color: string
  size: number
  count: number
  /** Steady drift, m/s. */
  drift: [number, number, number]
  /** Amplitude of the wandering on top, m/s. */
  wander: number
  /** Fireflies pulse and glow additively. */
  glow: boolean
  opacity: number
}

/** Pollen in the woods, blowing sand on the dunes, fireflies in the crypt. */
const STYLES: readonly MoteStyle[] = [
  { color: '#fff6b0', size: 0.13, count: 160, drift: [0.4, -0.2, 0.25], wander: 0.45, glow: false, opacity: 0.8 },
  { color: '#f7dcaa', size: 0.09, count: 240, drift: [6, 0.15, 2.1], wander: 1.2, glow: false, opacity: 0.6 },
  { color: '#b9ff7a', size: 0.24, count: 110, drift: [0, 0.05, 0], wander: 0.9, glow: true, opacity: 1 },
]

/** Half extents of the box of motes kept around the player. */
const BOX = new THREE.Vector3(26, 9, 26)

/**
 * Cheap ambient particles: one Points object whose positions live in the
 * world and wrap around a box that follows the player, so they drift past
 * instead of sticking to the camera.
 */
export class Motes {
  private readonly points: THREE.Points
  private readonly geo = new THREE.BufferGeometry()
  private readonly mat: THREE.PointsMaterial
  private readonly map: THREE.Texture | null
  private readonly pos: Float32Array
  private readonly col: Float32Array | null
  private readonly phase: Float32Array
  private readonly style: MoteStyle
  private readonly base = new THREE.Color()
  private time = 0

  constructor(
    private readonly root: THREE.Group,
    stageIndex: number,
    settings: Settings,
    focus: THREE.Vector3,
  ) {
    this.style = STYLES[Math.min(Math.max(0, stageIndex), STYLES.length - 1)]
    const count = Math.round(this.style.count * (settings.quality === 'low' ? 0.4 : settings.quality === 'high' ? 1.3 : 1))
    this.pos = new Float32Array(count * 3)
    this.phase = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // Cosmetic only, so Math.random is fine.
      this.pos[i * 3] = focus.x + (Math.random() * 2 - 1) * BOX.x
      this.pos[i * 3 + 1] = focus.y + (Math.random() * 2 - 1) * BOX.y
      this.pos[i * 3 + 2] = focus.z + (Math.random() * 2 - 1) * BOX.z
      this.phase[i] = Math.random() * Math.PI * 2
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.base.set(this.style.color)
    this.col = this.style.glow ? new Float32Array(count * 3) : null
    if (this.col) this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3))

    this.map = makeDotTexture()
    this.mat = new THREE.PointsMaterial({
      color: this.style.glow ? 0xffffff : this.base,
      vertexColors: this.style.glow,
      size: this.style.size,
      map: this.map,
      transparent: true,
      opacity: this.style.opacity,
      depthWrite: false,
      blending: this.style.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.points = new THREE.Points(this.geo, this.mat)
    this.points.frustumCulled = false
    root.add(this.points)
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt
    const t = this.time
    const s = this.style
    const p = this.pos
    const n = this.phase.length
    for (let i = 0; i < n; i++) {
      const ph = this.phase[i]
      const o = i * 3
      p[o] += (s.drift[0] + Math.sin(t * 0.7 + ph) * s.wander) * dt
      p[o + 1] += (s.drift[1] + Math.cos(t * 0.9 + ph * 1.3) * s.wander * 0.5) * dt
      p[o + 2] += (s.drift[2] + Math.cos(t * 0.6 + ph * 0.7) * s.wander) * dt
      p[o] = wrap(p[o], focus.x, BOX.x)
      p[o + 1] = wrap(p[o + 1], focus.y + 3, BOX.y)
      p[o + 2] = wrap(p[o + 2], focus.z, BOX.z)
      if (this.col) {
        const k = 0.15 + 0.85 * Math.max(0, Math.sin(t * 1.7 + ph * 3))
        this.col[o] = this.base.r * k
        this.col[o + 1] = this.base.g * k
        this.col[o + 2] = this.base.b * k
      }
    }
    this.geo.getAttribute('position').needsUpdate = true
    if (this.col) this.geo.getAttribute('color').needsUpdate = true
  }

  dispose(): void {
    this.root.remove(this.points)
    this.geo.dispose()
    this.mat.dispose()
    this.map?.dispose()
  }
}

function wrap(v: number, centre: number, half: number): number {
  const d = v - centre
  if (d > half) return v - 2 * half
  if (d < -half) return v + 2 * half
  return v
}

/** A soft round dot so points aren't squares. Null outside a browser. */
function makeDotTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return null
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
