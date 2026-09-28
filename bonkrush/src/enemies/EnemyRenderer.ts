/**
 * Draws every enemy with one InstancedMesh per def, plus one instanced mesh
 * each for blob shadows and the elite ◆ markers. All enemy meshes share one
 * patched Lambert material, so the whole horde is a single shader program.
 *
 * The patch adds two things three.js lacks per instance: `aFx` (x = white-hot
 * hit flash, yzw = rim-light colour) and the per-vertex `aGlow` baked into
 * the models, which lets eyes and flames ignore lighting.
 */
import * as THREE from 'three'
import type { EnemyDef } from '../game/types'
import { animStyleOf, buildEnemyGeometry, type AnimStyle } from './EnemyModels'
import { emptyPose, poseFor, stepTime } from './anim'
import type { EnemyEntity } from './entity'

const HIT_FLASH_TIME = 0.12
const SPAWN_GROW_TIME = 0.35
const ELITE_RIM = [1.0, 0.72, 0.18] as const
const MINIBOSS_RIM = [1.0, 0.35, 0.15] as const

class Batch {
  readonly mesh: THREE.InstancedMesh
  readonly colors: THREE.InstancedBufferAttribute
  readonly fx: THREE.InstancedBufferAttribute
  readonly style: AnimStyle
  readonly capacity: number
  n = 0

  constructor(def: EnemyDef, material: THREE.Material, capacity: number) {
    const geo = buildEnemyGeometry(def)
    this.capacity = capacity
    this.fx = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    this.fx.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aFx', this.fx)
    this.mesh = new THREE.InstancedMesh(geo, material, capacity)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3)
    this.colors.setUsage(THREE.DynamicDrawUsage)
    this.mesh.instanceColor = this.colors
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.visible = false
    this.mesh.name = `enemies:${def.id}`
    this.style = animStyleOf(def.model)
  }
}

const _pos = new THREE.Vector3()
const _scl = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
const _mat = new THREE.Matrix4()
const _pose = emptyPose()
const _identity = new THREE.Quaternion()

export class EnemyRenderer {
  private readonly batches = new Map<string, Batch>()
  private readonly material: THREE.MeshLambertMaterial
  private readonly shadows: THREE.InstancedMesh
  private readonly markers: THREE.InstancedMesh
  private readonly shadowCap: number
  private readonly markerCap = 128

  constructor(private readonly scene: THREE.Scene, shadowCapacity: number) {
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    patchEnemyMaterial(this.material)

    this.shadowCap = shadowCapacity
    const blob = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2)
    this.shadows = new THREE.InstancedMesh(
      blob,
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      shadowCapacity,
    )
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.shadows.frustumCulled = false
    this.shadows.count = 0
    this.shadows.renderOrder = -1
    this.shadows.name = 'enemies:shadows'

    const diamond = new THREE.OctahedronGeometry(0.22, 0).scale(1, 1.5, 1)
    this.markers = new THREE.InstancedMesh(diamond, new THREE.MeshBasicMaterial({ color: '#ffd23f' }), this.markerCap)
    this.markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.markers.frustumCulled = false
    this.markers.count = 0
    this.markers.name = 'enemies:elite-markers'

    scene.add(this.shadows, this.markers)
  }

  /** Builds the mesh for a def ahead of time (stage start), so the first spawn doesn't hitch. */
  prepare(def: EnemyDef, capacity: number): void {
    if (this.batches.has(def.id)) return
    const batch = new Batch(def, this.material, capacity)
    this.batches.set(def.id, batch)
    this.scene.add(batch.mesh)
  }

  capacityOf(defId: string): number {
    return this.batches.get(defId)?.capacity ?? 0
  }

  /** Writes every living enemy's instance for this frame. */
  render(list: readonly EnemyEntity[], time: number): void {
    for (const b of this.batches.values()) b.n = 0
    let shadows = 0
    let markers = 0
    const stepped = stepTime(time)

    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if (!e.alive) continue
      const b = this.batches.get(e.def.id)
      if (!b || b.n >= b.capacity) continue
      const k = b.n++

      const moving = e.freeze > 0 ? 0 : Math.min(1, Math.hypot(e.vel.x, e.vel.z) / Math.max(0.5, e.def.speed))
      const pose = e.freeze > 0 ? poseFor(b.style, 0, 0, 0, _pose) : poseFor(b.style, time, e.phase, moving, _pose)
      let grow = 1
      if (e.age < SPAWN_GROW_TIME) grow = 0.25 + 0.75 * (Math.floor((e.age / SPAWN_GROW_TIME) * 4) / 4)
      const h = e.def.height * e.scale * grow
      let sx = pose.sx
      let sy = pose.sy
      if (e.hitFlash < 0.1) {
        sx *= 1.12
        sy *= 0.86
      }
      // Wind-ups and armed fuses shake; purely cosmetic jitter.
      let jx = 0
      let jz = 0
      if (e.windup) {
        jx = (Math.random() - 0.5) * 0.12 * e.scale
        jz = (Math.random() - 0.5) * 0.12 * e.scale
      }
      _pos.set(e.pos.x + jx, e.pos.y + pose.bob * h, e.pos.z + jz)
      _euler.set(pose.pitch, e.yaw + Math.PI, pose.roll)
      _quat.setFromEuler(_euler)
      _scl.set(h * sx, h * sy, h * pose.sz)
      b.mesh.setMatrixAt(k, _mat.compose(_pos, _quat, _scl))

      writeTint(b.colors, k, e, stepped)
      writeFx(b.fx, k, e, time)

      if (shadows < this.shadowCap) {
        const r = e.radius * (e.flier ? 0.8 : 1.15) * grow
        _pos.set(e.pos.x, e.groundY + 0.06, e.pos.z)
        _scl.set(r, 1, r)
        this.shadows.setMatrixAt(shadows++, _mat.compose(_pos, _identity, _scl))
      }

      if (e.elite && markers < this.markerCap) {
        const bobble = Math.sin(stepped * 5 + e.phase) * 0.12
        _pos.set(e.pos.x, e.pos.y + h * (1 + pose.bob) + 0.55 + bobble, e.pos.z)
        _quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, stepped * 3 + e.phase)
        const s = 0.8 + 0.25 * e.scale
        _scl.set(s, s, s)
        this.markers.setMatrixAt(markers++, _mat.compose(_pos, _quat, _scl))
      }
    }

    for (const b of this.batches.values()) {
      b.mesh.count = b.n
      b.mesh.visible = b.n > 0
      if (b.n > 0) {
        markRange(b.mesh.instanceMatrix, b.n * 16)
        markRange(b.colors, b.n * 3)
        markRange(b.fx, b.n * 4)
      }
    }
    this.shadows.count = shadows
    this.shadows.visible = shadows > 0
    if (shadows > 0) markRange(this.shadows.instanceMatrix, shadows * 16)
    this.markers.count = markers
    this.markers.visible = markers > 0
    if (markers > 0) markRange(this.markers.instanceMatrix, markers * 16)
  }

  dispose(): void {
    for (const b of this.batches.values()) {
      this.scene.remove(b.mesh)
      b.mesh.geometry.dispose()
      b.mesh.dispose()
    }
    this.batches.clear()
    this.material.dispose()
    for (const m of [this.shadows, this.markers]) {
      this.scene.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
      m.dispose()
    }
  }
}

