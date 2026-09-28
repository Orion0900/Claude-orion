/**
 * Procedural low-poly enemy models. Each preset merges a handful of
 * primitives into one non-indexed BufferGeometry with per-vertex colours, so
 * a single InstancedMesh draws a whole multi-coloured crowd in one call.
 *
 * Conventions: the model faces +Z, its feet sit at y = 0 and it is
 * normalised to exactly 1 unit tall; the renderer scales it by the def's
 * height. A per-vertex `aGlow` (0..1) marks parts that ignore lighting, like
 * eyes, flames and runes.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { EnemyDef } from '../game/types'

type V3 = readonly [number, number, number]
type Col = string | THREE.Color

const O: V3 = [0, 0, 0]
const I: V3 = [1, 1, 1]
const PI = Math.PI
const TAU = Math.PI * 2

const EYE = '#fdfdf5'
const PUPIL = '#16141f'
const MOUTH = '#2a1414'
const HOLLOW = '#1a1020'

/** How a model moves; the renderer turns this into stepped bob, waddle and squash. */
export type AnimStyle = 'walk' | 'hop' | 'flap' | 'float' | 'heavy' | 'skitter' | 'waddle'

const ANIM: Record<string, AnimStyle> = {
  sprout: 'hop',
  goblin: 'walk',
  bat: 'flap',
  shroom: 'waddle',
  boar: 'walk',
  treant: 'heavy',
  scarab: 'skitter',
  mummy: 'waddle',
  vulture: 'flap',
  scorpion: 'skitter',
  cactoid: 'hop',
  sand_golem: 'heavy',
  skeleton: 'walk',
  ghoul: 'walk',
  wisp: 'float',
  pumpkin_bomb: 'hop',
  gargoyle: 'walk',
  crypt_knight: 'heavy',
  ghost: 'float',
  stone_golem: 'heavy',
  scorpion_king: 'skitter',
  bone_colossus: 'heavy',
  barkzilla: 'heavy',
  jackal_pharaoh: 'walk',
  grave_warden: 'float',
}

export function animStyleOf(model: string): AnimStyle {
  return ANIM[model] ?? 'walk'
}

// ─────────────────────────────── builder ───────────────────────────────

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _c = new THREE.Color()

/** Collects coloured primitives and merges them into one geometry. */
class Parts {
  private list: THREE.BufferGeometry[] = []

  add(geo: THREE.BufferGeometry, color: Col, at: V3 = O, rot: V3 = O, scale: V3 = I, glow = 0): this {
    const g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    g.deleteAttribute('uv')
    g.deleteAttribute('normal')
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]))
    g.applyMatrix4(_m.compose(_p.set(at[0], at[1], at[2]), _q, _s.set(scale[0], scale[1], scale[2])))
    const n = g.getAttribute('position').count
    _c.set(color)
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      colors[i * 3] = _c.r
      colors[i * 3 + 1] = _c.g
      colors[i * 3 + 2] = _c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1))
    this.list.push(g)
    return this
  }

  /** Adds a part and its mirror image across x = 0 (rotations mirrored to match). */
  pair(geo: THREE.BufferGeometry, color: Col, at: V3, rot: V3 = O, scale: V3 = I, glow = 0): this {
    const twin = geo.clone()
    this.add(geo, color, at, rot, scale, glow)
    return this.add(twin, color, [-at[0], at[1], at[2]], [rot[0], -rot[1], -rot[2]], scale, glow)
  }

  /** Merges, drops the feet to y = 0 and scales to exactly 1 unit tall. */
  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.list, false)
    for (const g of this.list) g.dispose()
    this.list = []
    if (!merged) throw new Error('EnemyModels: merge failed')
    merged.computeBoundingBox()
    const box = merged.boundingBox as THREE.Box3
    const h = box.max.y - box.min.y || 1
    merged.translate(0, -box.min.y, 0)
    merged.scale(1 / h, 1 / h, 1 / h)
    merged.computeVertexNormals()
    merged.computeBoundingBox()
    merged.computeBoundingSphere()
    return merged
  }
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const cyl = (rTop: number, rBot: number, h: number, seg = 7) => new THREE.CylinderGeometry(rTop, rBot, h, seg)
const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg)
const ico = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail)
const dod = (r: number) => new THREE.DodecahedronGeometry(r, 0)
const oct = (r: number) => new THREE.OctahedronGeometry(r, 0)
const dome = (r: number, w = 9, h = 4) => new THREE.SphereGeometry(r, w, h, 0, TAU, 0, PI / 2)
const ring = (r: number, tube: number, seg = 9) => new THREE.TorusGeometry(r, tube, 3, seg)

/** A darker or lighter copy of a colour (factor in linear space). */
function shade(c: Col, f: number): THREE.Color {
  return new THREE.Color(c).multiplyScalar(f)
}

/** Round cartoon eyes: whites with pupils, set into a face at depth z. */
function eyes(p: Parts, x: number, y: number, z: number, size: number): void {
  p.pair(box(size, size * 1.15, size * 0.8), EYE, [x, y, z])
  p.pair(box(size * 0.5, size * 0.6, size * 0.4), PUPIL, [x * 0.92, y - size * 0.08, z + size * 0.32])
}

/** Slanted brows make anything look angry. */
function brows(p: Parts, x: number, y: number, z: number, w: number, color: Col, tilt = 0.4): void {
  p.pair(box(w, w * 0.28, w * 0.35), color, [x, y, z], [0, 0, tilt])
}

// ─────────────────────────────── presets ───────────────────────────────

type Builder = (p: Parts, color: string, accent: string) => void

