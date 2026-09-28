/**
 * Procedural low-poly character models. Each body part is a handful of
 * primitives merged into one vertex-coloured, flat-shaded geometry, so a
 * whole character is seven draw calls sharing one material.
 *
 * Models stand on y = 0, face +Z and are about 1.8 m tall. Limbs hang from
 * pivots at the hips and shoulders so poses are plain rotations.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CharacterDef } from '../game/types'
import type { Pose } from './animation'

type V3 = readonly [number, number, number]
type Paint = THREE.ColorRepresentation

export interface CharacterRig {
  /** Sits at the feet; the player sets its position and yaw (the model's front is +Z). */
  readonly root: THREE.Group
  /** Pivots at the feet: tips the model over on death. */
  readonly tilt: THREE.Group
  readonly body: THREE.Object3D
  readonly head: THREE.Object3D
  readonly armL: THREE.Object3D
  readonly armR: THREE.Object3D
  readonly legL: THREE.Object3D
  readonly legR: THREE.Object3D
  readonly tail: THREE.Object3D | null
  /** Shared by every part, so a hit flash is one emissive change. */
  readonly material: THREE.MeshLambertMaterial
  /** Rough top of the head, for floating text. */
  readonly height: number
  applyPose(pose: Pose): void
  dispose(): void
}

const DARK = '#1c1a24'
const SKIN = '#f5d0b5'
const IVORY = '#fffbe8'

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _c = new THREE.Color()

/** Gathers primitives in a part's local space and merges them into one geometry. */
class Part {
  private pieces: THREE.BufferGeometry[] = []

  add(geo: THREE.BufferGeometry, color: Paint, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): this {
    const g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]))
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2]))
    g.applyMatrix4(_m)
    _c.set(color)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r
      col[i * 3 + 1] = _c.g
      col[i * 3 + 2] = _c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.pieces.push(g)
    return this
  }

  box(w: number, h: number, d: number, color: Paint, pos?: V3, rot?: V3): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, pos, rot)
  }

  cyl(rTop: number, rBottom: number, h: number, segments: number, color: Paint, pos?: V3, rot?: V3): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, segments), color, pos, rot)
  }

  cone(r: number, h: number, segments: number, color: Paint, pos?: V3, rot?: V3): this {
    return this.add(new THREE.ConeGeometry(r, h, segments), color, pos, rot)
  }

  ball(r: number, color: Paint, pos?: V3, scale?: V3, detail = 0): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, pos, undefined, scale)
  }

  gem(r: number, color: Paint, pos?: V3, scale?: V3): this {
    return this.add(new THREE.OctahedronGeometry(r), color, pos, undefined, scale)
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.pieces)
    for (const g of this.pieces) g.dispose()
    this.pieces = []
    if (!merged) throw new Error('PlayerModel: could not merge part geometry')
    merged.computeBoundingSphere()
    return merged
  }
}

/** Where the limbs hang, in metres. Shoulders, neck and tail are relative to the hips. */
interface Layout {
  hipY: number
  hipX: number
  shoulderY: number
  shoulderX: number
  neckY: number
  tail?: V3
}

interface Build {
  layout: Layout
  torso: Part
  head: Part
  leg: Part
  arm: Part
  /** Only when the right arm carries something (a staff). */
  armR?: Part
  tail?: Part
}

function shade(color: string, k: number): THREE.Color {
  return new THREE.Color(color).multiplyScalar(k)
}

// ─────────────────────────────── presets ───────────────────────────────