/** Frozen reads icy blue, slowed a cooler hue, burning a flickering orange; elites glow brighter. */
function writeTint(attr: THREE.InstancedBufferAttribute, k: number, e: EnemyEntity, stepped: number): void {
  let r = e.tintR
  let g = e.tintG
  let b = e.tintB
  if (e.elite) {
    r *= 1.15
    g *= 1.12
    b *= 1.05
  }
  if (e.freeze > 0) {
    r *= 0.55
    g *= 0.85
    b *= 1.7
  } else if (e.slow > 0) {
    r *= 0.75
    g *= 0.9
    b *= 1.3
  }
  if (e.burn > 0) {
    const f = Math.floor(stepped * 10 + e.phase * 7) % 2 ? 1.25 : 1.1
    r *= f
    g *= 0.85
    b *= 0.65
  }
  attr.setXYZ(k, r, g, b)
}

function writeFx(attr: THREE.InstancedBufferAttribute, k: number, e: EnemyEntity, time: number): void {
  let flash = e.hitFlash < HIT_FLASH_TIME ? 1 - e.hitFlash / HIT_FLASH_TIME : 0
  if (e.windup && Math.floor(time * 12) % 2 === 0) flash = Math.max(flash, e.tier === 'normal' ? 0.6 : 0.35)
  let rr = 0
  let rg = 0
  let rb = 0
  if (e.elite) {
    rr = ELITE_RIM[0]
    rg = ELITE_RIM[1]
    rb = ELITE_RIM[2]
  } else if (e.tier === 'miniboss') {
    rr = MINIBOSS_RIM[0] * 0.4
    rg = MINIBOSS_RIM[1] * 0.4
    rb = MINIBOSS_RIM[2] * 0.4
  } else if (e.tintR !== 1 || e.tintB !== 1) {
    rr = e.tintR * 0.35
    rg = e.tintG * 0.35
    rb = e.tintB * 0.35
  }
  if (e.burn > 0) {
    rr += 0.6
    rg += 0.22
  } else if (e.freeze > 0) {
    rr += 0.25
    rg += 0.6
    rb += 1.0
  }
  attr.setXYZW(k, flash, rr, rg, rb)
}

function markRange(attr: THREE.BufferAttribute, count: number): void {
  attr.clearUpdateRanges()
  attr.addUpdateRange(0, count)
  attr.needsUpdate = true
}

/**
 * Adds per-instance hit flash and rim light, and per-vertex glow, to a Lambert
 * material. Exported so previews and tests can build the same look.
 */
export function patchEnemyMaterial(mat: THREE.MeshLambertMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aGlow;\nattribute vec4 aFx;\nvarying float vGlow;\nvarying vec4 vFx;',
      )
      .replace('#include <color_vertex>', '#include <color_vertex>\n\tvGlow = aGlow;\n\tvFx = aFx;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nvarying vec4 vFx;')
      .replace(
        '#include <opaque_fragment>',
        [
          'float bkFacing = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );',
          'float bkRim = 1.0 - bkFacing;',
          'outgoingLight = mix( outgoingLight, diffuseColor.rgb * 1.15, vGlow );',
          'outgoingLight += vFx.yzw * ( bkRim * bkRim * bkRim * 1.6 + 0.02 );',
          'outgoingLight = mix( outgoingLight, vec3( 1.0, 0.97, 0.9 ), vFx.x );',
          '#include <opaque_fragment>',
        ].join('\n'),
      )
  }
  mat.customProgramCacheKey = () => 'bonkrush-enemy'
}