const BUILDERS: Record<string, Builder> = {
  sprout(p, bulb, leaf) {
    const stem = shade(leaf, 0.75)
    p.pair(cyl(0.07, 0.09, 0.2, 5), stem, [0.13, 0.1, 0])
    p.pair(box(0.14, 0.06, 0.22), stem, [0.13, 0.03, 0.05])
    p.add(ico(0.33, 1), bulb, [0, 0.46, 0], O, [1, 1.05, 1])
    p.pair(box(0.08, 0.05, 0.06), '#ff8fb0', [0.18, 0.42, 0.26])
    eyes(p, 0.11, 0.54, 0.27, 0.1)
    p.add(box(0.1, 0.03, 0.06), MOUTH, [0, 0.42, 0.3])
    p.add(cyl(0.03, 0.045, 0.2, 5), stem, [0, 0.84, 0])
    p.pair(cone(0.11, 0.36, 4), leaf, [0.13, 0.95, 0], [0, 0, -1.0], [1, 1, 0.4])
    p.add(cone(0.09, 0.32, 4), shade(leaf, 1.2), [0, 1.02, -0.07], [-0.45, 0, 0], [1, 1, 0.4])
    p.pair(cone(0.05, 0.16, 4), leaf, [0.35, 0.45, 0], [0, 0, -1.9], [1, 1, 0.5])
  },

  goblin(p, skin, cloth) {
    const dark = shade(skin, 0.65)
    p.pair(box(0.13, 0.3, 0.14), dark, [0.12, 0.15, 0])
    p.pair(box(0.15, 0.07, 0.24), '#5a3a1f', [0.12, 0.035, 0.04])
    p.add(box(0.42, 0.38, 0.3), skin, [0, 0.5, 0])
    p.add(ico(0.21), shade(skin, 1.1), [0, 0.46, 0.08], O, [1.05, 0.9, 0.8])
    p.add(box(0.47, 0.15, 0.34), cloth, [0, 0.34, 0])
    p.add(ico(0.27, 1), skin, [0, 0.9, 0.03], O, [1.05, 0.95, 1])
    p.pair(cone(0.09, 0.42, 4), skin, [0.37, 0.97, 0], [0, 0, -1.3], [1, 1, 0.45])
    p.pair(cone(0.05, 0.26, 4), '#ff9aa0', [0.34, 0.97, 0.02], [0, 0, -1.3], [1, 1, 0.3])
    p.pair(box(0.08, 0.07, 0.06), '#ffe23a', [0.09, 0.96, 0.24])
    p.pair(box(0.035, 0.05, 0.04), PUPIL, [0.09, 0.955, 0.27])
    brows(p, 0.1, 1.02, 0.25, 0.1, dark)
    p.add(cone(0.05, 0.16, 4), skin, [0, 0.88, 0.3], [PI / 2, 0, 0])
    p.add(box(0.16, 0.03, 0.06), MOUTH, [0, 0.8, 0.25])
    p.pair(box(0.03, 0.045, 0.03), '#fffbe8', [0.05, 0.79, 0.27])
    p.pair(box(0.1, 0.3, 0.1), skin, [0.28, 0.52, 0.03], [0, 0, 0.15])
    p.add(cyl(0.075, 0.04, 0.55, 6), cloth, [-0.3, 0.55, 0.2], [0.9, 0, 0])
    p.add(ico(0.11), shade(cloth, 0.8), [-0.3, 0.72, 0.42])
  },

  bat(p, fur, eye) {
    const wing = shade(fur, 0.55)
    p.add(ico(0.2, 1), fur, [0, 0.4, 0], O, [1, 1.1, 0.95])
    p.add(ico(0.13), shade(fur, 1.4), [0, 0.35, 0.09])
    p.pair(cone(0.07, 0.2, 4), fur, [0.1, 0.63, 0], [0, 0, -0.3])
    p.pair(box(0.36, 0.26, 0.03), wing, [0.32, 0.48, -0.05], [0, 0.25, 0.2])
    p.pair(box(0.32, 0.24, 0.025), wing, [0.62, 0.6, -0.14], [0, 0.35, 0.55])
    p.pair(cone(0.08, 0.14, 3), wing, [0.3, 0.33, -0.05], [PI, 0.25, 0], [1, 1, 0.3])
    p.pair(cone(0.07, 0.13, 3), wing, [0.55, 0.43, -0.12], [PI, 0.35, 0.3], [1, 1, 0.3])
    p.pair(cone(0.03, 0.12, 3), shade(fur, 0.4), [0.78, 0.8, -0.2], [0, 0, -0.5])
    p.pair(box(0.06, 0.05, 0.05), eye, [0.07, 0.45, 0.17], O, I, 1)
    p.pair(cone(0.02, 0.07, 3), '#ffffff', [0.04, 0.31, 0.17], [PI, 0, 0])
    p.pair(box(0.03, 0.09, 0.03), shade(fur, 0.4), [0.06, 0.18, 0])
  },

  shroom(p, cap, stem) {
    p.pair(box(0.14, 0.06, 0.22), shade(stem, 0.75), [0.11, 0.03, 0.06])
    p.add(cyl(0.2, 0.24, 0.5, 8), stem, [0, 0.3, 0])
    p.add(cyl(0.52, 0.4, 0.08, 9), shade(stem, 0.8), [0, 0.52, 0])
    p.add(cyl(0.14, 0.53, 0.32, 9), cap, [0, 0.72, 0])
    p.add(cyl(0.02, 0.14, 0.08, 9), cap, [0, 0.92, 0])
    for (const [a, y, r] of [[0.3, 0.7, 0.35], [1.9, 0.66, 0.42], [3.3, 0.72, 0.33], [4.6, 0.68, 0.4], [5.6, 0.76, 0.27]]) {
      p.add(ico(0.075), '#fff8ec', [Math.sin(a) * r, y, Math.cos(a) * r], O, [1, 0.55, 1])
    }
    p.add(ico(0.07), '#fff8ec', [0, 0.92, 0], O, [1, 0.5, 1])
    eyes(p, 0.08, 0.38, 0.19, 0.075)
    brows(p, 0.08, 0.45, 0.21, 0.09, MOUTH, 0.35)
    p.add(box(0.08, 0.025, 0.06), MOUTH, [0, 0.29, 0.21])
  },

  boar(p, hide, tusk) {
    const dark = shade(hide, 0.6)
    p.add(ico(0.42, 1), hide, [0, 0.55, -0.05], O, [0.9, 0.8, 1.25])
    for (const z of [0.25, -0.32]) {
      p.pair(box(0.12, 0.3, 0.12), dark, [0.2, 0.17, z])
      p.pair(box(0.13, 0.06, 0.15), '#2a1a12', [0.2, 0.03, z + 0.01])
    }
    p.add(box(0.36, 0.34, 0.34), hide, [0, 0.6, 0.48])
    p.add(cyl(0.12, 0.13, 0.16, 6), '#e8a3a0', [0, 0.53, 0.7], [PI / 2, 0, 0])
    p.pair(box(0.03, 0.04, 0.03), '#5a2a2a', [0.04, 0.53, 0.78])
    p.pair(cone(0.045, 0.22, 4), tusk, [0.14, 0.52, 0.66], [0.4, 0, -0.35])
    p.pair(box(0.06, 0.06, 0.05), '#1a1010', [0.12, 0.69, 0.65])
    brows(p, 0.12, 0.75, 0.66, 0.1, dark, 0.45)
    p.pair(cone(0.08, 0.16, 4), shade(hide, 0.8), [0.15, 0.82, 0.4], [-0.3, 0, -0.4])
    for (let i = 0; i < 4; i++) p.add(cone(0.07, 0.2, 4), dark, [0, 0.9 - i * 0.03, 0.28 - i * 0.2], [-0.5, 0, 0])
    p.add(cyl(0.02, 0.02, 0.2, 4), dark, [0, 0.62, -0.6], [0.8, 0, 0])
  },

  treant(p, bark, leaf) {
    const dark = shade(bark, 0.65)
    p.pair(cyl(0.22, 0.3, 0.7, 6), dark, [0.28, 0.35, 0])
    p.pair(cone(0.12, 0.45, 4), dark, [0.32, 0.1, 0.32], [1.3, 0, 0])
    p.add(cyl(0.45, 0.55, 1.4, 7), bark, [0, 1.3, 0])
    p.add(box(0.1, 1.1, 0.1), dark, [0.25, 1.2, 0.45], [0, 0, 0.05])
    p.pair(cyl(0.12, 0.16, 0.9, 5), bark, [0.7, 1.55, 0.1], [0, 0, -1.0])
    p.pair(cyl(0.08, 0.12, 0.6, 5), bark, [1.02, 1.18, 0.25], [0.4, 0, 0.3])
    p.pair(cone(0.05, 0.3, 3), dark, [1.1, 0.88, 0.35], [2.8, 0, 0.2])
    p.pair(cone(0.05, 0.28, 3), dark, [1.18, 0.92, 0.2], [2.9, 0, 0.5])
    p.add(ico(0.78), leaf, [0, 2.35, 0])
    p.pair(ico(0.52), shade(leaf, 0.8), [0.55, 2.15, -0.15])
    p.add(ico(0.52), shade(leaf, 1.2), [0.1, 2.8, -0.1])
    p.pair(box(0.2, 0.14, 0.3), HOLLOW, [0.17, 1.55, 0.36])
    p.pair(box(0.08, 0.07, 0.2), '#ffe45a', [0.17, 1.55, 0.42], O, I, 1)
    brows(p, 0.18, 1.69, 0.4, 0.27, dark, 0.3)
    p.add(box(0.36, 0.1, 0.3), HOLLOW, [0, 1.2, 0.38])
    p.add(cyl(0.02, 0.1, 0.07, 6), '#e8453a', [0.5, 0.95, 0.2], [0, 0, -1.3])
  },

  scarab(p, shell, gold) {
    const dark = '#1d2a33'
    for (const [z, yaw] of [[0.15, 0.45], [0, 0], [-0.15, -0.45]]) {
      p.pair(box(0.3, 0.04, 0.045), dark, [0.25, 0.1, z], [0, yaw, -0.45])
    }
    p.add(ico(0.25), dark, [0, 0.2, 0], O, [1, 0.6, 1.3])
    p.pair(ico(0.2, 1), shell, [0.1, 0.28, -0.04], O, [0.85, 0.8, 1.5])
    p.add(box(0.035, 0.05, 0.3), gold, [0, 0.425, -0.04])
    p.pair(ico(0.05), gold, [0.14, 0.4, -0.12])
    p.add(ico(0.13), dark, [0, 0.22, 0.3], O, [1, 0.8, 1])
    p.add(cone(0.05, 0.24, 4), gold, [0, 0.34, 0.4], [0.7, 0, 0])
    p.pair(box(0.045, 0.045, 0.05), '#ffe45a', [0.08, 0.26, 0.39], O, I, 1)
    p.pair(cone(0.025, 0.1, 3), dark, [0.05, 0.17, 0.43], [1.4, 0, 0.4])
  },

  mummy(p, wrap, eye) {
    const band = shade(wrap, 0.72)
    p.pair(box(0.16, 0.7, 0.18), wrap, [0.11, 0.35, 0])
    p.pair(box(0.18, 0.05, 0.2), band, [0.11, 0.24, 0], [0, 0, -0.2])
    p.pair(box(0.18, 0.05, 0.2), band, [0.11, 0.5, 0], [0, 0, 0.25])
    p.add(box(0.44, 0.62, 0.28), wrap, [0, 1.0, 0])
    for (const [y, tilt] of [[0.78, 0.12], [0.98, -0.1], [1.18, 0.15]]) p.add(box(0.46, 0.05, 0.3), band, [0, y, 0], [0, 0, tilt])
    p.pair(box(0.12, 0.12, 0.52), wrap, [0.28, 1.18, 0.22], [-0.1, 0, 0])
    p.pair(box(0.13, 0.04, 0.14), band, [0.28, 1.19, 0.3], [0, 0, 0.3])
    p.pair(box(0.1, 0.1, 0.1), band, [0.28, 1.2, 0.52])
    p.add(box(0.3, 0.32, 0.3), wrap, [0, 1.5, 0.02])
    p.add(box(0.32, 0.05, 0.32), band, [0, 1.6, 0.02], [0, 0, 0.2])
    p.add(box(0.26, 0.07, 0.1), '#20242e', [0, 1.5, 0.14])
    p.pair(box(0.06, 0.05, 0.04), eye, [0.07, 1.5, 0.19], O, I, 1)
    p.add(box(0.06, 0.4, 0.03), wrap, [0.18, 0.75, -0.16], [0.3, 0, 0.2])
  },

  vulture(p, body, head) {
    const dark = shade(body, 0.7)
    p.pair(cyl(0.025, 0.025, 0.25, 4), '#e0a060', [0.08, 0.12, 0])
    p.pair(box(0.08, 0.02, 0.12), '#e0a060', [0.08, 0.01, 0.03])
    p.add(ico(0.26, 1), body, [0, 0.42, -0.02], O, [0.9, 0.95, 1.2])
    p.add(box(0.22, 0.04, 0.26), dark, [0, 0.36, -0.34], [0.35, 0, 0])
    p.pair(box(0.5, 0.04, 0.32), dark, [0.36, 0.52, -0.05], [0, 0, 0.3])
    p.pair(box(0.38, 0.03, 0.26), shade(dark, 0.75), [0.76, 0.615, -0.08], [0, 0.15, 0.12])
    p.add(ring(0.12, 0.06, 8), '#f2ecde', [0, 0.6, 0.1], [PI / 2 - 0.3, 0, 0])
    p.add(cyl(0.05, 0.06, 0.18, 5), head, [0, 0.68, 0.15], [0.4, 0, 0])
    p.add(ico(0.1), head, [0, 0.78, 0.2])
    p.add(cone(0.05, 0.16, 4), '#e8d49a', [0, 0.76, 0.32], [PI / 2 + 0.3, 0, 0])
    p.pair(box(0.03, 0.03, 0.04), '#1a1010', [0.06, 0.8, 0.26])
  },

  scorpion(p, shell, dark) {
    scorpionBody(p, shell, dark, false)
  },

  cactoid(p, green, flower) {
    const deep = shade(green, 0.65)
    p.pair(box(0.14, 0.08, 0.22), deep, [0.12, 0.04, 0.05])
    p.add(cyl(0.3, 0.3, 0.8, 8), green, [0, 0.5, 0])
    p.add(dome(0.3, 8, 3), green, [0, 0.9, 0])
    for (const a of [0.8, 2.4, 3.9, 5.5]) p.add(box(0.05, 0.8, 0.05), deep, [Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.3])
    p.pair(cyl(0.1, 0.1, 0.3, 6), green, [0.42, 0.55, 0], [0, 0, PI / 2])
    p.pair(cyl(0.1, 0.1, 0.36, 6), green, [0.54, 0.75, 0])
    p.pair(dome(0.1, 6, 2), green, [0.54, 0.93, 0])
    for (const [a, y] of [[0.5, 0.3], [1.2, 0.75], [2.0, 0.45], [2.8, 0.85], [3.6, 0.35], [4.4, 0.7], [5.2, 0.5], [5.9, 0.9]]) {
      p.add(cone(0.02, 0.09, 3), '#fff3b0', [Math.sin(a) * 0.32, y, Math.cos(a) * 0.32], [0, a - PI / 2, -PI / 2])
    }
    p.add(cone(0.13, 0.1, 5), flower, [0, 1.22, 0], [PI, 0, 0])
    p.add(ico(0.05), '#ffe45a', [0, 1.24, 0])
    eyes(p, 0.1, 0.72, 0.27, 0.09)
    brows(p, 0.1, 0.81, 0.3, 0.12, deep, 0.45)
    p.add(box(0.16, 0.04, 0.06), MOUTH, [0, 0.55, 0.29])
    p.pair(box(0.03, 0.04, 0.04), '#fffbe8', [0.04, 0.565, 0.31])
  },

  sand_golem(p, sand, rock) {
    const dark = shade(sand, 0.78)
    p.pair(box(0.45, 0.7, 0.5), dark, [0.35, 0.35, 0])
    p.add(ico(0.85), sand, [0, 1.45, 0], O, [1.1, 0.9, 0.8])
    p.pair(ico(0.4), rock, [0.85, 1.9, 0])
    p.pair(box(0.38, 0.9, 0.38), sand, [1.0, 1.25, 0.1], [0, 0, 0.1])
    p.pair(ico(0.36), dark, [1.05, 0.7, 0.2])
    p.add(box(0.5, 0.4, 0.45), dark, [0, 2.3, 0.15])
    p.pair(box(0.12, 0.07, 0.12), '#ff9a2a', [0.12, 2.33, 0.36], O, I, 1)
    p.add(ico(0.2), rock, [0.3, 1.2, 0.58])
    p.add(ico(0.16), rock, [-0.35, 1.6, 0.52])
    p.add(ico(0.18), rock, [0.1, 1.9, -0.6])
    p.add(cone(0.25, 0.4, 5), sand, [0, 2.65, 0.1])
  },

  skeleton(p, bone, eye) {
    const dark = '#2c2838'
    p.pair(box(0.07, 0.38, 0.07), bone, [0.11, 0.62, 0])
    p.pair(box(0.06, 0.38, 0.06), bone, [0.11, 0.22, 0.02])
    p.pair(ico(0.055), bone, [0.11, 0.42, 0.02])
    p.pair(box(0.1, 0.05, 0.18), bone, [0.11, 0.03, 0.05])
    p.add(box(0.3, 0.12, 0.14), bone, [0, 0.84, 0])
    p.add(cyl(0.03, 0.03, 0.35, 5), bone, [0, 1.02, -0.03])
    for (let k = 0; k < 3; k++) p.add(ring(0.14 - k * 0.012, 0.022, 8), bone, [0, 1.08 + k * 0.1, 0], [PI / 2, 0, 0], [1, 1, 0.75])
    p.add(box(0.42, 0.06, 0.1), bone, [0, 1.33, 0])
    p.pair(box(0.06, 0.3, 0.06), bone, [0.22, 1.17, 0.03], [0.3, 0, 0.1])
    p.pair(box(0.05, 0.28, 0.05), bone, [0.24, 0.95, 0.14], [0.6, 0, 0.05])
    p.add(box(0.26, 0.24, 0.26), bone, [0, 1.52, 0.02])
    p.add(ico(0.16), bone, [0, 1.6, 0])
    p.add(box(0.2, 0.07, 0.2), bone, [0, 1.37, 0.05])
    p.pair(box(0.07, 0.07, 0.1), dark, [0.06, 1.53, 0.12])
    p.pair(box(0.03, 0.03, 0.04), eye, [0.06, 1.53, 0.16], O, I, 1)
    p.add(box(0.03, 0.04, 0.1), dark, [0, 1.46, 0.12])
    p.add(box(0.05, 0.5, 0.02), '#a9a39a', [-0.25, 0.8, 0.42], [PI / 2 - 0.2, 0, 0])
    p.add(box(0.14, 0.03, 0.05), '#7a5a3a', [-0.25, 0.83, 0.2])
  },

  ghoul(p, skin, eye) {
    const dark = shade(skin, 0.65)
    const rag = '#4a3f5a'
    p.pair(box(0.11, 0.3, 0.11), skin, [0.13, 0.4, 0.05], [-0.5, 0, 0])
    p.pair(box(0.09, 0.3, 0.09), dark, [0.13, 0.15, -0.02], [0.3, 0, 0])
    p.pair(box(0.11, 0.05, 0.2), dark, [0.13, 0.025, 0.05])
    p.add(box(0.4, 0.45, 0.28), skin, [0, 0.8, 0.1], [0.6, 0, 0])
    p.add(cone(0.05, 0.12, 4), dark, [0, 1.0, -0.06], [-0.6, 0, 0])
    p.add(cone(0.05, 0.12, 4), dark, [0, 0.87, -0.14], [-0.8, 0, 0])
    p.add(box(0.42, 0.18, 0.3), rag, [0, 0.55, 0.02])
    p.add(box(0.26, 0.24, 0.26), skin, [0, 1.05, 0.36])
    p.add(box(0.22, 0.07, 0.2), dark, [0, 0.93, 0.4])
    p.pair(cone(0.02, 0.06, 3), '#f2ecd0', [0.05, 0.96, 0.49], [PI, 0, 0])
    p.pair(box(0.06, 0.045, 0.05), eye, [0.07, 1.08, 0.48], O, I, 1)
    p.pair(cone(0.04, 0.14, 3), skin, [0.15, 1.13, 0.3], [0, 0, -1.1])
    p.pair(box(0.08, 0.36, 0.08), skin, [0.28, 0.78, 0.3], [0.3, 0, 0.15])
    p.pair(box(0.07, 0.36, 0.07), skin, [0.32, 0.45, 0.4], [-0.2, 0, 0.05])
    p.pair(cone(0.045, 0.15, 3), '#e8e0c8', [0.32, 0.23, 0.45], [PI, 0, 0])
  },

  wisp(p, flame, core) {
    p.add(ico(0.28, 1), flame, [0, 0.3, 0], O, [1, 0.9, 1], 0.8)
    p.add(ico(0.18, 1), core, [0, 0.36, 0.05], O, I, 1)
    p.add(cone(0.28, 0.55, 6), flame, [0, 0.58, 0], O, I, 0.85)
    p.add(cone(0.16, 0.36, 5), shade(flame, 1.25), [0.1, 0.82, -0.05], [0, 0, -0.3], I, 1)
    p.add(cone(0.13, 0.3, 5), flame, [-0.12, 0.76, 0.02], [0, 0, 0.35], I, 1)
    p.add(cone(0.1, 0.25, 4), flame, [0, 0.06, -0.1], [PI + 0.4, 0, 0], I, 0.8)
    p.pair(cone(0.06, 0.18, 4), flame, [0.3, 0.35, 0], [0, 0, -1.2], I, 0.9)
    p.pair(box(0.06, 0.1, 0.1), '#0f2e2a', [0.08, 0.4, 0.22])
  },

  pumpkin_bomb(p, orange, face) {
    const stem = '#4f7a2a'
    p.pair(box(0.08, 0.14, 0.08), stem, [0.14, 0.07, 0])
    p.add(ico(0.3, 1), orange, [0, 0.4, 0], O, [1, 0.95, 1])
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU
      p.add(ico(0.22, 1), shade(orange, k % 2 ? 0.85 : 1), [Math.sin(a) * 0.18, 0.4, Math.cos(a) * 0.18], O, [0.9, 1, 0.9])
    }
    p.add(cyl(0.05, 0.07, 0.14, 5), stem, [0, 0.7, 0], [0, 0, 0.15])
    p.add(box(0.14, 0.02, 0.1), '#58b83c', [-0.09, 0.72, 0.05], [0, 0.5, 0.4])
    p.add(cyl(0.02, 0.02, 0.22, 4), '#3a3a3a', [0.07, 0.85, 0], [0, 0, -0.4])
    p.add(oct(0.07), '#ffe45a', [0.12, 0.96, 0], O, I, 1)
    p.add(oct(0.045), '#ff6a1a', [0.15, 1.0, 0.02], [0.5, 0.5, 0], I, 1)
    p.pair(box(0.1, 0.1, 0.12), face, [0.12, 0.48, 0.34], [0, 0, PI / 4], I, 1)
    p.add(box(0.3, 0.07, 0.12), face, [0, 0.32, 0.35], O, I, 1)
    p.pair(box(0.05, 0.05, 0.12), orange, [0.07, 0.35, 0.37])
  },

  gargoyle(p, stone, eye) {
    const dark = shade(stone, 0.68)
    const horn = '#3a3440'
    p.pair(box(0.16, 0.3, 0.2), stone, [0.18, 0.35, 0], [-0.4, 0, 0])
    p.pair(box(0.13, 0.3, 0.14), dark, [0.18, 0.15, 0.05], [0.3, 0, 0])
    p.pair(box(0.16, 0.06, 0.26), dark, [0.18, 0.03, 0.08])
    p.add(box(0.5, 0.55, 0.35), stone, [0, 0.85, 0.05], [0.25, 0, 0])
    p.add(box(0.32, 0.3, 0.32), stone, [0, 1.28, 0.22])
    p.add(box(0.22, 0.14, 0.2), dark, [0, 1.2, 0.42])
    p.pair(cone(0.02, 0.08, 3), '#f2ecd0', [0.06, 1.12, 0.49], [PI, 0, 0])
    p.pair(cone(0.06, 0.34, 4), horn, [0.13, 1.52, 0.15], [-0.5, 0, -0.45])
    p.pair(box(0.07, 0.045, 0.06), eye, [0.08, 1.33, 0.37], O, I, 1)
    p.pair(box(0.7, 0.5, 0.04), dark, [0.52, 1.3, -0.3], [0, 0.35, 0.5])
    p.pair(cyl(0.035, 0.035, 0.85, 4), stone, [0.52, 1.52, -0.28], [0, 0.35, -1.05])
    p.pair(cone(0.05, 0.26, 3), dark, [0.9, 1.78, -0.45], [0, 0, -0.5])
    p.pair(cone(0.1, 0.22, 3), dark, [0.42, 1.03, -0.26], [PI, 0.35, 0.5], [1, 1, 0.3])
    p.pair(box(0.11, 0.4, 0.11), stone, [0.32, 0.8, 0.25], [-0.4, 0, 0.15])
    p.pair(cone(0.04, 0.13, 3), horn, [0.34, 0.6, 0.39], [2.6, 0, 0])
    p.add(cyl(0.04, 0.07, 0.6, 4), stone, [0, 0.5, -0.4], [-1.1, 0, 0])
    p.add(oct(0.1), dark, [0, 0.36, -0.68], O, [0.4, 1, 1.2])
  },

  crypt_knight(p, steel, spectral) {
    const dark = shade(steel, 0.6)
    const bright = shade(steel, 1.3)
    p.pair(box(0.3, 0.8, 0.32), dark, [0.22, 0.4, 0])
    p.pair(box(0.34, 0.14, 0.44), '#2a2e3a', [0.22, 0.07, 0.05])
    p.add(box(0.72, 0.3, 0.44), steel, [0, 0.9, 0])
    p.add(box(0.8, 0.7, 0.5), steel, [0, 1.4, 0])
    p.add(box(0.1, 0.6, 0.1), bright, [0, 1.42, 0.25])
    p.pair(ico(0.29), bright, [0.5, 1.78, 0], O, [1, 0.8, 1])
    p.pair(box(0.24, 0.62, 0.26), dark, [0.55, 1.35, 0.05])
    p.add(box(0.46, 0.46, 0.46), steel, [0, 2.1, 0.02])
    p.add(box(0.36, 0.06, 0.1), spectral, [0, 2.12, 0.22], O, I, 1)
    p.add(box(0.06, 0.26, 0.5), '#9a2a3a', [0, 2.44, 0])
    p.add(box(0.72, 1.3, 0.06), '#6a1f2a', [0, 1.25, -0.3], [-0.08, 0, 0])
    p.add(box(0.1, 0.95, 0.72), steel, [0.74, 1.2, 0.3])
    p.add(box(0.12, 0.8, 0.6), dark, [0.73, 1.2, 0.3])
    p.add(box(0.05, 0.36, 0.12), spectral, [0.8, 1.25, 0.3], O, I, 1)
    p.add(box(0.05, 0.12, 0.34), spectral, [0.8, 1.3, 0.3], O, I, 1)
    p.add(box(0.1, 1.2, 0.05), '#c8d0dc', [-0.62, 1.35, 0.45], [0.3, 0, 0])
    p.add(box(0.32, 0.06, 0.09), '#d8b04a', [-0.62, 0.8, 0.28], [0.3, 0, 0])
  },

  ghost(p, sheet, eye) {
    const g = 0.25
    p.add(cyl(0.3, 0.46, 0.8, 9), sheet, [0, 0.62, 0], O, I, g)
    p.add(dome(0.3, 9, 4), sheet, [0, 1.02, 0], O, I, g)
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU
      p.add(cone(0.11, 0.24, 4), sheet, [Math.sin(a) * 0.37, 0.17, Math.cos(a) * 0.37], [PI, 0, 0], I, g)
    }
    p.pair(cone(0.09, 0.3, 4), sheet, [0.42, 0.72, 0.05], [0, 0, -1.9], I, g)
    p.pair(box(0.1, 0.16, 0.1), eye, [0.11, 1.0, 0.26])
    p.add(box(0.12, 0.1, 0.1), eye, [0, 0.83, 0.32])
  },

  stone_golem(p, rock, rune) {
    const dark = shade(rock, 0.68)
    const moss = '#5fa83c'
    p.pair(ico(0.42), dark, [0.45, 0.4, 0], O, [1, 1.1, 1])
    p.pair(box(0.6, 0.2, 0.7), dark, [0.45, 0.1, 0.1])
    p.add(dod(0.95), rock, [0, 1.6, 0], O, [1.15, 1, 0.85])
    p.pair(ico(0.36), moss, [0.55, 2.35, -0.05], O, [1.2, 0.5, 1])
    p.add(dod(0.42), rock, [0, 2.55, 0.2])
    p.pair(box(0.14, 0.1, 0.16), rune, [0.14, 2.58, 0.52], O, I, 1)
    brows(p, 0.15, 2.72, 0.5, 0.22, dark, 0.35)
    p.add(box(0.1, 0.4, 0.2), rune, [0, 1.7, 0.74], O, I, 1)
    p.add(box(0.3, 0.08, 0.2), rune, [0, 1.8, 0.73], O, I, 1)
    p.pair(ico(0.45), dark, [1.15, 2.1, 0])
    p.pair(ico(0.38), rock, [1.3, 1.55, 0.1])
    p.pair(dod(0.5), dark, [1.35, 0.9, 0.2])
    p.pair(ico(0.18), moss, [1.2, 2.45, 0.1], O, [1.2, 0.5, 1])
  },

  scorpion_king(p, shell, crown) {
    scorpionBody(p, shell, shade(shell, 0.55), true)
    p.add(cyl(0.12, 0.13, 0.09, 6), crown, [0, 0.37, 0.3])
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU
      p.add(cone(0.03, 0.1, 3), crown, [Math.sin(a) * 0.11, 0.46, 0.3 + Math.cos(a) * 0.11])
    }
    p.add(oct(0.04), '#ff2a5a', [0, 0.38, 0.43], O, I, 1)
  },

  bone_colossus(p, bone, soul) {
    const dark = '#2c2838'
    p.pair(box(0.42, 0.14, 0.62), bone, [0.45, 0.07, 0.1])
    p.pair(box(0.26, 0.9, 0.26), bone, [0.45, 0.5, 0.05])
    p.pair(ico(0.2), bone, [0.45, 0.98, 0.05])
    p.pair(box(0.3, 0.9, 0.3), bone, [0.45, 1.4, 0])
    p.add(box(0.9, 0.3, 0.45), bone, [0, 1.85, 0])
    p.add(cyl(0.12, 0.12, 0.9, 6), bone, [0, 2.3, -0.12])
    for (let k = 0; k < 4; k++) p.add(ring(0.55 - k * 0.04, 0.07, 10), bone, [0, 2.2 + k * 0.22, 0.05], [PI / 2, 0, 0], [1, 1, 0.8])
    p.add(ico(0.3, 1), soul, [0, 2.45, 0.05], O, I, 1)
    p.pair(ico(0.36), bone, [0.8, 3.05, 0])
    p.pair(cone(0.1, 0.45, 4), dark, [0.86, 3.4, 0], [0, 0, -0.3])
    p.pair(box(0.24, 0.9, 0.24), bone, [0.98, 2.55, 0.1], [0, 0, 0.12])
    p.pair(box(0.42, 1.0, 0.42), bone, [1.06, 1.65, 0.3], [0.3, 0, 0.05])
    p.pair(ico(0.3), bone, [1.08, 1.12, 0.46])
    p.add(box(0.8, 0.7, 0.75), bone, [0, 3.62, 0.15])
    p.add(ico(0.45, 1), bone, [0, 3.82, 0.1])
    p.add(box(0.65, 0.2, 0.6), bone, [0, 3.2, 0.25])
    p.pair(box(0.2, 0.18, 0.2), dark, [0.18, 3.64, 0.46])
    p.pair(box(0.09, 0.09, 0.08), soul, [0.18, 3.64, 0.54], O, I, 1)
    for (let k = -2; k <= 2; k++) p.add(box(0.07, 0.1, 0.06), '#fffbe8', [k * 0.12, 3.34, 0.54])
    p.pair(cone(0.12, 0.6, 5), dark, [0.38, 4.07, 0.05], [-0.3, 0, -0.6])
  },

  barkzilla(p, bark, eye) {
    const dark = shade(bark, 0.6)
    const leaf = '#2f7d2c'
    const autumn = '#e0662a'
    p.pair(cyl(0.45, 0.6, 1.3, 7), dark, [0.7, 0.65, 0])
    p.pair(cone(0.2, 0.8, 4), dark, [0.8, 0.2, 0.65], [1.3, 0, 0])
    p.pair(cone(0.18, 0.7, 4), dark, [1.25, 0.2, 0.2], [1.3, 0.9, 0])
    p.add(cyl(1.0, 1.2, 2.8, 8), bark, [0, 2.6, 0])
    for (const [x, z] of [[0.62, 0.8], [-0.7, 0.72], [0.95, -0.45], [-0.3, -1.0]]) p.add(box(0.16, 2.4, 0.16), dark, [x, 2.55, z])
    p.pair(cyl(0.3, 0.4, 1.8, 6), bark, [1.5, 3.4, 0.2], [0, 0, -1.1])
    p.pair(cyl(0.22, 0.3, 1.4, 6), bark, [2.2, 2.5, 0.6], [0.5, 0, 0.2])
    p.pair(cone(0.1, 0.7, 4), dark, [2.35, 1.7, 1.0], [2.6, 0, 0])
    p.pair(cone(0.1, 0.6, 4), dark, [2.55, 1.8, 0.7], [2.5, 0, 0.5])
    p.pair(cone(0.1, 0.6, 4), dark, [2.15, 1.8, 0.75], [2.5, 0, -0.5])
    p.add(ico(1.55), leaf, [0, 4.9, -0.1])
    p.pair(ico(1.05), shade(leaf, 0.78), [1.2, 4.6, -0.3])
    p.add(ico(1.0), shade(leaf, 1.2), [0.2, 5.95, -0.2])
    p.pair(ico(0.7), autumn, [0.75, 5.45, 0.55])
    p.add(ico(0.6), shade(autumn, 0.8), [-0.2, 4.3, 1.0])
    p.pair(cone(0.18, 1.6, 5), dark, [1.0, 5.9, -0.2], [0, 0, -0.6])
    p.pair(cone(0.1, 0.8, 4), dark, [1.75, 6.25, -0.2], [0, 0, -1.2])
    p.add(box(1.3, 0.5, 0.3), '#5c8f3a', [0, 1.95, 1.0], [0.15, 0, 0])
    p.pair(cone(0.14, 0.5, 4), '#5c8f3a', [0.4, 1.55, 1.05], [PI, 0, 0])
    p.pair(box(0.45, 0.3, 0.4), HOLLOW, [0.42, 3.25, 0.92])
    p.pair(box(0.26, 0.16, 0.2), eye, [0.42, 3.25, 1.04], O, I, 1)
    brows(p, 0.45, 3.56, 0.98, 0.8, dark, 0.35)
    p.add(box(1.1, 0.4, 0.4), HOLLOW, [0, 2.4, 0.98])
    p.add(box(0.9, 0.18, 0.1), '#ff8a1f', [0, 2.36, 1.12], O, I, 0.8)
    for (let k = -1.5; k <= 1.5; k++) p.add(cone(0.1, 0.25, 3), '#e8dcc0', [k * 0.3, 2.52, 1.16], [PI, 0, 0])
    p.add(cyl(0.05, 0.32, 0.16, 6), '#e8453a', [1.08, 2.0, 0.4], [0, 0, -1.2])
    p.add(cyl(0.04, 0.22, 0.12, 6), '#e8453a', [1.12, 1.6, 0.2], [0, 0, -1.2])
  },

  jackal_pharaoh(p, fur, gold) {
    const blue = '#2a5cff'
    const linen = '#f2ead8'
    p.pair(box(0.35, 1.6, 0.38), fur, [0.35, 0.8, 0])
    p.pair(box(0.4, 0.12, 0.62), gold, [0.35, 0.06, 0.08])
    p.pair(box(0.4, 0.1, 0.42), gold, [0.35, 0.36, 0])
    p.add(cyl(0.55, 0.78, 0.8, 8), linen, [0, 1.75, 0])
    p.add(cyl(0.58, 0.58, 0.16, 8), gold, [0, 2.15, 0])
    p.add(box(0.3, 0.7, 0.12), gold, [0, 1.7, 0.66])
    p.add(box(0.2, 0.6, 0.1), blue, [0, 1.7, 0.7])
    p.add(box(1.1, 1.2, 0.6), fur, [0, 2.8, 0])
    p.add(cyl(0.75, 0.75, 0.12, 10), gold, [0, 3.35, 0])
    p.add(cyl(0.7, 0.72, 0.1, 10), blue, [0, 3.25, 0])
    p.add(cyl(0.66, 0.68, 0.1, 10), gold, [0, 3.15, 0])
    p.pair(box(0.28, 1.2, 0.3), fur, [0.75, 2.7, 0.05])
    p.pair(box(0.32, 0.14, 0.34), gold, [0.75, 2.3, 0.05])
    p.add(box(0.6, 0.6, 0.6), fur, [0, 3.85, 0.05])
    p.add(box(0.3, 0.28, 0.55), fur, [0, 3.72, 0.55])
    p.add(box(0.14, 0.1, 0.1), '#111118', [0, 3.8, 0.82])
    p.pair(cone(0.15, 0.8, 4), fur, [0.22, 4.55, -0.02], [0, 0, -0.15], [1, 1, 0.5])
    p.pair(cone(0.08, 0.55, 4), gold, [0.22, 4.5, 0.03], [0, 0, -0.15], [1, 1, 0.3])
    p.pair(box(0.12, 0.07, 0.12), gold, [0.17, 3.95, 0.32], O, I, 1)
    p.pair(box(0.2, 0.9, 0.34), gold, [0.38, 3.5, -0.02])
    for (let k = 0; k < 4; k++) p.pair(box(0.21, 0.08, 0.35), blue, [0.38, 3.15 + k * 0.22, -0.02])
    p.add(box(0.64, 0.12, 0.64), gold, [0, 4.1, 0.05])
    p.add(box(0.1, 0.18, 0.1), blue, [0, 4.1, 0.36])
    p.add(cyl(0.06, 0.06, 4.4, 6), gold, [-0.92, 2.3, 0.45])
    p.add(box(0.12, 0.3, 0.42), gold, [-0.92, 4.55, 0.55], [0.5, 0, 0])
    p.add(cone(0.07, 0.3, 4), gold, [-0.96, 0.12, 0.45], [PI, 0, 0.2])
  },

  grave_warden(p, robe, glow) {
    const bone = '#e8e2cc'
    const deep = shade(robe, 0.7)
    p.add(cyl(0.55, 1.3, 3.6, 8), robe, [0, 1.8, 0])
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + 0.2
      p.add(cone(0.24, 0.5, 3), deep, [Math.sin(a) * 1.2, 0.15, Math.cos(a) * 1.2], [PI, 0, 0])
    }
    p.add(cyl(0.9, 1.0, 0.5, 8), deep, [0, 3.6, 0])
    p.pair(cone(0.12, 0.6, 4), bone, [0.85, 4.0, 0], [0, 0, -0.5])
    p.add(cone(0.75, 1.5, 7), robe, [0, 4.6, -0.05])
    p.add(box(0.7, 0.8, 0.5), HOLLOW, [0, 4.25, 0.38])
    p.pair(box(0.16, 0.1, 0.1), glow, [0.16, 4.35, 0.62], O, I, 1)
    p.add(cyl(0.9, 0.95, 0.12, 8), '#8a6a3a', [0, 2.6, 0])
    p.add(oct(0.2), glow, [0, 3.2, 0.72], O, I, 1)
    p.pair(cyl(0.22, 0.35, 1.2, 6), robe, [1.0, 3.1, 0.3], [0.6, 0, -0.4])
    p.pair(box(0.18, 0.25, 0.12), bone, [1.2, 2.6, 0.75])
    p.add(cyl(0.06, 0.06, 5.4, 5), '#4a3a2a', [-1.25, 3.0, 0.8], [0, 0, 0.12])
    p.add(box(0.14, 0.2, 1.8), '#aab4c8', [-1.58, 5.55, 0.1], [0.4, 0, 0], I, 0.2)
    p.add(box(0.06, 0.06, 1.6), glow, [-1.58, 5.43, 0.18], [0.4, 0, 0], I, 1)
    p.pair(ico(0.16), glow, [1.5, 4.6, -0.3], O, I, 1)
    p.add(ico(0.12), glow, [0.2, 5.6, -0.8], O, I, 1)
  },
}

