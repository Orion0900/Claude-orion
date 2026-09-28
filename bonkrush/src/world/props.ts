import * as THREE from 'three'
import type { StageDef } from '../game/types'
import { PLAY_LIMIT, type ColliderGrid } from './colliders'
import { buildCliffRock, buildPropModel, TUMBLEWEED_RADIUS } from './models'
import { hash2 } from './noise'
import type { PropGroup, PropInstance } from './scatter'
import type { HeightField } from './terrain'

/** Emissive strength of each glowing kind, and how hard it flickers (0 = steady pulse). */
const GLOW_STYLE: Record<string, { intensity: number; flicker: number }> = {
  candle: { intensity: 1.6, flicker: 1 },
  pumpkin: { intensity: 1.25, flicker: 0.6 },
  crypt: { intensity: 0.9, flicker: 0 },
}

/**
 * How a batch of props (one kind and variant) is split into map tiles, each
 * culled on its own. On screen, big batches split into quadrants and small
 * ones stay whole: a view across the map sees most tiles anyway, and a draw
 * call costs more than a few thousand triangles. Shadow casters are also
 * drawn into the shadow map from a finer grid of shadow-only tiles, since
 * the shadow camera covers just ±22 m around the player, so only the one to
 * four tiles under it are drawn instead of the whole map.
 */
export function tilesFor(triangles: number): { view: number; shadow: number } {
  return {
    view: triangles >= VIEW_SPLIT_TRIANGLES ? 2 : 1,
    shadow: triangles >= SHADOW_SPLIT_TRIANGLES ? SHADOW_TILES : 0,
  }
}
const VIEW_SPLIT_TRIANGLES = 6000
const SHADOW_SPLIT_TRIANGLES = 2500
const SHADOW_TILES = 4

/** How much of a prop in the way the dither cuts out: a screen door, so the player shows through it. */
export const SEE_THROUGH = 0.7
/** Seconds a prop takes to fade out of the way, or back in. */
export const FADE_TIME = 0.15
/**
 * Clearance kept around the camera→player line, widening toward the lens,
 * since anything that close to the camera fills the screen.
 */
const LINE_MARGIN = 0.35
const LENS_MARGIN = 1.2
/** The line may pass this far over a prop's top and still count as blocked (its silhouette is lumpy). */
const TOP_MARGIN = 0.2

const BAYER_4X4 = '0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.'

/**
 * Adds the see-through dither to a prop material: each instance carries an
 * `aFade` (0 = solid, 1 = faded), and a faded instance discards pixels by
 * a 4×4 ordered dither. Cut-out pixels write no depth, so whatever is behind
 * shows through; the shadow pass uses its own material, so shadows stay.
 */
function addFade(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      #ifdef USE_INSTANCING
        attribute float aFade;
      #endif
      varying float vFade;`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vFade = aFade;
      #else
        vFade = 0.0;
      #endif`,
    )
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      varying float vFade;
      const float BAYER_4X4[16] = float[16](${BAYER_4X4});`,
    )
    .replace(
      '#include <clipping_planes_fragment>',
      `if (vFade > 0.0) {
        ivec2 cell = ivec2(mod(gl_FragCoord.xy, 4.0));
        if ((BAYER_4X4[cell.x + cell.y * 4] + 0.5) / 16.0 < vFade * ${SEE_THROUGH.toFixed(3)}) discard;
      }
      #include <clipping_planes_fragment>`,
    )
}

function fadeMaterial<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = addFade
  mat.customProgramCacheKey = () => 'bonk-prop-fade'
  return mat
}

/**
 * One tile of a batch of props. It culls by its box rather than its bounding
 * sphere: a tile is wide and flat, and the shadow camera is a long slanted
 * box, so the sphere test would keep drawing tiles well outside either.
 */
class PropTile extends THREE.InstancedMesh {
  private static readonly box = new THREE.Box3()
  /** Set on shadow-only tiles: the only frustum they are drawn for. */
  shadowOnly: THREE.Frustum | null = null

  override intersectsFrustum(frustum: THREE.Frustum | THREE.FrustumArray): boolean {
    if (this.shadowOnly && frustum !== this.shadowOnly) return false
    if (!this.boundingBox) this.computeBoundingBox()
    return frustum.intersectsBox(PropTile.box.copy(this.boundingBox!).applyMatrix4(this.matrixWorld))
  }
}