function knight(c: CharacterDef['colors']): Build {
  const steel = c.body
  const plume = c.accent
  const gold = c.detail
  const dark = shade(steel, 0.55)
  const HALF = Math.PI / 2
  return {
    layout: { hipY: 0.74, hipX: 0.15, shoulderY: 0.52, shoulderX: 0.43, neckY: 0.62 },
    leg: new Part()
      .box(0.22, 0.62, 0.24, steel, [0, -0.31, 0])
      .box(0.24, 0.1, 0.1, dark, [0, -0.34, 0.1])
      .box(0.26, 0.14, 0.34, dark, [0, -0.67, 0.04]),
    torso: new Part()
      .box(0.64, 0.62, 0.42, steel, [0, 0.31, 0])
      .box(0.42, 0.52, 0.04, plume, [0, 0.27, 0.215])
      .box(0.08, 0.3, 0.05, gold, [0, 0.33, 0.225])
      .box(0.26, 0.07, 0.05, gold, [0, 0.4, 0.226])
      .box(0.66, 0.09, 0.44, '#5a3b22', [0, 0.05, 0])
      // A round shield on the back reads well from the chase camera.
      .cyl(0.3, 0.3, 0.06, 10, gold, [0, 0.33, -0.245], [HALF, 0, 0])
      .cyl(0.25, 0.25, 0.07, 10, plume, [0, 0.33, -0.255], [HALF, 0, 0])
      .ball(0.07, gold, [0, 0.33, -0.3]),
    arm: new Part()
      .ball(0.17, steel, [0, 0.02, 0], [1.1, 0.9, 1.1], 1)
      .box(0.17, 0.56, 0.19, steel, [0, -0.28, 0])
      .box(0.21, 0.16, 0.23, dark, [0, -0.57, 0.01]),
    head: new Part()
      .box(0.46, 0.46, 0.46, steel, [0, 0.25, 0])
      .box(0.36, 0.06, 0.02, DARK, [0, 0.27, 0.232])
      .box(0.06, 0.18, 0.02, DARK, [0, 0.18, 0.232])
      .box(0.07, 0.07, 0.48, gold, [0, 0.5, 0])
      .box(0.11, 0.16, 0.18, plume, [0, 0.6, 0.1])
      .box(0.11, 0.17, 0.18, plume, [0, 0.66, -0.06], [0.3, 0, 0])
      .box(0.11, 0.17, 0.18, plume, [0, 0.62, -0.22], [0.8, 0, 0])
      .box(0.1, 0.2, 0.14, plume, [0, 0.5, -0.33], [1.3, 0, 0]),
  }
}

function skeleton(c: CharacterDef['colors']): Build {
  const bone = c.body
  const shades = c.accent
  const scarf = c.detail
  const head = new Part()
    .ball(0.25, bone, [0, 0.27, 0], [1, 0.95, 1.05], 1)
    .box(0.28, 0.1, 0.22, bone, [0, 0.08, 0.05])
    .box(0.22, 0.03, 0.02, DARK, [0, 0.12, 0.165])
    .box(0.05, 0.06, 0.02, DARK, [0, 0.2, 0.255])
    // Sunglasses, obviously.
    .box(0.5, 0.05, 0.04, shades, [0, 0.33, 0.24])
  for (const side of [-1, 1]) {
    head
      .box(0.19, 0.12, 0.04, shades, [side * 0.11, 0.29, 0.245])
      .box(0.03, 0.04, 0.26, shades, [side * 0.245, 0.32, 0.1])
  }
  return {
    layout: { hipY: 0.74, hipX: 0.13, shoulderY: 0.54, shoulderX: 0.3, neckY: 0.6 },
    leg: new Part()
      .cyl(0.05, 0.045, 0.34, 6, bone, [0, -0.17, 0])
      .ball(0.075, bone, [0, -0.36, 0])
      .cyl(0.045, 0.04, 0.3, 6, bone, [0, -0.53, 0])
      .box(0.14, 0.08, 0.24, bone, [0, -0.7, 0.05]),
    torso: new Part()
      .box(0.34, 0.12, 0.2, bone, [0, 0.02, 0])
      .cyl(0.045, 0.045, 0.52, 6, bone, [0, 0.3, -0.04])
      .box(0.44, 0.06, 0.26, bone, [0, 0.47, 0.01])
      .box(0.4, 0.06, 0.24, bone, [0, 0.37, 0.01])
      .box(0.32, 0.06, 0.2, bone, [0, 0.27, 0.01])
      .box(0.56, 0.07, 0.1, bone, [0, 0.56, -0.01])
      .box(0.3, 0.1, 0.28, scarf, [0, 0.6, 0])
      .box(0.12, 0.34, 0.04, scarf, [0.06, 0.44, -0.16], [0.35, 0, 0.15]),
    arm: new Part()
      .ball(0.07, bone)
      .cyl(0.04, 0.035, 0.26, 6, bone, [0, -0.15, 0])
      .ball(0.055, bone, [0, -0.3, 0])
      .cyl(0.035, 0.03, 0.24, 6, bone, [0, -0.43, 0])
      .ball(0.075, bone, [0, -0.58, 0.01], [1, 1.1, 1]),
    head,
  }
}