/** Scorpions and their king share a body; the king gets bigger claws. */
function scorpionBody(p: Parts, shell: Col, dark: Col, king: boolean): void {
  const venom = '#b8ff3b'
  const claw = king ? 1.35 : 1
  p.add(ico(0.28, 1), shell, [0, 0.22, 0], O, [1, 0.45, 1.3])
  p.add(ico(0.2), shell, [0, 0.24, 0.3], O, [1, 0.5, 0.8])
  for (let i = 0; i < 4; i++) p.pair(box(0.34, 0.04, 0.05), dark, [0.3, 0.14, 0.18 - i * 0.14], [0, -0.3 + i * 0.2, -0.45])
  p.pair(box(0.08, 0.07, 0.3), shell, [0.24, 0.22, 0.48], [0, -0.5, 0], [claw, claw, 1])
  p.pair(box(0.14, 0.08, 0.18), shell, [0.33, 0.23, 0.66], O, [claw, claw, claw])
  p.pair(cone(0.04, 0.14, 4), dark, [0.29, 0.23, 0.8], [PI / 2, 0, 0], [claw, claw, claw])
  p.pair(cone(0.04, 0.14, 4), dark, [0.38, 0.23, 0.79], [PI / 2, 0, 0], [claw, claw, claw])
  const tail: V3[] = [[0, 0.3, -0.4], [0, 0.45, -0.52], [0, 0.62, -0.52], [0, 0.76, -0.4], [0, 0.82, -0.22]]
  tail.forEach((at, k) => p.add(ico(0.1 - k * 0.008), shell, at))
  p.add(cone(0.06, 0.2, 4), dark, [0, 0.76, -0.08], [2.2, 0, 0])
  p.add(ico(0.035), venom, [0, 0.7, 0], O, I, 1)
  p.pair(box(0.035, 0.035, 0.04), '#1a0a0a', [0.06, 0.33, 0.42])
}

/** Every preset name there is. */
export const MODEL_PRESETS: readonly string[] = Object.keys(BUILDERS)

/**
 * The merged, unit-height geometry for a def, coloured from its `color` and
 * `accent`. Unknown presets fall back to a goblin so a typo never crashes a run.
 */
export function buildEnemyGeometry(def: EnemyDef): THREE.BufferGeometry {
  const parts = new Parts()
  const build = BUILDERS[def.model] ?? BUILDERS.goblin
  build(parts, def.color, def.accent)
  return parts.build()
}
