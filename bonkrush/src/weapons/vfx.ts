/**
 * Cosmetic effects every weapon shares: embers and sparks, expanding blast
 * shells and lightning segments. Each kind is one additive InstancedMesh.
 * Randomness here is purely visual, so it uses Math.random.
 */
import * as THREE from 'three'
import type { Vec3 } from '../game/types'
import { blastGeometry, boltGeometry, emberGeometry, glowMaterial } from './models'
import { InstancePool, pooled, type Pooled } from './pool'

const Z_AXIS = new THREE.Vector3(0, 0, 1)
const WHITE = new THREE.Color(1, 1, 1)
const _e = new THREE.Euler()
const _d = new THREE.Vector3()

interface Ember extends Pooled {
  readonly vel: THREE.Vector3
  readonly color: THREE.Color
  life: number
  max: number
  size: number
  gravity: number
  drag: number
}

export class Embers {
  private readonly pool: InstancePool<Ember>

  constructor(scene: THREE.Scene, capacity: number) {
    this.pool = new InstancePool<Ember>(
      scene,
      emberGeometry(),
      glowMaterial(),
      capacity,
      () => ({ ...pooled(), vel: new THREE.Vector3(), color: new THREE.Color(), life: 0, max: 1, size: 0.1, gravity: 0, drag: 0 }),
      true,
    )
  }

  /** One particle with an explicit velocity (trails, sparks). Negative gravity rises. */
  spark(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    size: number,
    life: number,
    gravity = 0,
    drag = 1.5,
  ): void {
    const p = this.pool.spawn()
    if (!p) return
    p.pos.set(x, y, z)
    p.vel.set(vx, vy, vz)
    p.color.copy(color)
    p.tint.copy(color)
    p.size = size
    p.life = p.max = Math.max(0.01, life)
    p.gravity = gravity
    p.drag = drag
    p.scale.setScalar(size)
    p.quat.setFromEuler(_e.set(Math.random() * 6.28, Math.random() * 6.28, 0))
  }

  /** A spray of particles thrown out of `pos`, biased upward. */
  burst(pos: Vec3, color: THREE.Color, count: number, speed: number, size: number, life: number, gravity = 9): void {
    for (let i = 0; i < count; i++) {
      _d.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize()
      const s = speed * (0.45 + Math.random() * 0.55)
      this.spark(
        pos.x,
        pos.y,
        pos.z,
        _d.x * s,
        _d.y * s,
        _d.z * s,
        color,
        size * (0.6 + Math.random() * 0.6),
        life * (0.6 + Math.random() * 0.6),
        gravity,
      )
    }
  }

  update(dt: number): void {
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      p.life -= dt
      if (p.life <= 0) {
        this.pool.removeAt(i)
        continue
      }
      p.vel.y -= p.gravity * dt
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt))
      p.pos.addScaledVector(p.vel, dt)
      const k = p.life / p.max
      p.tint.copy(p.color).multiplyScalar(k)
      p.scale.setScalar(p.size * (0.35 + 0.65 * k))
    }
    this.pool.sync()
  }

  clear(): void {
    this.pool.clear()
    this.pool.sync()
  }

  dispose(): void {
    this.pool.dispose()
  }
}

interface Blast extends Pooled {
  readonly color: THREE.Color
  age: number
  dur: number
  radius: number
  flat: number
}

/** Expanding glowing shells for explosions and novas. */
export class Blasts {
  private readonly pool: InstancePool<Blast>

  constructor(scene: THREE.Scene, capacity: number) {
    this.pool = new InstancePool<Blast>(
      scene,
      blastGeometry(),
      glowMaterial(),
      capacity,
      () => ({ ...pooled(), color: new THREE.Color(), age: 0, dur: 0.3, radius: 1, flat: 1 }),
      true,
    )
  }

  /** `flat` squashes the shell vertically (0.25 reads as a ground nova). */
  spawn(pos: Vec3, radius: number, color: THREE.Color, dur = 0.3, flat = 1): void {
    const b = this.pool.spawn()
    if (!b) return
    b.pos.copy(pos)
    b.color.copy(color)
    b.age = 0
    b.dur = Math.max(0.05, dur)
    b.radius = radius
    b.flat = flat
    b.quat.setFromEuler(_e.set(Math.random() * 6.28, Math.random() * 6.28, 0))
    b.scale.setScalar(0.001)
    b.tint.setRGB(0, 0, 0)
  }