function fox(c: CharacterDef['colors']): Build {
  const fur = c.body
  const cream = c.accent
  const dark = c.detail
  const head = new Part()
    .box(0.5, 0.42, 0.44, fur, [0, 0.23, 0])
    .box(0.56, 0.16, 0.32, cream, [0, 0.1, 0.07])
    .box(0.22, 0.15, 0.24, cream, [0, 0.13, 0.32])
    .ball(0.055, dark, [0, 0.19, 0.45])
  for (const side of [-1, 1]) {
    head
      .box(0.07, 0.1, 0.02, dark, [side * 0.12, 0.29, 0.225])
      .cone(0.12, 0.3, 4, fur, [side * 0.16, 0.57, -0.02], [0, Math.PI / 4, -side * 0.2])
      .cone(0.055, 0.13, 4, dark, [side * 0.181, 0.673, -0.02], [0, Math.PI / 4, -side * 0.2])
  }
  return {
    layout: { hipY: 0.66, hipX: 0.14, shoulderY: 0.48, shoulderX: 0.33, neckY: 0.56, tail: [0, 0.08, -0.18] },
    leg: new Part().box(0.19, 0.48, 0.21, fur, [0, -0.24, 0]).box(0.22, 0.18, 0.3, dark, [0, -0.57, 0.03]),
    torso: new Part().box(0.5, 0.56, 0.36, fur, [0, 0.28, 0]).box(0.3, 0.36, 0.04, cream, [0, 0.3, 0.19]),
    arm: new Part().box(0.14, 0.44, 0.16, fur, [0, -0.22, 0]).ball(0.1, dark, [0, -0.48, 0.01]),
    head,
    // A big bushy tail, the fox's silhouette from behind.
    tail: new Part()
      .box(0.18, 0.18, 0.3, fur, [0, 0.04, -0.14], [0.5, 0, 0])
      .box(0.28, 0.28, 0.34, fur, [0, 0.2, -0.38], [0.7, 0, 0])
      .box(0.22, 0.22, 0.2, cream, [0, 0.36, -0.56], [0.8, 0, 0]),
  }
}

function robot(c: CharacterDef['colors']): Build {
  const metal = c.body
  const glow = c.accent
  const dark = c.detail
  const torso = new Part()
    .box(0.7, 0.62, 0.46, metal, [0, 0.35, 0])
    .box(0.36, 0.2, 0.03, glow, [0, 0.44, 0.235])
    .cyl(0.26, 0.3, 0.1, 8, dark, [0, 0.02, 0])
    .box(0.46, 0.42, 0.18, dark, [0, 0.38, -0.3])
  for (let i = 0; i < 3; i++) torso.box(0.4, 0.03, 0.02, dark, [0, 0.24 - i * 0.06, 0.235])
  for (const side of [-1, 1]) torso.cyl(0.06, 0.07, 0.22, 6, glow, [side * 0.14, 0.64, -0.32])
  const head = new Part()
    .cyl(0.07, 0.07, 0.1, 6, dark, [0, 0.04, 0])
    .box(0.5, 0.38, 0.42, metal, [0, 0.27, 0])
    .box(0.42, 0.12, 0.04, glow, [0, 0.29, 0.215])
    .cyl(0.018, 0.018, 0.26, 4, dark, [0.1, 0.58, 0])
    .ball(0.06, glow, [0.1, 0.72, 0])
  for (const side of [-1, 1]) head.cyl(0.07, 0.07, 0.06, 6, dark, [side * 0.27, 0.25, 0], [0, 0, Math.PI / 2])
  return {
    layout: { hipY: 0.7, hipX: 0.17, shoulderY: 0.56, shoulderX: 0.45, neckY: 0.66 },
    leg: new Part()
      .box(0.2, 0.2, 0.22, metal, [0, -0.08, 0])
      .cyl(0.07, 0.07, 0.36, 6, dark, [0, -0.34, 0])
      .box(0.26, 0.16, 0.36, metal, [0, -0.62, 0.04])
      .box(0.2, 0.05, 0.04, glow, [0, -0.6, 0.225]),
    torso,
    arm: new Part()
      .ball(0.14, metal)
      .cyl(0.055, 0.055, 0.4, 6, dark, [0, -0.24, 0])
      .box(0.18, 0.2, 0.18, metal, [0, -0.52, 0]),
    head,
  }
}

