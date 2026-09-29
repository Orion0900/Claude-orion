/**
 * Ground warnings for enemy attacks: circles and lanes that fill up until
 * the moment of impact, plus one-frame draws for things that move (expanding
 * shockwave rings, sweeping beams). Everything is instanced: five meshes
 * draw every telegraph on screen.
 *
 * Decals ignore depth so a warning half-buried in a hillside still reads;
 * they are translucent, so drawing over a character is harmless.
 */
import * as THREE from 'three'

const CAP = 96
const BEAM_CAP = 8

const KIND_CIRCLE = 0
const KIND_LANE = 1
const KIND_WAVE = 2
const KIND_BEAM = 3

class Decal {
  kind = KIND_CIRCLE
  x = 0
  y = 0
  z = 0
  radius = 1
  width = 1
  height = 1
  dirX = 0
  dirZ = 1
  t = 0
  dur = 1
  r = 1
  g = 0.2
  b = 0.2
  owner = 0
}

const _pos = new THREE.Vector3()
const _scl = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _mat = new THREE.Matrix4()
const _col = new THREE.Color()
const UP = new THREE.Vector3(0, 1, 0)

function overlay(opacity: number, solid = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity,
    depthWrite: false,
    // Ground decals ignore depth; beams are real 3D shapes and only show their outside,
    // so a camera that ends up inside one isn't blinded.
    depthTest: solid,
    side: solid ? THREE.FrontSide : THREE.DoubleSide,
    fog: false,
  })
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, order: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, cap)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.renderOrder = order
  mesh.count = 0
  mesh.visible = false
  return mesh
}

export class Telegraphs {
  private readonly live: Decal[] = []
  private readonly free: Decal[] = []
  private readonly outline: THREE.InstancedMesh
  private readonly fill: THREE.InstancedMesh
  private readonly laneBack: THREE.InstancedMesh
  private readonly laneFill: THREE.InstancedMesh
  private readonly beams: THREE.InstancedMesh
  private readonly meshes: THREE.InstancedMesh[]