  update(dt: number): void {
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]
      b.age += dt
      const p = b.age / b.dur
      if (p >= 1) {
        this.pool.removeAt(i)
        continue
      }
      const grow = 1 - (1 - p) * (1 - p) * (1 - p)
      const s = b.radius * (0.25 + 0.75 * grow)
      b.scale.set(s, s * b.flat, s)
      b.tint.copy(b.color).multiplyScalar(Math.pow(1 - p, 1.6) * 1.4)
    }
    this.pool.sync()
  }

  clear(): void {
    this.pool.clear()
    this.pool.sync()
  }

  dispose(): void {
    this.pool.dispose()
  }
}

interface Segment extends Pooled {
  readonly color: THREE.Color
  life: number
  max: number
  thick: number
}

/** Jagged, flickering lightning built from stretched boxes. */
export class Bolts {
  private readonly pool: InstancePool<Segment>
  private readonly points: THREE.Vector3[] = []

  constructor(scene: THREE.Scene, capacity: number) {
    this.pool = new InstancePool<Segment>(
      scene,
      boltGeometry(),
      glowMaterial(),
      capacity,
      () => ({ ...pooled(), color: new THREE.Color(), life: 0, max: 1, thick: 0.1 }),
      true,
    )
    for (let i = 0; i < 18; i++) this.points.push(new THREE.Vector3())
  }

  /** A bolt from `a` to `b`: a coloured glow with a white-hot core and a stray fork. */
  bolt(a: Vec3, b: Vec3, color: THREE.Color, thick: number, life: number, jag = 0.35): void {
    const len = a.distanceTo(b)
    if (len < 1e-3) return
    const n = Math.min(this.points.length - 3, Math.max(2, Math.ceil(len / 1.3)))
    const pts = this.points
    const wiggle = Math.min(1.4, (len / n) * jag * 2)
    pts[0].copy(a)
    for (let i = 1; i < n; i++) {
      pts[i].lerpVectors(a, b, i / n)
      pts[i].x += (Math.random() - 0.5) * wiggle
      pts[i].y += (Math.random() - 0.5) * wiggle
      pts[i].z += (Math.random() - 0.5) * wiggle
    }
    pts[n].copy(b)
    for (let i = 0; i < n; i++) {
      this.segment(pts[i], pts[i + 1], color, thick, life)
      this.segment(pts[i], pts[i + 1], WHITE, thick * 0.35, life)
    }
    if (n >= 3) {
      const from = pts[1 + Math.floor(Math.random() * (n - 2))]
      const fork = pts[n + 1].set(
        from.x + (Math.random() - 0.5) * wiggle * 2.5,
        from.y - Math.random() * wiggle,
        from.z + (Math.random() - 0.5) * wiggle * 2.5,
      )
      this.segment(from, fork, color, thick * 0.5, life * 0.7)
    }
  }

  private segment(p: THREE.Vector3, q: THREE.Vector3, color: THREE.Color, thick: number, life: number): void {
    _d.subVectors(q, p)
    const len = _d.length()
    if (len < 1e-4) return
    const s = this.pool.spawn()
    if (!s) return
    s.pos.addVectors(p, q).multiplyScalar(0.5)
    s.quat.setFromUnitVectors(Z_AXIS, _d.divideScalar(len))
    s.scale.set(thick, thick, len + thick * 0.5)
    s.color.copy(color)
    s.tint.copy(color)
    s.thick = thick
    s.life = s.max = Math.max(0.02, life)
  }

  update(dt: number): void {
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.life -= dt
      if (s.life <= 0) {
        this.pool.removeAt(i)
        continue
      }
      const k = s.life / s.max
      const flicker = 0.7 + Math.random() * 0.3
      s.tint.copy(s.color).multiplyScalar(k * flicker * 1.6)
      const t = s.thick * (0.4 + 0.6 * k)
      s.scale.x = t
      s.scale.y = t
    }
    this.pool.sync()
  }

  clear(): void {
    this.pool.clear()
    this.pool.sync()
  }

  dispose(): void {
    this.pool.dispose()
  }
}