function ninja(c: CharacterDef['colors']): Build {
  const cloth = c.body
  const red = c.accent
  const skin = c.detail
  const wrap = shade(cloth, 0.65)
  const tilt = 0.75
  const head = new Part()
    .box(0.44, 0.46, 0.44, cloth, [0, 0.24, 0])
    .box(0.38, 0.1, 0.02, skin, [0, 0.28, 0.225])
    .box(0.47, 0.08, 0.47, red, [0, 0.4, 0])
    // Headband tails streaming out behind.
    .box(0.07, 0.04, 0.42, red, [0.07, 0.36, -0.42], [-0.35, 0.2, 0])
    .box(0.07, 0.04, 0.36, red, [-0.05, 0.32, -0.38], [-0.55, -0.25, 0])
  for (const side of [-1, 1]) head.box(0.06, 0.05, 0.01, DARK, [side * 0.09, 0.28, 0.236])
  return {
    layout: { hipY: 0.74, hipX: 0.14, shoulderY: 0.52, shoulderX: 0.34, neckY: 0.6 },
    leg: new Part()
      .box(0.2, 0.58, 0.22, cloth, [0, -0.29, 0])
      .box(0.22, 0.12, 0.24, wrap, [0, -0.5, 0])
      .box(0.21, 0.12, 0.3, DARK, [0, -0.68, 0.03]),
    torso: new Part()
      .box(0.52, 0.6, 0.34, cloth, [0, 0.3, 0])
      .box(0.56, 0.1, 0.38, red, [0, 0.07, 0])
      .box(0.08, 0.26, 0.04, red, [0.08, -0.06, -0.2], [0.2, 0, 0.25])
      .box(0.08, 0.22, 0.04, red, [-0.04, -0.05, -0.2], [0.2, 0, -0.2])
      .box(0.3, 0.12, 0.02, wrap, [0, 0.54, 0.172])
      .box(0.08, 0.8, 0.08, DARK, [0, 0.36, -0.21], [0, 0, tilt])
      .box(0.07, 0.22, 0.07, red, [-0.345, 0.73, -0.21], [0, 0, tilt]),
    arm: new Part()
      .box(0.15, 0.48, 0.16, cloth, [0, -0.24, 0])
      .box(0.16, 0.08, 0.17, wrap, [0, -0.42, 0])
      .box(0.13, 0.12, 0.14, skin, [0, -0.54, 0]),
    head,
  }
}

function monkey(c: CharacterDef['colors']): Build {
  const fur = c.body
  const face = c.accent
  const hat = c.detail
  const head = new Part()
    .ball(0.28, fur, [0, 0.27, 0], [1, 0.95, 1], 1)
    .ball(0.2, face, [0, 0.24, 0.14], [1.15, 0.95, 0.6], 1)
    .ball(0.13, face, [0, 0.14, 0.26], [1.2, 0.8, 0.9], 1)
    .cyl(0.2, 0.24, 0.12, 10, hat, [0, 0.52, 0])
    .box(0.26, 0.03, 0.18, hat, [0, 0.47, 0.24])
  for (const side of [-1, 1]) {
    head
      .box(0.06, 0.08, 0.02, DARK, [side * 0.08, 0.3, 0.265])
      .cyl(0.14, 0.14, 0.06, 10, fur, [side * 0.3, 0.3, 0], [0, 0, Math.PI / 2])
      .cyl(0.09, 0.09, 0.03, 10, face, [side * 0.33, 0.3, 0.01], [0, 0, Math.PI / 2])
  }
  return {
    layout: { hipY: 0.56, hipX: 0.14, shoulderY: 0.48, shoulderX: 0.35, neckY: 0.54, tail: [0, 0.06, -0.2] },
    leg: new Part().box(0.19, 0.4, 0.21, fur, [0, -0.2, 0]).box(0.2, 0.1, 0.3, face, [0, -0.51, 0.05]),
    torso: new Part().box(0.54, 0.54, 0.4, fur, [0, 0.27, 0]).box(0.34, 0.34, 0.04, face, [0, 0.25, 0.205]),
    // Arms long enough to knuckle-walk.
    arm: new Part().box(0.13, 0.74, 0.14, fur, [0, -0.37, 0]).ball(0.1, face, [0, -0.78, 0.01]),
    head,
    tail: new Part()
      .box(0.08, 0.08, 0.26, fur, [0, 0.02, -0.12], [0.3, 0, 0])
      .box(0.08, 0.26, 0.08, fur, [0, 0.2, -0.26])
      .box(0.08, 0.08, 0.2, fur, [0, 0.34, -0.2])
      .box(0.08, 0.12, 0.08, fur, [0, 0.28, -0.12]),
  }
}