  constructor(private readonly scene: THREE.Scene) {
    const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2)
    // Lanes run from their origin along +Z for one unit.
    const lane = () => flat(new THREE.PlaneGeometry(1, 1)).translate(0, 0, 0.5)
    this.outline = instanced(flat(new THREE.RingGeometry(0.9, 1, 48)), overlay(0.85), CAP, 6)
    this.fill = instanced(flat(new THREE.CircleGeometry(1, 40)), overlay(0.34), CAP, 5)
    this.laneBack = instanced(lane(), overlay(0.2), CAP, 5)
    this.laneFill = instanced(lane(), overlay(0.4), CAP, 6)
    this.beams = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0.5), overlay(0.72, true), BEAM_CAP, 7)
    this.meshes = [this.outline, this.fill, this.laneBack, this.laneFill, this.beams]
    for (const m of this.meshes) {
      m.name = 'enemies:telegraphs'
      scene.add(m)
    }
  }

  /** A circle that fills over `duration` seconds, the moment something lands there. */
  circle(x: number, y: number, z: number, radius: number, duration: number, color: string, owner = 0): void {
    const d = this.take(KIND_CIRCLE, x, y, z, duration, color, owner)
    d.radius = radius
  }

  /** A lane from (x, z) along (dirX, dirZ) that fills from its origin to its end over `duration`. */
  lane(x: number, y: number, z: number, dirX: number, dirZ: number, length: number, width: number, duration: number, color: string, owner = 0): void {
    const d = this.take(KIND_LANE, x, y, z, duration, color, owner)
    const l = Math.hypot(dirX, dirZ) || 1
    d.dirX = dirX / l
    d.dirZ = dirZ / l
    d.radius = length
    d.width = width
  }

  /** A ring band drawn this frame only (a travelling shockwave). */
  wave(x: number, y: number, z: number, radius: number, color: string): void {
    const d = this.take(KIND_WAVE, x, y, z, 0, color, 0)
    d.radius = radius
  }

  /** A glowing beam drawn this frame only. */
  beam(x: number, y: number, z: number, dirX: number, dirZ: number, length: number, width: number, height: number, color: string): void {
    const d = this.take(KIND_BEAM, x, y, z, 0, color, 0)
    const l = Math.hypot(dirX, dirZ) || 1
    d.dirX = dirX / l
    d.dirZ = dirZ / l
    d.radius = length
    d.width = width
    d.height = height
  }

  /** Drops an owner's pending warnings (it died mid-attack). */
  removeOwner(owner: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i].owner === owner) this.release(i)
    }
  }

  /** Draws everything, then ages it; one-frame draws disappear after this. */
  update(dt: number): void {
    let nOutline = 0
    let nFill = 0
    let nBack = 0
    let nLane = 0
    let nBeam = 0
    for (const d of this.live) {
      const p = d.dur > 0 ? Math.min(1, d.t / d.dur) : 1
      // Brighten in the last moments so the impact timing reads.
      const hot = p > 0.85 ? 1.35 : 1
      _col.setRGB(d.r * hot, d.g * hot, d.b * hot)
      switch (d.kind) {
        case KIND_CIRCLE:
          if (nOutline < CAP) this.put(this.outline, nOutline++, d.x, d.y, d.z, d.radius, 1, d.radius, _col)
          if (nFill < CAP) {
            const r = Math.max(0.05, d.radius * easeOut(p))
            this.put(this.fill, nFill++, d.x, d.y + 0.01, d.z, r, 1, r, _col)
          }
          break
        case KIND_WAVE:
          if (nOutline < CAP) this.put(this.outline, nOutline++, d.x, d.y, d.z, d.radius, 1, d.radius, _col)
          break
        case KIND_LANE:
          if (nBack < CAP) this.putDir(this.laneBack, nBack++, d, d.width, 1, d.radius)
          if (nLane < CAP) this.putDir(this.laneFill, nLane++, d, d.width * 0.92, 1, Math.max(0.05, d.radius * p))
          break
        case KIND_BEAM:
          if (nBeam < BEAM_CAP) this.putDir(this.beams, nBeam++, d, d.width, d.height, d.radius)
          break
      }
    }
    this.finish(this.outline, nOutline)
    this.finish(this.fill, nFill)
    this.finish(this.laneBack, nBack)
    this.finish(this.laneFill, nLane)
    this.finish(this.beams, nBeam)

    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i]
      d.t += dt
      if (d.t >= d.dur) this.release(i)
    }
  }

  clear(): void {
    while (this.live.length) this.release(this.live.length - 1)
    for (const m of this.meshes) this.finish(m, 0)
  }

  dispose(): void {
    for (const m of this.meshes) {
      this.scene.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
      m.dispose()
    }
    this.live.length = 0
    this.free.length = 0
  }

  private take(kind: number, x: number, y: number, z: number, duration: number, color: string, owner: number): Decal {
    const d = this.free.pop() ?? new Decal()
    d.kind = kind
    d.x = x
    d.y = y + 0.08
    d.z = z
    d.t = 0
    d.dur = Math.max(0, duration)
    d.owner = owner
    _col.set(color)
    d.r = _col.r
    d.g = _col.g
    d.b = _col.b
    this.live.push(d)
    return d
  }

  private release(i: number): void {
    const d = this.live[i]
    const last = this.live.pop() as Decal
    if (i < this.live.length) this.live[i] = last
    this.free.push(d)
  }

  private put(mesh: THREE.InstancedMesh, k: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, col: THREE.Color): void {
    _pos.set(x, y, z)
    _quat.identity()
    _scl.set(sx, sy, sz)
    mesh.setMatrixAt(k, _mat.compose(_pos, _quat, _scl))
    mesh.setColorAt(k, col)
  }

  private putDir(mesh: THREE.InstancedMesh, k: number, d: Decal, sx: number, sy: number, sz: number): void {
    _pos.set(d.x, d.y, d.z)
    _quat.setFromAxisAngle(UP, Math.atan2(d.dirX, d.dirZ))
    _scl.set(sx, sy, sz)
    mesh.setMatrixAt(k, _mat.compose(_pos, _quat, _scl))
    mesh.setColorAt(k, _col)
  }

  private finish(mesh: THREE.InstancedMesh, n: number): void {
    mesh.count = n
    mesh.visible = n > 0
    if (n === 0) return
    mesh.instanceMatrix.clearUpdateRanges()
    mesh.instanceMatrix.addUpdateRange(0, n * 16)
    mesh.instanceMatrix.needsUpdate = true
    const c = mesh.instanceColor as THREE.InstancedBufferAttribute
    c.clearUpdateRanges()
    c.addUpdateRange(0, n * 3)
    c.needsUpdate = true
  }
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p)
}
