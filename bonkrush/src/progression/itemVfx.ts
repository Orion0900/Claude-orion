/**
 * Instanced visuals for item effects: Pocket Cactus spikes, Storm Orb bolts,
 * Soul Reaper souls and Toxic Barrel clouds. Each kind is one InstancedMesh
 * (one draw call) whose matrices are rewritten every frame for the live ones.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const UP = new THREE.Vector3(0, 1, 0)
const FORWARD = new THREE.Vector3(0, 0, 1)
const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

const SPIKE_LIFE = 0.3
const BOLT_LIFE = 0.18

/** One InstancedMesh drawing up to `max` copies; its owner rewrites the matrices every frame. */
export class InstancePool {
  readonly mesh: THREE.InstancedMesh
  private n = 0

  constructor(
    private readonly scene: THREE.Scene,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    readonly max: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Instances roam the whole map, so the base geometry's bounds mean nothing.
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.visible = false
    scene.add(this.mesh)
  }

  begin(): void {
    this.n = 0
  }

  push(matrix: THREE.Matrix4): void {
    if (this.n < this.max) this.mesh.setMatrixAt(this.n++, matrix)
  }

  end(): void {
    const mesh = this.mesh
    mesh.count = this.n
    mesh.visible = this.n > 0
    if (this.n === 0) return
    const attr = mesh.instanceMatrix
    attr.clearUpdateRanges()
    attr.addUpdateRange(0, this.n * 16)
    attr.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}

interface Spike {
  active: boolean
  t: number
  reach: number
  origin: THREE.Vector3
  dir: THREE.Vector3
  quat: THREE.Quaternion
}

interface Bolt {
  active: boolean
  t: number
  width: number
  len: number
  mid: THREE.Vector3
  quat: THREE.Quaternion
}

export class ItemVfx {
  readonly spikes: InstancePool
  readonly bolts: InstancePool
  readonly souls: InstancePool
  readonly clouds: InstancePool
  private readonly spikeList: Spike[] = []
  private readonly boltList: Bolt[] = []

  constructor(scene: THREE.Scene) {
    this.spikes = new InstancePool(
      scene,
      merge([
        tint(new THREE.ConeGeometry(0.2, 0.8, 5).translate(0, 0.1, 0), '#3f9e3a'),
        tint(new THREE.ConeGeometry(0.1, 0.45, 5).translate(0, 0.55, 0), '#f3ffd6'),
      ]),
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      64,
    )
    this.bolts = new InstancePool(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#fff7a8' }),
      96,
    )
    this.souls = new InstancePool(
      scene,
      merge([
        tint(new THREE.IcosahedronGeometry(0.3, 0), '#aefcff'),
        tint(new THREE.OctahedronGeometry(0.2, 0).translate(0, 0, -0.28), '#5fd8ff'),
      ]),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
      128,
    )
    this.clouds = new InstancePool(
      scene,
      new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({
        color: '#8dff5a',
        emissive: '#1f5a10',
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        flatShading: true,
      }),
      12,
    )
    for (let i = 0; i < this.spikes.max; i++)
      this.spikeList.push({
        active: false,
        t: 0,
        reach: 0,
        origin: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
      })
    for (let i = 0; i < this.bolts.max; i++)
      this.boltList.push({ active: false, t: 0, width: 0, len: 0, mid: new THREE.Vector3(), quat: new THREE.Quaternion() })
  }

  /** A ring of spikes shooting outward from `center` to `reach` metres. */
  addSpikes(center: THREE.Vector3, count: number, reach: number): void {
    const offset = Math.random() * Math.PI * 2
    for (let i = 0; i < count; i++) {
      const s = this.free(this.spikeList)
      if (!s) return
      const a = offset + (i / count) * Math.PI * 2
      s.active = true
      s.t = 0
      s.reach = reach
      s.origin.copy(center)
      s.dir.set(Math.cos(a), 0, Math.sin(a))
      s.quat.setFromUnitVectors(UP, s.dir)
    }
  }

  /** A jagged bolt from `from` to `to` in three segments. */
  addLightning(from: THREE.Vector3, to: THREE.Vector3, width = 0.22): void {
    _a.copy(from)
    for (let i = 1; i <= 3; i++) {
      if (i < 3) {
        _b.lerpVectors(from, to, i / 3)
        _b.x += (Math.random() - 0.5) * 1.2
        _b.y += (Math.random() - 0.5) * 0.8
        _b.z += (Math.random() - 0.5) * 1.2
      } else _b.copy(to)
      this.addBolt(_a, _b, width)
      _a.copy(_b)
    }
  }

  addBolt(from: THREE.Vector3, to: THREE.Vector3, width: number): void {
    _dir.subVectors(to, from)
    const len = _dir.length()
    if (len < 1e-3) return
    const b = this.free(this.boltList)
    if (!b) return
    b.active = true
    b.t = 0
    b.width = width
    b.len = len
    b.mid.addVectors(from, to).multiplyScalar(0.5)
    b.quat.setFromUnitVectors(FORWARD, _dir.multiplyScalar(1 / len))
  }

  /** Advances and redraws the spikes and bolts. Souls and clouds are drawn by their owner. */
  update(dt: number): void {
    this.spikes.begin()
    for (const s of this.spikeList) {
      if (!s.active) continue
      s.t += dt
      const p = s.t / SPIKE_LIFE
      if (p >= 1) {
        s.active = false
        continue
      }
      const eased = 1 - (1 - p) * (1 - p)
      _p.copy(s.origin).addScaledVector(s.dir, 0.5 + s.reach * eased)
      const k = 1.3 * (1 - 0.5 * p)
      _s.set(k, k, k)
      this.spikes.push(_m.compose(_p, s.quat, _s))
    }
    this.spikes.end()

    this.bolts.begin()
    for (const b of this.boltList) {
      if (!b.active) continue
      b.t += dt
      const k = 1 - b.t / BOLT_LIFE
      if (k <= 0) {
        b.active = false
        continue
      }
      _s.set(b.width * k, b.width * k, b.len)
      this.bolts.push(_m.compose(b.mid, b.quat, _s))
    }
    this.bolts.end()
  }

  clear(): void {
    for (const s of this.spikeList) s.active = false
    for (const b of this.boltList) b.active = false
    for (const pool of [this.spikes, this.bolts, this.souls, this.clouds]) {
      pool.begin()
      pool.end()
    }
  }

  dispose(): void {
    this.spikes.dispose()
    this.bolts.dispose()
    this.souls.dispose()
    this.clouds.dispose()
  }

  private free<T extends { active: boolean }>(list: T[]): T | null {
    for (const x of list) if (!x.active) return x
    return null
  }
}

/** Flat vertex colour on a non-indexed copy, so differently coloured parts merge into one mesh. */
function tint(geo: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g !== geo) geo.dispose()
  g.deleteAttribute('uv')
  const c = new THREE.Color(color)
  const arr = new Float32Array(g.getAttribute('position').count * 3)
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = c.r
    arr[i + 1] = c.g
    arr[i + 2] = c.b
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3))
  return g
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts)
  if (!merged) return parts[0]
  for (const p of parts) p.dispose()
  return merged
}