function wizard(c: CharacterDef['colors']): Build {
  const robe = c.body
  const white = c.accent
  const ice = c.detail
  const robeDark = shade(robe, 0.55)
  const arm = () =>
    new Part()
      .cyl(0.08, 0.13, 0.48, 6, robe, [0, -0.24, 0])
      .cyl(0.135, 0.135, 0.05, 6, white, [0, -0.47, 0])
      .ball(0.07, SKIN, [0, -0.55, 0])
  const head = new Part()
    .box(0.34, 0.32, 0.34, SKIN, [0, 0.17, 0])
    .cone(0.19, 0.36, 6, white, [0, 0.02, 0.1], [Math.PI, 0, 0])
    .box(0.24, 0.05, 0.06, white, [0, 0.12, 0.18])
    .cyl(0.38, 0.38, 0.05, 10, robe, [0, 0.35, 0])
    .cyl(0.245, 0.25, 0.07, 10, ice, [0, 0.41, 0])
    .cone(0.24, 0.56, 8, robe, [0, 0.64, -0.04], [-0.18, 0, 0])
    .gem(0.05, ice, [0, 0.9, -0.1])
  for (const side of [-1, 1]) head.box(0.05, 0.06, 0.02, DARK, [side * 0.08, 0.22, 0.172])
  return {
    layout: { hipY: 0.66, hipX: 0.12, shoulderY: 0.5, shoulderX: 0.32, neckY: 0.56 },
    leg: new Part().box(0.15, 0.52, 0.17, robeDark, [0, -0.26, 0]).box(0.18, 0.13, 0.28, '#4a3a5a', [0, -0.6, 0.04]),
    torso: new Part()
      .box(0.48, 0.56, 0.34, robe, [0, 0.28, 0])
      .cyl(0.28, 0.46, 0.6, 8, robe, [0, -0.28, 0])
      .cyl(0.47, 0.47, 0.05, 8, white, [0, -0.56, 0])
      .box(0.5, 0.07, 0.36, ice, [0, 0.04, 0])
      .box(0.32, 0.08, 0.3, white, [0, 0.55, 0]),
    arm: arm(),
    // The staff rides in the right hand, crystal up.
    armR: arm()
      .cyl(0.035, 0.035, 1.45, 5, '#7a4a2a', [0, -0.4, 0.1])
      .gem(0.12, ice, [0, 0.42, 0.1], [1, 1.4, 1]),
    head,
  }
}

function ogre(c: CharacterDef['colors']): Build {
  const skin = c.body
  const cloth = c.accent
  const gold = c.detail
  const dark = shade(skin, 0.7)
  const light = shade(skin, 1.08)
  const torso = new Part()
    .box(1.0, 0.84, 0.66, skin, [0, 0.46, 0])
    .ball(0.34, skin, [0, 0.3, 0.24], [1, 0.85, 0.6], 1)
    .box(1.04, 0.14, 0.7, cloth, [0, 0.08, 0])
    .box(0.18, 0.12, 0.04, gold, [0, 0.08, 0.36])
    .box(0.62, 0.14, 0.44, skin, [0, 0.92, -0.04])
  for (const side of [-1, 1]) torso.box(0.4, 0.22, 0.1, light, [side * 0.22, 0.66, 0.33])
  const head = new Part()
    .box(0.32, 0.3, 0.3, skin, [0, 0.14, 0.08])
    .box(0.34, 0.12, 0.3, skin, [0, 0.04, 0.1])
    .box(0.3, 0.05, 0.04, dark, [0, 0.22, 0.235])
  for (const side of [-1, 1]) {
    head
      .cone(0.035, 0.12, 4, IVORY, [side * 0.1, 0.12, 0.25])
      .box(0.05, 0.04, 0.02, DARK, [side * 0.07, 0.18, 0.232])
      .box(0.06, 0.1, 0.06, skin, [side * 0.17, 0.15, 0.06])
      .ball(0.04, gold, [side * 0.18, 0.07, 0.06])
  }
  return {
    // A huge torso on short legs, with a tiny head on top.
    layout: { hipY: 0.62, hipX: 0.24, shoulderY: 0.74, shoulderX: 0.62, neckY: 0.9 },
    leg: new Part()
      .box(0.34, 0.24, 0.36, cloth, [0, -0.08, 0])
      .box(0.3, 0.34, 0.3, skin, [0, -0.36, 0])
      .box(0.36, 0.14, 0.44, dark, [0, -0.55, 0.05]),
    torso,
    arm: new Part()
      .ball(0.26, skin, [0, 0, 0], [1, 0.9, 1], 1)
      .box(0.3, 0.44, 0.3, skin, [0, -0.3, 0])
      .ball(0.17, skin, [0, -0.26, 0.1])
      .box(0.33, 0.07, 0.33, gold, [0, -0.48, 0])
      .box(0.34, 0.38, 0.34, skin, [0, -0.68, 0])
      .box(0.38, 0.3, 0.38, dark, [0, -0.96, 0.02]),
    head,
  }
}

