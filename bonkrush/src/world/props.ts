import * as THREE from 'three'
import type { StageDef } from '../game/types'
import { PLAY_LIMIT, type ColliderGrid } from './colliders'
import { buildCliffRock, buildPropModel, TUMBLEWEED_RADIUS } from './models'
import { hash2 } from './noise'
import { blocksSight, lensInside, measureProfile, placedReach, sightMargin, type PlacedProfile, type Profile, type Sightline } from './occlusion'
import type { PropGroup, PropInstance } from './scatter'
import type { HeightField } from './terrain'

type XYZ = { readonly x: number; readonly y: number; readonly z: number }

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
  // On screen every batch stays whole: with a 400 m far plane and the quadrants
  // meeting at the start clearing, split view batches rarely culled and only
  // cost draw calls. Shadows are different: the sun's box is small, so the
  // biggest casters are tiled for it.
  return { view: 1, shadow: triangles >= SHADOW_SPLIT_TRIANGLES ? SHADOW_TILES : 0 }
}
const SHADOW_SPLIT_TRIANGLES = 10000
const SHADOW_TILES = 4

/** How much of a prop in the way the dither cuts out: a screen door, so the player shows through it. */
const SEE_THROUGH = 0.7
/** Seconds a prop takes to fade out of the way, or back in. */
export const FADE_TIME = 0.15
/** The part of the player the camera must see, metres above the feet. */
const SIGHT_LOW = 0.3
const SIGHT_HIGH = 1.7
/** Room kept clear either side of the view (about the player's half-width)... */
const LINE_MARGIN = 0.3
/** ...and near the lens, whatever is in view (a cone about 90° wide) over the first couple of metres. */
const LENS_SPREAD = 1
const LENS_REACH = 2.5
/**
 * A prop the lens is inside or brushing against would cover the whole view
 * in dither, so it fades all the way out instead.
 */
const LENS_CLEAR = 1.5
const FULL_FADE = 1 / SEE_THROUGH
/** Most props of one batch that can be see-through at once; a crowd past that just stays solid. */
export const FADE_SLOTS = 24

const BAYER_4X4 = '0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.'

/**
 * Adds the see-through dither to a prop material: each instance carries an
 * `aFade` (0 = solid, 1 = faded), and a faded instance discards pixels by
 * a 4×4 ordered dither. Cut-out pixels write no depth, so whatever is behind
 * shows through; the shadow pass uses its own material, so shadows stay.
 * A `discard` anywhere in a shader costs the GPU its early depth test, so
 * only the small see-through meshes use these materials.
 */
function addFade(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      attribute float aFade;
      varying float vFade;`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vFade = aFade;`,
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
      `{
        ivec2 bayerCell = ivec2(mod(gl_FragCoord.xy, 4.0));
        if ((BAYER_4X4[bayerCell.x + bayerCell.y * 4] + 0.5) / 16.0 < vFade * ${SEE_THROUGH.toFixed(3)}) discard;
      }
      #include <clipping_planes_fragment>`,
    )
}