/** Swaying tops reach a little past their rest pose. */
const SWAY_MARGIN = 0.3

/** Widest reach from the model's own axis and its highest point, metres at scale 1. */
function measure(geo: THREE.BufferGeometry): { radius: number; top: number } {
  const pos = geo.getAttribute('position')
  let r2 = 0
  let top = 0
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v)
    const z = pos.getZ(v)
    r2 = Math.max(r2, x * x + z * z)
    top = Math.max(top, pos.getY(v))
  }
  return { radius: Math.sqrt(r2), top }
}

function triangles(geo: THREE.BufferGeometry): number {
  return (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3
}

/**
 * Draws the scattered props from merged vertex-coloured models: one
 * InstancedMesh per kind, variant and map tile (plus one for a model's
 * glowing part), and a ring of stretched boulders walling the map in.
 * Trees and flowers sway in the vertex shader, candles flicker, tumbleweeds
 * roll, and solid props between the camera and the player dither out of
 * the way.
 */
export class PropLayer {
  private readonly meshes: THREE.InstancedMesh[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly solidMat = this.own(fadeMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })))
  private readonly swayMats = new Map<number, THREE.MeshLambertMaterial>()
  private readonly swayTime = { value: 0 }
  private readonly flickers: Array<{ mat: THREE.MeshLambertMaterial; base: number; flicker: number; phase: number }> = []
  private tumble: Tumbleweeds | null = null
  private time = 0

  /** See-through state per solid, indexed like the collider grid. */
  private readonly fadeAttr: Array<THREE.InstancedBufferAttribute | undefined>
  private readonly fadeSlot: Int32Array
  private readonly fadeX: Float32Array
  private readonly fadeZ: Float32Array
  private readonly fadeR: Float32Array
  private readonly fadeTop: Float32Array
  private readonly fade: Float32Array
  /** The frame each solid was last found in the way. */
  private readonly wanted: Int32Array
  /** Solids that are faded, fading or wanted faded; everything else is left alone. */
  private readonly fading: number[] = []
  private readonly isFading: Uint8Array
  private readonly hits: number[] = []
  /** How far any solid's silhouette reaches past its collider. */
  private overhang = 0
  private frame = 0

  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ')
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private readonly c = new THREE.Color()

  constructor(
    private readonly root: THREE.Group,
    groups: readonly PropGroup[],
    walls: readonly PropInstance[],
    private readonly field: HeightField,
    palette: StageDef['palette'],
    private readonly colliders: ColliderGrid | null = null,
    /** The sun's shadow frustum (`LightShadow.getFrustum()`); without it casters shadow from their visible tiles. */
    private readonly shadowFrustum: THREE.Frustum | null = null,
  ) {
    const solids = colliders?.count ?? 0
    this.fadeAttr = new Array(solids)
    this.fadeSlot = new Int32Array(solids)
    this.fadeX = new Float32Array(solids)
    this.fadeZ = new Float32Array(solids)
    this.fadeR = new Float32Array(solids)
    this.fadeTop = new Float32Array(solids)
    this.fade = new Float32Array(solids)
    this.wanted = new Int32Array(solids)
    this.isFading = new Uint8Array(solids)

    // Rocks and walls take on the stage's stone colour, lightened a little so they read against the cliffs.
    const stone = new THREE.Color(palette.cliff).lerp(new THREE.Color('#9a9aa2'), 0.4).multiplyScalar(1.15)

    for (const group of groups) {
      if (group.instances.length === 0) continue
      if (group.kind === 'tumbleweed') {
        const model = buildPropModel('tumbleweed')
        this.geometries.push(model.body)
        // They roll all over the map, so one mesh that is never culled.
        const mesh = this.instanced(model.body, this.solidMat, group.instances.length, group.spec.castShadow)
        mesh.frustumCulled = false
        this.tumble = new Tumbleweeds(mesh, group.instances, field)
        continue
      }
      const variants = Math.max(1, group.spec.variants)
      for (let v = 0; v < variants; v++) {
        const list = group.instances.filter((p) => p.variant === v)
        if (list.length === 0) continue
        const model = buildPropModel(group.kind, v)
        this.geometries.push(model.body)
        const mat = group.spec.sway > 0 ? this.swayMaterial(group.spec.sway) : this.solidMat
        const tint = group.spec.tint === 'cliff' ? stone : null
        let glow: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null
        if (model.glow) {
          this.geometries.push(model.glow)
          glow = { geo: model.glow, mat: this.glowMaterial(group.kind, group.spec.glow) }
        }
        this.addBatch(model.body, list, mat, group.spec.castShadow, tint, glow, group.spec.radius)
      }
    }

    if (walls.length > 0) {
      const rock = buildCliffRock()
      this.geometries.push(rock)
      this.addBatch(rock, walls, this.solidMat, true, stone, null, 0)
    }
  }

  /** Draw calls this layer can issue at most (one per mesh), for budgeting. */
  get meshCount(): number {
    return this.meshes.length
  }

  update(dt: number): void {
    this.time += dt
    this.swayTime.value = this.time
    const t = this.time
    for (const f of this.flickers) {
      const wobble = f.flicker > 0
        ? 0.12 * Math.sin(t * 11 + f.phase) + 0.07 * Math.sin(t * 27.3 + f.phase * 2.1) + 0.04 * Math.sin(t * 5.1)
        : 0.15 * Math.sin(t * 1.3 + f.phase)
      f.mat.emissiveIntensity = f.base * (1 + wobble * (f.flicker > 0 ? f.flicker : 1))
    }
    this.tumble?.update(dt)
  }

  /**
   * Fades the solid props standing between the camera (`eye`) and the
   * player (`focus`, about chest height) and eases everything else back in.
   * With no eye or focus (the title screen) everything eases back in.
   * Only the collider cells along the line are looked at.
   */
  updateOcclusion(dt: number, eye: THREE.Vector3 | null, focus: THREE.Vector3 | null): void {
    const frame = ++this.frame
    if (eye && focus && this.colliders) this.markOccluders(eye, focus, frame)
    const step = dt / FADE_TIME
    const list = this.fading
    for (let n = list.length - 1; n >= 0; n--) {
      const id = list[n]
      const target = this.wanted[id] === frame ? 1 : 0
      const was = this.fade[id]
      const now = target > was ? Math.min(1, was + step) : Math.max(0, was - step)
      if (now !== was) {
        this.fade[id] = now
        const attr = this.fadeAttr[id]!
        attr.array[this.fadeSlot[id]] = now
        attr.needsUpdate = true
      }
      if (now === 0 && target === 0) {
        list[n] = list[list.length - 1]
        list.pop()
        this.isFading[id] = 0
      }
    }
  }

  /** How faded a solid is right now (0..1), by collider index. For tests and debugging. */
  fadeOf(collider: number): number {
    return this.fade[collider] ?? 0
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.root.remove(mesh)
      mesh.geometry.dispose()
      mesh.dispose()
    }
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    this.meshes.length = 0
    this.geometries.length = 0
    this.materials.length = 0
    this.swayMats.clear()
    this.flickers.length = 0
    this.fading.length = 0
    this.tumble = null
  }

  private markOccluders(eye: THREE.Vector3, focus: THREE.Vector3, frame: number): void {
    const ax = eye.x
    const az = eye.z
    const ex = focus.x - ax
    const ez = focus.z - az
    const len2 = ex * ex + ez * ez
    const hits = this.colliders!.querySegment(ax, az, focus.x, focus.z, this.overhang + LINE_MARGIN + LENS_MARGIN, this.hits)
    for (const id of hits) {
      if (!this.fadeAttr[id]) continue
      const cx = this.fadeX[id]
      const cz = this.fadeZ[id]
      const t = len2 > 1e-8 ? Math.max(0, Math.min(1, ((cx - ax) * ex + (cz - az) * ez) / len2)) : 0
      const dx = ax + ex * t - cx
      const dz = az + ez * t - cz
      const reach = this.fadeR[id] + LINE_MARGIN + LENS_MARGIN * (1 - t)
      if (dx * dx + dz * dz > reach * reach) continue
      // The view passes over anything whose top is below the line there.
      if (eye.y + (focus.y - eye.y) * t > this.fadeTop[id] + TOP_MARGIN) continue
      this.wanted[id] = frame
      if (!this.isFading[id]) {
        this.isFading[id] = 1
        this.fading.push(id)
      }
    }
  }

  /**
   * Draws `list` as one InstancedMesh per map tile it touches, plus the
   * glow part's. Solids (props with a collider) get a see-through slot.
   */
  private addBatch(
    body: THREE.BufferGeometry,
    list: readonly PropInstance[],
    mat: THREE.Material,
    castShadow: boolean,
    tint: THREE.Color | null,
    glow: { geo: THREE.BufferGeometry; mat: THREE.Material } | null,
    colliderRadius: number,
  ): void {
    const shape = measure(body)
    const tiles = tilesFor(triangles(body) * list.length)
    const shadowTiles = castShadow && this.shadowFrustum ? tiles.shadow : 0
    for (const tile of this.split(list, shadowTiles)) {
      const mesh = this.instanced(body, mat, tile.length, true)
      mesh.shadowOnly = this.shadowFrustum
      // Coloured like the visible tiles, so the prewarm compiles no extra program for them.
      this.fill(mesh, tile, tint)
    }
    for (const tile of this.split(list, tiles.view)) {
      // Body and glow share one fade attribute, so a crypt's windows fade with its walls.
      const fade = new THREE.InstancedBufferAttribute(new Float32Array(tile.length), 1)
      this.fill(this.instanced(body, mat, tile.length, castShadow && shadowTiles === 0, fade), tile, tint)
      if (glow) {
        const glowMesh = this.instanced(glow.geo, glow.mat, tile.length, false, fade)
        glowMesh.receiveShadow = false
        this.fill(glowMesh, tile, null, false)
      }
      tile.forEach((inst, i) => {
        const id = inst.collider
        if (id === undefined || id < 0 || id >= this.fadeAttr.length) return
        this.fadeAttr[id] = fade
        this.fadeSlot[id] = i
        this.fadeX[id] = inst.x
        this.fadeZ[id] = inst.z
        this.fadeR[id] = shape.radius * Math.max(inst.sx, inst.sz)
        this.fadeTop[id] = inst.y + shape.top * inst.sy
        this.overhang = Math.max(this.overhang, this.fadeR[id] - colliderRadius * inst.scale)
      })
    }
  }

  /** Buckets instances by map tile (`tiles` per side), dropping empty tiles; 0 tiles is none at all. */
  private split(list: readonly PropInstance[], tiles: number): PropInstance[][] {
    if (tiles <= 0) return []
    if (tiles === 1) return [list.slice()]
    const half = this.field.halfSize
    const size = (2 * half) / tiles
    const cell = (v: number) => Math.min(tiles - 1, Math.max(0, Math.floor((v + half) / size)))
    const buckets: PropInstance[][] = Array.from({ length: tiles * tiles }, () => [])
    for (const inst of list) buckets[cell(inst.z) * tiles + cell(inst.x)].push(inst)
    return buckets.filter((b) => b.length > 0)
  }

  /**
   * An InstancedMesh over a view of `source`: the vertex buffers are shared
   * (three uploads each attribute once), but every mesh gets its own
   * per-instance `aFade`, since the fade shader reads it on every prop.
   */
  private instanced(
    source: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    castShadow: boolean,
    fade = new THREE.InstancedBufferAttribute(new Float32Array(count), 1),
  ): PropTile {
    const geo = new THREE.BufferGeometry()
    for (const name of Object.keys(source.attributes)) geo.setAttribute(name, source.getAttribute(name))
    geo.setAttribute('aFade', fade)
    geo.boundingBox = source.boundingBox?.clone() ?? null
    geo.boundingSphere = source.boundingSphere?.clone() ?? null
    const mesh = new PropTile(geo, mat, count)
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    this.meshes.push(mesh)
    this.root.add(mesh)
    return mesh
  }

  /** Writes each instance's transform and a colour: the tint (or white) with a little brightness jitter. */
  private fill(mesh: THREE.InstancedMesh, list: readonly PropInstance[], tint: THREE.Color | null, colours = true): void {
    list.forEach((inst, i) => {
      this.e.set(inst.leanX, inst.yaw, inst.leanZ, 'YXZ')
      this.m.compose(this.p.set(inst.x, inst.y, inst.z), this.q.setFromEuler(this.e), this.s.set(inst.sx, inst.sy, inst.sz))
      mesh.setMatrixAt(i, this.m)
      if (colours) {
        const k = 0.88 + hash2(Math.round(inst.x * 10), Math.round(inst.z * 10), 5) * 0.2
        if (tint) this.c.copy(tint).multiplyScalar(k)
        else this.c.setScalar(k)
        mesh.setColorAt(i, this.c)
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Per tile, so each tile culls on its own in both the main and the shadow pass.
    mesh.computeBoundingSphere()
    mesh.computeBoundingBox()
    mesh.boundingBox?.expandByScalar(SWAY_MARGIN)
  }

  /** One emissive material per glowing kind and variant; each flickers on its own phase. */
  private glowMaterial(kind: string, glow: string | undefined): THREE.MeshLambertMaterial {
    const style = GLOW_STYLE[kind] ?? { intensity: 1.2, flicker: 0 }
    const mat = this.own(
      fadeMaterial(new THREE.MeshLambertMaterial({ color: 0x000000, emissive: glow ?? '#ffc05a', emissiveIntensity: style.intensity })),
    )
    this.flickers.push({ mat, base: style.intensity, flicker: style.flicker, phase: this.flickers.length * 2.3 })
    return mat
  }

  /**
   * Lambert plus a wind sway in the vertex shader: each instance leans by
   * `amount × height²`, phased by where it stands so a forest ripples
   * instead of nodding in unison. One material per amount, sharing a clock.
   */
  private swayMaterial(amount: number): THREE.MeshLambertMaterial {
    const cached = this.swayMats.get(amount)
    if (cached) return cached
    const mat = this.own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
    const time = this.swayTime
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSwayTime = time
      shader.vertexShader = 'uniform float uSwayTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swayPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
          float swayPhase = 0.0;
        #endif
        float swayH = max(transformed.y - 0.1, 0.0);
        float swayK = ${amount.toFixed(5)} * swayH * swayH;
        transformed.x += sin(uSwayTime * 1.3 + swayPhase) * swayK;
        transformed.z += cos(uSwayTime * 1.1 + swayPhase * 1.3) * swayK * 0.6;`,
      )
      addFade(shader)
    }
    mat.customProgramCacheKey = () => `bonk-prop-sway-${amount}`
    this.swayMats.set(amount, mat)
    return mat
  }

  private own<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat)
    return mat
  }
}

/**
 * Tumbleweeds bowl along with the wind, hopping and rolling over the dunes,
 * and wrap around to the far side when they reach the edge.
 */
class Tumbleweeds {
  private readonly x: Float32Array
  private readonly z: Float32Array
  private readonly scale: Float32Array
  private readonly speed: Float32Array
  private readonly roll: Float32Array
  private readonly hop: Float32Array
  private readonly wind = new THREE.Vector3(1, 0, 0.4).normalize()
  private readonly axis = new THREE.Vector3()
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  constructor(
    private readonly mesh: THREE.InstancedMesh,
    list: readonly PropInstance[],
    private readonly field: HeightField,
  ) {
    const n = list.length
    this.x = Float32Array.from(list, (p) => p.x)
    this.z = Float32Array.from(list, (p) => p.z)
    this.scale = Float32Array.from(list, (p) => p.scale)
    this.speed = Float32Array.from(list, (_, i) => 2.2 + hash2(i, 1, 9) * 2.6)
    this.roll = Float32Array.from(list, (_, i) => hash2(i, 2, 9) * 6)
    this.hop = Float32Array.from(list, (_, i) => hash2(i, 3, 9) * 6)
    // Rolling forward along the wind turns about up × wind.
    this.axis.set(this.wind.z, 0, -this.wind.x).normalize()
    for (let i = 0; i < n; i++) mesh.setColorAt(i, new THREE.Color().setScalar(0.9 + hash2(i, 4, 9) * 0.2))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    this.update(0)
  }

  update(dt: number): void {
    const lim = PLAY_LIMIT - 2
    for (let i = 0; i < this.x.length; i++) {
      const sc = this.scale[i]
      const r = TUMBLEWEED_RADIUS * sc
      let x = this.x[i] + this.wind.x * this.speed[i] * dt
      let z = this.z[i] + this.wind.z * this.speed[i] * dt
      if (x > lim) x -= 2 * lim
      if (z > lim) z -= 2 * lim
      this.x[i] = x
      this.z[i] = z
      this.roll[i] += (this.speed[i] / r) * dt
      this.hop[i] += this.speed[i] * 1.1 * dt
      const y = this.field.heightAt(x, z) + r + Math.abs(Math.sin(this.hop[i])) * 0.35 * sc
      this.q.setFromAxisAngle(this.axis, this.roll[i])
      this.mesh.setMatrixAt(i, this.m.compose(this.p.set(x, y, z), this.q, this.s.setScalar(sc)))
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
