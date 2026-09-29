import * as THREE from 'three'
import { shrinkOut } from './fxMath'

const MAX_PARTICLES = 2000
const GRAVITY = 20
/** Fraction of speed lost per second to air. */
const DRAG = 1.2
const BOUNCE = 0.35

/**
 * Chunky low-poly debris from one pooled InstancedMesh: a single draw call
 * however many are flying. State lives in flat typed arrays and dead
 * particles swap with the last live one, so the live set is always the
 * front of the arrays and `mesh.count` covers exactly it.
 */
export class Particles {
  readonly mesh: THREE.InstancedMesh
  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.MeshBasicMaterial
  private readonly matrices: Float32Array
  private readonly colors: Float32Array
  private readonly pos = new Float32Array(MAX_PARTICLES * 3)
  private readonly vel = new Float32Array(MAX_PARTICLES * 3)
  private readonly rot = new Float32Array(MAX_PARTICLES * 2)
  private readonly spin = new Float32Array(MAX_PARTICLES * 2)
  /** Seconds left. */
  private readonly life = new Float32Array(MAX_PARTICLES)
  private readonly maxLife = new Float32Array(MAX_PARTICLES)
  private readonly size = new Float32Array(MAX_PARTICLES)
  private readonly ground = new Float32Array(MAX_PARTICLES)
  private alive = 0
  /** When the pool is full, new particles overwrite slots round-robin. */
  private recycle = 0