const PRESETS: Record<CharacterDef['model'], (c: CharacterDef['colors']) => Build> = {
  knight,
  skeleton,
  fox,
  robot,
  ninja,
  monkey,
  wizard,
  ogre,
}

// ─────────────────────────────── rig ───────────────────────────────

class Rig implements CharacterRig {
  readonly root = new THREE.Group()
  readonly tilt = new THREE.Group()
  readonly body: THREE.Mesh
  readonly head: THREE.Mesh
  readonly armL: THREE.Mesh
  readonly armR: THREE.Mesh
  readonly legL: THREE.Mesh
  readonly legR: THREE.Mesh
  readonly tail: THREE.Mesh | null
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  readonly height: number
  private readonly hipY: number
  private readonly geometries: THREE.BufferGeometry[] = []

  constructor(build: Build) {
    const L = build.layout
    this.hipY = L.hipY
    const leg = this.geometry(build.leg)
    const arm = this.geometry(build.arm)
    const armR = build.armR ? this.geometry(build.armR) : arm

    this.root.add(this.tilt)
    this.legL = this.mesh(leg, this.tilt, L.hipX, L.hipY, 0)
    this.legR = this.mesh(leg, this.tilt, -L.hipX, L.hipY, 0)
    this.body = this.mesh(this.geometry(build.torso), this.tilt, 0, L.hipY, 0)
    this.head = this.mesh(this.geometry(build.head), this.body, 0, L.neckY, 0)
    this.armL = this.mesh(arm, this.body, L.shoulderX, L.shoulderY, 0)
    this.armR = this.mesh(armR, this.body, -L.shoulderX, L.shoulderY, 0)
    this.tail = build.tail && L.tail ? this.mesh(this.geometry(build.tail), this.body, L.tail[0], L.tail[1], L.tail[2]) : null

    const headGeo = this.head.geometry
    headGeo.computeBoundingBox()
    this.height = L.hipY + L.neckY + (headGeo.boundingBox ? headGeo.boundingBox.max.y : 0.5)
  }

  applyPose(p: Pose): void {
    this.legL.rotation.x = -p.legL
    this.legR.rotation.x = -p.legR
    this.armL.rotation.set(-p.armL, 0, p.armSpread)
    this.armR.rotation.set(-p.armR, 0, -p.armSpread)
    this.body.position.y = this.hipY + p.bob
    this.body.rotation.x = p.lean
    this.head.rotation.x = p.head
    this.tilt.position.y = p.crouch
    if (this.tail) this.tail.rotation.y = p.tail
  }

  dispose(): void {
    this.root.removeFromParent()
    for (const g of this.geometries) g.dispose()
    this.material.dispose()
  }

  private geometry(part: Part): THREE.BufferGeometry {
    const g = part.build()
    this.geometries.push(g)
    return g
  }

  private mesh(geo: THREE.BufferGeometry, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.material)
    m.position.set(x, y, z)
    m.castShadow = true
    parent.add(m)
    return m
  }
}