/** Gives a plain prop material the see-through dither. */
function seeThrough<T extends THREE.Material>(mat: T): T {
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

/**
 * The see-through copies of one batch: while a solid is in the way it is
 * hidden in its tile (scaled to nothing) and drawn here instead, with the
 * dithering material, until it has faded back in.
 */
interface FadeBatch {
  body: THREE.InstancedMesh
  glow: THREE.InstancedMesh | null
  /** Shared by body and glow, so a crypt's windows fade with its walls. */
  fade: THREE.InstancedBufferAttribute
  /** The solid in each slot. */
  ids: Int32Array
  used: number
}

/** A solid prop that can fade: where it stands, its shape, and where it is drawn. */
interface Solid extends PlacedProfile {
  batch: FadeBatch
  tile: PropTile
  glowTile: PropTile | null
  /** Its instance in the tile (and the glow tile). */
  slot: number
  /** Its slot in the batch's see-through meshes, or -1. */
  fadeSlot: number
}

/** Swaying tops reach a little past their rest pose. */
const SWAY_MARGIN = 0.3

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
  private readonly solidMat = this.own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
  private readonly swayMats = new Map<string, THREE.MeshLambertMaterial>()
  private readonly swayTime = { value: 0 }
  private readonly flickers: Array<{ mats: THREE.MeshLambertMaterial[]; base: number; flicker: number; phase: number }> = []
  /** Each prop material's see-through twin, and how to make it. */
  private readonly twins = new Map<THREE.Material, THREE.Material>()
  private readonly twinMakers = new Map<THREE.Material, () => THREE.Material>([
    [this.solidMat, () => this.own(seeThrough(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })))],
  ])
  private tumble: Tumbleweeds | null = null
  private time = 0

  /** Every solid that can fade, indexed like the collider grid. */
  private readonly solids: Array<Solid | undefined>
  private readonly fade: Float32Array
  /** The frame each solid was last found in the way. */
  private readonly wanted: Int32Array
  /** Wanted solids the camera is inside or right against; they fade out completely. */
  private readonly nearLens: Uint8Array
  /** Solids that are faded, fading or wanted faded; everything else is left alone. */
  private readonly fading: number[] = []
  private readonly isFading: Uint8Array
  private readonly hits: number[] = []
  private readonly sight: Sightline = { ex: 0, ey: 0, ez: 0, px: 0, pz: 0, low: 0, high: 0 }
  /** How far any solid's silhouette reaches past its collider. */
  private overhang = 0
  /**
   * Solid ids at and past this are the rim's wall rocks. They have no
   * collider (the walkable limit keeps players off them) but can still come
   * between the camera and a player at the wall, so they fade like the rest.
   */
  private readonly rimStart: number
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
    this.rimStart = colliders?.count ?? 0
    const count = this.rimStart + (colliders ? walls.length : 0)
    this.solids = new Array(count)
    this.fade = new Float32Array(count)
    this.wanted = new Int32Array(count)
    this.nearLens = new Uint8Array(count)
    this.isFading = new Uint8Array(count)

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
        const mat = group.spec.sway > 0 ? this.swayMaterial(group.spec.sway, false) : this.solidMat
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
      const ids = colliders ? walls.map((w, k) => ({ ...w, collider: this.rimStart + k })) : walls
      this.addBatch(rock, ids, this.solidMat, true, stone, null, 0)
    }
  }

  update(dt: number): void {
    this.time += dt
    this.swayTime.value = this.time
    const t = this.time
    for (const f of this.flickers) {
      const wobble = f.flicker > 0
        ? 0.12 * Math.sin(t * 11 + f.phase) + 0.07 * Math.sin(t * 27.3 + f.phase * 2.1) + 0.04 * Math.sin(t * 5.1)
        : 0.15 * Math.sin(t * 1.3 + f.phase)
      const intensity = f.base * (1 + wobble * (f.flicker > 0 ? f.flicker : 1))
      for (const mat of f.mats) mat.emissiveIntensity = intensity
    }
    this.tumble?.update(dt)
  }

  /**
   * Fades the solid props standing between the camera (`eye`) and the
   * player's body (from `SIGHT_LOW` to `SIGHT_HIGH` over `feet`) and eases
   * everything else back in. With no eye or feet (the title screen)
   * everything eases back in. Only the collider cells along the view are
   * looked at.
   */
  updateOcclusion(dt: number, eye: XYZ | null, feet: XYZ | null): void {
    const frame = ++this.frame
    if (eye && feet && this.colliders) this.markOccluders(eye, feet, frame)
    const step = dt / FADE_TIME
    const list = this.fading
    for (let n = list.length - 1; n >= 0; n--) {
      const id = list[n]
      const solid = this.solids[id]!
      // Wall rocks are huge and hide nothing worth seeing, so they clear fully like props against the lens.
      const target = this.wanted[id] === frame ? (this.nearLens[id] || id >= this.rimStart ? FULL_FADE : 1) : 0
      const was = this.fade[id]
      const now = target > was ? Math.min(target, was + step) : Math.max(target, was - step)
      if (now !== was) {
        this.fade[id] = now
        solid.batch.fade.array[solid.fadeSlot] = now
        solid.batch.fade.needsUpdate = true
      }
      if (now === 0 && target === 0) {
        this.restore(solid)
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
    this.twins.clear()
    this.twinMakers.clear()
    this.flickers.length = 0
    this.fading.length = 0
    this.tumble = null
  }

  private markOccluders(eye: XYZ, feet: XYZ, frame: number): void {
    const s = this.sight
    s.ex = eye.x
    s.ey = eye.y
    s.ez = eye.z
    s.px = feet.x
    s.pz = feet.z
    s.low = feet.y + SIGHT_LOW
    s.high = feet.y + SIGHT_HIGH
    const pad = this.overhang + sightMargin(LENS_REACH / 2, LINE_MARGIN, LENS_SPREAD, LENS_REACH)
    for (const id of this.colliders!.querySegment(s.ex, s.ez, s.px, s.pz, pad, this.hits)) this.consider(id, frame)
    // The wall rocks only matter with the camera near the rim; a cheap distance cull keeps this to a handful.
    if (Math.max(Math.abs(s.ex), Math.abs(s.ez)) > PLAY_LIMIT - 10) {
      for (let id = this.rimStart; id < this.solids.length; id++) {
        const rock = this.solids[id]
        if (rock && Math.hypot(rock.x - s.ex, rock.z - s.ez) < placedReach(rock) + 12) this.consider(id, frame)
      }
    }
  }

  private consider(id: number, frame: number): void {
    const s = this.sight
    const solid = this.solids[id]
    if (!solid || !blocksSight(solid, s, LINE_MARGIN, LENS_SPREAD, LENS_REACH)) return
    if (!this.isFading[id]) {
      // A batch with every see-through slot taken leaves the rest solid.
      if (!this.hide(solid, id)) return
      this.isFading[id] = 1
      this.fading.push(id)
    }
    this.wanted[id] = frame
    this.nearLens[id] = lensInside(solid, s, LENS_CLEAR) ? 1 : 0
  }

  /** Moves a solid from its tile into its batch's see-through meshes. */
  private hide(solid: Solid, id: number): boolean {
    const batch = solid.batch
    if (batch.used >= batch.ids.length) return false
    const k = batch.used++
    batch.ids[k] = id
    solid.fadeSlot = k
    batch.fade.array[k] = 0
    batch.fade.needsUpdate = true
    this.moveInstance(solid.tile, solid.slot, batch.body, k, true)
    if (solid.glowTile && batch.glow) this.moveInstance(solid.glowTile, solid.slot, batch.glow, k, false)
    this.showBatch(batch)
    return true
  }

  /** Puts a solid that has faded back in back in its tile, and closes the gap in its batch. */
  private restore(solid: Solid): void {
    const batch = solid.batch
    const k = solid.fadeSlot
    const last = --batch.used
    this.moveInstance(batch.body, k, solid.tile, solid.slot, false)
    if (solid.glowTile && batch.glow) this.moveInstance(batch.glow, k, solid.glowTile, solid.slot, false)
    if (k !== last) {
      const moved = this.solids[batch.ids[last]]!
      this.moveInstance(batch.body, last, batch.body, k, true)
      if (batch.glow) this.moveInstance(batch.glow, last, batch.glow, k, false)
      batch.fade.array[k] = batch.fade.array[last]
      batch.fade.needsUpdate = true
      batch.ids[k] = batch.ids[last]
      moved.fadeSlot = k
    }
    solid.fadeSlot = -1
    this.showBatch(batch)
  }

  /** Copies instance `from` of one mesh to instance `to` of another (with its colour when asked) and hides the original. */
  private moveInstance(src: THREE.InstancedMesh, from: number, dst: THREE.InstancedMesh, to: number, colour: boolean): void {
    src.getMatrixAt(from, this.m)
    dst.setMatrixAt(to, this.m)
    touch(dst.instanceMatrix, to * 16, 16)
    if (colour && src.instanceColor && dst.instanceColor) {
      src.getColorAt(from, this.c)
      dst.setColorAt(to, this.c)
      touch(dst.instanceColor, to * 3, 3)
    }
    // Scaled to nothing where it stands, so it draws no pixels (the sway still reads its position).
    this.m.decompose(this.p, this.q, this.s)
    src.setMatrixAt(from, this.m.compose(this.p, this.q, this.s.setScalar(0)))
    touch(src.instanceMatrix, from * 16, 16)
  }

  private showBatch(batch: FadeBatch): void {
    batch.body.count = batch.used
    batch.body.visible = batch.used > 0
    if (batch.glow) {
      batch.glow.count = batch.used
      batch.glow.visible = batch.used > 0
    }
  }

  /**
   * Draws `list` as one InstancedMesh per map tile it touches, plus the
   * glow part's. Solids (props with a collider) can fade: they share a
   * batch of see-through meshes, built now (hidden) so the shader prewarm
   * compiles their materials.
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
    const tiles = tilesFor(triangles(body) * list.length)
    const shadowTiles = castShadow && this.shadowFrustum ? tiles.shadow : 0
    const viewCasts = castShadow && shadowTiles === 0
    for (const tile of this.split(list, shadowTiles)) {
      const mesh = this.instanced(body, mat, tile.length, true)
      mesh.shadowOnly = this.shadowFrustum
      // Coloured like the visible tiles, so the prewarm compiles no extra program for them.
      this.fill(mesh, tile, tint)
    }

    const solid = (inst: PropInstance) => inst.collider !== undefined && inst.collider >= 0 && inst.collider < this.solids.length
    let batch: FadeBatch | null = null
    let profile: Profile | null = null
    if (this.colliders && list.some(solid)) {
      profile = measureProfile(body)
      const fade = new THREE.InstancedBufferAttribute(new Float32Array(FADE_SLOTS), 1)
      const see = this.instanced(body, this.twin(mat), FADE_SLOTS, viewCasts, fade)
      see.frustumCulled = false
      // Colour slots exist from the start, so the program compiled now is the one used later.
      for (let k = 0; k < FADE_SLOTS; k++) see.setColorAt(k, this.c.setScalar(1))
      let seeGlow: THREE.InstancedMesh | null = null
      if (glow) {
        seeGlow = this.instanced(glow.geo, this.twin(glow.mat), FADE_SLOTS, false, fade)
        seeGlow.receiveShadow = false
        seeGlow.frustumCulled = false
      }
      batch = { body: see, glow: seeGlow, fade, ids: new Int32Array(FADE_SLOTS), used: 0 }
      this.showBatch(batch)
    }

    for (const tile of this.split(list, tiles.view)) {
      const mesh = this.instanced(body, mat, tile.length, viewCasts)
      this.fill(mesh, tile, tint)
      let glowMesh: PropTile | null = null
      if (glow) {
        glowMesh = this.instanced(glow.geo, glow.mat, tile.length, false)
        glowMesh.receiveShadow = false
        this.fill(glowMesh, tile, null, false)
      }
      if (!batch || !profile) continue
      tile.forEach((inst, i) => {
        if (!solid(inst)) return
        const placed: Solid = {
          profile: profile!,
          x: inst.x,
          y: inst.y,
          z: inst.z,
          sx: inst.sx,
          sy: inst.sy,
          sz: inst.sz,
          cos: Math.cos(inst.yaw),
          sin: Math.sin(inst.yaw),
          lean: Math.sin(Math.min(Math.PI / 2, Math.hypot(inst.leanX, inst.leanZ))),
          batch: batch!,
          tile: mesh,
          glowTile: glowMesh,
          slot: i,
          fadeSlot: -1,
        }
        this.solids[inst.collider!] = placed
        // Rim rocks aren't in the collider grid, so they don't widen its searches.
        if (inst.collider! < this.rimStart) this.overhang = Math.max(this.overhang, placedReach(placed) - colliderRadius * inst.scale)
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

  /** An InstancedMesh over a view of `source`: the vertex buffers are shared, so three uploads each attribute once. */
  private instanced(
    source: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    castShadow: boolean,
    fade: THREE.InstancedBufferAttribute | null = null,
  ): PropTile {
    const geo = new THREE.BufferGeometry()
    for (const name of Object.keys(source.attributes)) geo.setAttribute(name, source.getAttribute(name))
    if (fade) geo.setAttribute('aFade', fade)
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

  /** The see-through twin of a prop material, made the first time a batch of solids needs it. */
  private twin(mat: THREE.Material): THREE.Material {
    let twin = this.twins.get(mat)
    if (!twin) {
      const make = this.twinMakers.get(mat)
      if (!make) throw new Error('PropLayer: this material has no see-through twin')
      twin = make()
      this.twins.set(mat, twin)
    }
    return twin
  }

  /** One emissive material per glowing kind and variant; each flickers on its own phase, its twin in step. */
  private glowMaterial(kind: string, glow: string | undefined): THREE.MeshLambertMaterial {
    const style = GLOW_STYLE[kind] ?? { intensity: 1.2, flicker: 0 }
    const make = () => new THREE.MeshLambertMaterial({ color: 0x000000, emissive: glow ?? '#ffc05a', emissiveIntensity: style.intensity })
    const mat = this.own(make())
    const flicker = { mats: [mat], base: style.intensity, flicker: style.flicker, phase: this.flickers.length * 2.3 }
    this.flickers.push(flicker)
    this.twinMakers.set(mat, () => {
      const twin = this.own(seeThrough(make()))
      flicker.mats.push(twin)
      return twin
    })
    return mat
  }

  /**
   * Lambert plus a wind sway in the vertex shader: each instance leans by
   * `amount × height²`, phased by where it stands so a forest ripples
   * instead of nodding in unison. One material per amount (and one
   * see-through twin), sharing a clock.
   */
  private swayMaterial(amount: number, fades: boolean): THREE.MeshLambertMaterial {
    const key = `${amount}|${fades}`
    const cached = this.swayMats.get(key)
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
      if (fades) addFade(shader)
    }
    mat.customProgramCacheKey = () => `bonk-prop-sway-${amount}${fades ? '-fade' : ''}`
    this.swayMats.set(key, mat)
    if (!fades) this.twinMakers.set(mat, () => this.swayMaterial(amount, true))
    return mat
  }

  private own<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat)
    return mat
  }
}

/** Marks a range of an attribute for upload; three merges the ranges and sends only those. */
function touch(attr: THREE.BufferAttribute, start: number, count: number): void {
  attr.addUpdateRange(start, count)
  attr.needsUpdate = true
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