  constructor(private readonly scene: THREE.Scene) {
    this.geometry = debrisGeometry()
    // Unlit: the facet shading is baked into vertex colours, so debris stays
    // bright in every stage's lighting and costs no light maths.
    this.material = new THREE.MeshBasicMaterial({ vertexColors: true })
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_PARTICLES)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3)
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    mesh.name = 'fx-particles'
    this.matrices = mesh.instanceMatrix.array as Float32Array
    this.colors = mesh.instanceColor.array as Float32Array
    this.mesh = mesh
    scene.add(mesh)
  }

  get count(): number {
    return this.alive
  }

  /**
   * Throws `count` particles out of (x, y, z), mostly upward, bouncing on a
   * flat floor at `ground`.
   */
  emit(x: number, y: number, z: number, ground: number, color: THREE.Color, count: number, speed: number, size: number): void {
    for (let n = 0; n < count; n++) {
      let i: number
      if (this.alive < MAX_PARTICLES) i = this.alive++
      else {
        i = this.recycle
        this.recycle = (this.recycle + 1) % MAX_PARTICLES
      }
      // A random direction on the sphere, folded upward so bursts fountain.
      const u = Math.random() * 2 - 1
      const theta = Math.random() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      const sp = speed * (0.45 + Math.random() * 0.75)
      const i3 = i * 3
      this.pos[i3] = x + (Math.random() - 0.5) * 0.3
      this.pos[i3 + 1] = y + Math.random() * 0.3
      this.pos[i3 + 2] = z + (Math.random() - 0.5) * 0.3
      this.vel[i3] = r * Math.cos(theta) * sp
      this.vel[i3 + 1] = (Math.abs(u) * 0.9 + 0.35) * sp
      this.vel[i3 + 2] = r * Math.sin(theta) * sp
      this.rot[i * 2] = Math.random() * Math.PI * 2
      this.rot[i * 2 + 1] = Math.random() * Math.PI * 2
      this.spin[i * 2] = (Math.random() * 2 - 1) * 12
      this.spin[i * 2 + 1] = (Math.random() * 2 - 1) * 12
      const life = 0.45 + Math.random() * 0.5
      this.life[i] = life
      this.maxLife[i] = life
      this.size[i] = size * (0.6 + Math.random() * 0.8)
      this.ground[i] = ground
      const shade = 0.85 + Math.random() * 0.3
      this.colors[i3] = color.r * shade
      this.colors[i3 + 1] = color.g * shade
      this.colors[i3 + 2] = color.b * shade
      this.writeMatrix(i, 0)
    }
    this.flush(true)
  }

  update(dt: number): void {
    if (!(dt > 0) || this.alive === 0) return
    const drag = Math.max(0, 1 - DRAG * dt)
    let recolored = false
    for (let i = 0; i < this.alive; ) {
      this.life[i] -= dt
      if (this.life[i] <= 0) {
        this.removeAt(i)
        recolored = true
        continue
      }
      const i3 = i * 3
      this.vel[i3 + 1] -= GRAVITY * dt
      this.vel[i3] *= drag
      this.vel[i3 + 1] *= drag
      this.vel[i3 + 2] *= drag
      this.pos[i3] += this.vel[i3] * dt
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt
      const floor = this.ground[i] + this.size[i] * 0.5
      if (this.pos[i3 + 1] < floor) {
        this.pos[i3 + 1] = floor
        if (this.vel[i3 + 1] < 0) this.vel[i3 + 1] *= -BOUNCE
        this.vel[i3] *= 0.7
        this.vel[i3 + 2] *= 0.7
        this.spin[i * 2] *= 0.8
        this.spin[i * 2 + 1] *= 0.8
      }
      this.rot[i * 2] += this.spin[i * 2] * dt
      this.rot[i * 2 + 1] += this.spin[i * 2 + 1] * dt
      this.writeMatrix(i, 1 - this.life[i] / this.maxLife[i])
      i++
    }
    this.flush(recolored)
  }

  clear(): void {
    this.alive = 0
    this.recycle = 0
    this.mesh.count = 0
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.dispose()
    this.geometry.dispose()
    this.material.dispose()
  }

  /** Scale × rotation (yaw then pitch, from two spin angles) × translation, written in place. */
  private writeMatrix(i: number, t: number): void {
    const s = this.size[i] * shrinkOut(t)
    const a = this.rot[i * 2]
    const b = this.rot[i * 2 + 1]
    const ca = Math.cos(a) * s
    const sa = Math.sin(a) * s
    const cb = Math.cos(b)
    const sb = Math.sin(b)
    const m = this.matrices
    const o = i * 16
    const i3 = i * 3
    m[o] = ca
    m[o + 1] = 0
    m[o + 2] = -sa
    m[o + 3] = 0
    m[o + 4] = sa * sb
    m[o + 5] = cb * s
    m[o + 6] = ca * sb
    m[o + 7] = 0
    m[o + 8] = sa * cb
    m[o + 9] = -sb * s
    m[o + 10] = ca * cb
    m[o + 11] = 0
    m[o + 12] = this.pos[i3]
    m[o + 13] = this.pos[i3 + 1]
    m[o + 14] = this.pos[i3 + 2]
    m[o + 15] = 1
  }

  private removeAt(i: number): void {
    const last = --this.alive
    if (i === last) return
    const i3 = i * 3
    const l3 = last * 3
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[l3 + k]
      this.vel[i3 + k] = this.vel[l3 + k]
      this.colors[i3 + k] = this.colors[l3 + k]
    }
    this.rot[i * 2] = this.rot[last * 2]
    this.rot[i * 2 + 1] = this.rot[last * 2 + 1]
    this.spin[i * 2] = this.spin[last * 2]
    this.spin[i * 2 + 1] = this.spin[last * 2 + 1]
    this.life[i] = this.life[last]
    this.maxLife[i] = this.maxLife[last]
    this.size[i] = this.size[last]
    this.ground[i] = this.ground[last]
  }

  /** Uploads only the live front of the instance buffers. */
  private flush(colors: boolean): void {
    const mesh = this.mesh
    mesh.count = this.alive
    if (this.alive === 0) return
    const matrix = mesh.instanceMatrix
    matrix.clearUpdateRanges()
    matrix.addUpdateRange(0, this.alive * 16)
    matrix.needsUpdate = true
    const color = mesh.instanceColor
    if (colors && color) {
      color.clearUpdateRanges()
      color.addUpdateRange(0, this.alive * 3)
      color.needsUpdate = true
    }
  }
}

/** A tetrahedron with per-face shading baked into vertex colours, so it reads as faceted without lights. */
function debrisGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.TetrahedronGeometry(1, 0)
  const faces = geometry.getAttribute('position').count / 3
  const shades = [1, 0.78, 0.62, 0.9]
  const colors = new Float32Array(faces * 9)
  for (let f = 0; f < faces; f++) {
    const shade = shades[f % shades.length]
    for (let v = 0; v < 9; v++) colors[f * 9 + v] = shade
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.deleteAttribute('uv')
  geometry.deleteAttribute('normal')
  return geometry
}