export function createCharacterModel(def: CharacterDef): CharacterRig {
  const preset = PRESETS[def.model] ?? knight
  return new Rig(preset(def.colors))
}

// ─────────────────────────────── portraits ───────────────────────────────

const PORTRAIT_POSE: Pose = {
  legL: 0.12,
  legR: -0.08,
  armL: 0.15,
  armR: 0.35,
  armSpread: 0.25,
  lean: 0.04,
  bob: 0,
  crouch: 0,
  head: -0.05,
  tail: 0.4,
}

const portraitCache = new WeakMap<THREE.WebGLRenderer, Map<string, string>>()
let srgbLut: Uint8Array | null = null

/**
 * Renders a character in a 3/4 front view into a transparent PNG data URL,
 * with its own scene, camera and lights. The renderer's target and clear
 * colour are restored, so the main scene never notices.
 */
export function renderCharacterPortrait(renderer: THREE.WebGLRenderer, def: CharacterDef, size: number): string {
  const out = Math.max(16, Math.min(512, Math.round(size) || 128))
  const key = `${def.id}:${out}`
  let cache = portraitCache.get(renderer)
  if (!cache) portraitCache.set(renderer, (cache = new Map()))
  const cached = cache.get(key)
  if (cached) return cached

  // Render at twice the size and scale down in 2D for cheap anti-aliasing.
  const px = out * 2
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#6d6a8a', 1.5))
  const sun = new THREE.DirectionalLight('#fff4e0', 2.6)
  sun.position.set(2, 4, 3)
  const rim = new THREE.DirectionalLight('#9fd0ff', 1.4)
  rim.position.set(-3, 2, -2.5)
  scene.add(sun, rim)

  const rig = createCharacterModel(def)
  rig.applyPose(PORTRAIT_POSE)
  scene.add(rig.root)
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(rig.root)
  const center = box.getCenter(new THREE.Vector3())
  const extent = box.getSize(new THREE.Vector3())

  const fov = 30
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 50)
  const fit = Math.max(extent.y, extent.x * 1.1, extent.z) * 0.5 * 1.12
  const dist = fit / Math.tan(THREE.MathUtils.degToRad(fov / 2)) + extent.z * 0.5
  const angle = 0.6
  camera.position.set(center.x + Math.sin(angle) * dist, center.y + dist * 0.16, center.z + Math.cos(angle) * dist)
  camera.lookAt(center)

  const target = new THREE.WebGLRenderTarget(px, px, { depthBuffer: true })
  const prevTarget = renderer.getRenderTarget()
  const prevColor = renderer.getClearColor(new THREE.Color())
  const prevAlpha = renderer.getClearAlpha()
  const pixels = new Uint8Array(px * px * 4)
  try {
    renderer.setRenderTarget(target)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(target, 0, 0, px, px, pixels)
  } finally {
    renderer.setRenderTarget(prevTarget)
    renderer.setClearColor(prevColor, prevAlpha)
    target.dispose()
    rig.dispose()
  }

  const big = document.createElement('canvas')
  big.width = big.height = px
  const g = big.getContext('2d')
  const small = document.createElement('canvas')
  small.width = small.height = out
  const s = small.getContext('2d')
  if (!g || !s) return ''
  // Render targets hold linear colour and WebGL rows run bottom-up: encode and flip.
  const lut = linearToSrgb()
  const img = g.createImageData(px, px)
  const row = px * 4
  for (let y = 0; y < px; y++) {
    const src = (px - 1 - y) * row
    const dst = y * row
    for (let i = 0; i < row; i += 4) {
      img.data[dst + i] = lut[pixels[src + i]]
      img.data[dst + i + 1] = lut[pixels[src + i + 1]]
      img.data[dst + i + 2] = lut[pixels[src + i + 2]]
      img.data[dst + i + 3] = pixels[src + i + 3]
    }
  }
  g.putImageData(img, 0, 0)
  s.imageSmoothingEnabled = true
  s.imageSmoothingQuality = 'high'
  s.drawImage(big, 0, 0, out, out)
  const url = small.toDataURL('image/png')
  cache.set(key, url)
  return url
}

function linearToSrgb(): Uint8Array {
  if (srgbLut) return srgbLut
  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    const c = i / 255
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    lut[i] = Math.round(Math.min(1, Math.max(0, v)) * 255)
  }
  return (srgbLut = lut)
}
