import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import type { Armed, WeaponKit } from '../kit'
import type { WeaponBehavior } from './types'

const SEGMENTS = 32
/** Ring radii as fractions of the aura radius, centre outward. */
const RINGS = [0, 0.4, 0.75, 0.9, 0.95, 1]
/** Brightness of each ring: a faint fill, a hot rim, a soft outer edge. */
const GLOW = [0.05, 0.07, 0.13, 0.4, 1, 0.22]
/** The rim ring is dashed so its slow spin reads. */
const RIM = 4
const LIFT = 0.1
/** Seconds a tick's pulse takes to settle. */
const PULSE = 0.25

const _c = new THREE.Vector3()

/**
 * A glowing disc around the player that hugs the terrain and damages
 * everything inside it on every tick. There is only ever one mesh, so it is
 * a plain Mesh whose vertices follow the ground each frame.
 */
export class AuraBehavior implements WeaponBehavior {
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private readonly positions: Float32Array
  private readonly color: THREE.Color
  private readonly found: Enemy[] = []
  private readonly spark: THREE.Color
  private phase = 0
  private pulse = PULSE

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
  ) {
    this.color = new THREE.Color(arm.w.def.color)
    this.spark = this.color.clone().lerp(new THREE.Color(1, 1, 1), 0.5)
    const count = RINGS.length * SEGMENTS
    this.positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    for (let k = 0; k < RINGS.length; k++) {
      for (let j = 0; j < SEGMENTS; j++) {
        const dash = k === RIM && j % 4 >= 2 ? 0.45 : 1
        const v = GLOW[k] * dash
        const i = (k * SEGMENTS + j) * 3
        colors[i] = colors[i + 1] = colors[i + 2] = v
      }
    }
    const index: number[] = []
    for (let k = 0; k < RINGS.length - 1; k++) {
      for (let j = 0; j < SEGMENTS; j++) {
        const a = k * SEGMENTS + j
        const b = k * SEGMENTS + ((j + 1) % SEGMENTS)
        const c = a + SEGMENTS
        const d = b + SEGMENTS
        index.push(a, c, b, b, c, d)
      }
    }
    const geometry = new THREE.BufferGeometry()
    const position = new THREE.BufferAttribute(this.positions, 3)
    position.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', position)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setIndex(index)
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      color: this.color,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    kit.ctx.scene.add(this.mesh)
  }

  fire(): boolean {
    const kit = this.kit
    const p = kit.ctx.player.pos
    const r = this.arm.eff.size
    const n = kit.hitArea(this.arm, p, r, 1, 1, this.found)
    for (let i = 0; i < n && i < 6; i++) {
      kit.embers.burst(kit.centerOf(this.found[i], _c), this.spark, kit.count(2), 4, 0.1, 0.3, 4)
    }
    this.pulse = 0
    kit.breakables(p, r)
    return true
  }

  update(dt: number): void {
    const kit = this.kit
    const p = kit.ctx.player.pos
    this.phase += dt * 0.9
    this.pulse = Math.min(PULSE, this.pulse + dt)
    const kick = 1 - this.pulse / PULSE
    const radius = this.arm.eff.size * (1 + 0.07 * Math.sin(kick * Math.PI))
    const pos = this.positions
    for (let k = 0; k < RINGS.length; k++) {
      const r = radius * RINGS[k]
      const turn = k >= RIM - 1 ? this.phase : this.phase * -0.3
      for (let j = 0; j < SEGMENTS; j++) {
        const a = (j / SEGMENTS) * Math.PI * 2 + turn
        const x = p.x + Math.cos(a) * r
        const z = p.z + Math.sin(a) * r
        const i = (k * SEGMENTS + j) * 3
        pos[i] = x
        pos[i + 1] = kit.groundY(x, z) + LIFT
        pos[i + 2] = z
      }
    }
    this.mesh.geometry.getAttribute('position').needsUpdate = true
    const glow = 0.85 + 0.15 * Math.sin(kit.ctx.time * 4) + kick * 0.9
    this.mesh.material.color.copy(this.color).multiplyScalar(glow)
  }

  clear(): void {
    this.pulse = PULSE
  }

  dispose(): void {
    this.kit.ctx.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
