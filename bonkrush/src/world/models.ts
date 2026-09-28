import * as THREE from 'three'
import { limb, merge, part } from './geo'

/**
 * Procedural low-poly prop models. Every model stands on y = 0 and faces +Z
 * (the tumbleweed alone is centred, because it rolls). A model's `glow`
 * part is drawn separately with an emissive material.
 */
export interface PropModel {
  body: THREE.BufferGeometry
  glow?: THREE.BufferGeometry
}

/** The tumbleweed's radius at scale 1; it rolls about its centre. */
export const TUMBLEWEED_RADIUS = 0.6

const { PI } = Math

const cyl = (rTop: number, rBottom: number, h: number, seg: number) => new THREE.CylinderGeometry(rTop, rBottom, h, seg)
const cone = (r: number, h: number, seg: number) => new THREE.ConeGeometry(r, h, seg)
const ico = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail)
const dodeca = (r: number) => new THREE.DodecahedronGeometry(r, 0)
const octa = (r: number) => new THREE.OctahedronGeometry(r, 0)
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
/** Upper half of a sphere (caps, domes). */
const dome = (r: number, seg: number, rings: number) => new THREE.SphereGeometry(r, seg, rings, 0, PI * 2, 0, PI / 2)

type Builder = (variant: number) => PropModel

const BUILDERS: Record<string, Builder> = {
  pine(v) {
    const trunkH = v ? 1.5 : 1.3
    const parts = [part(cyl(0.18, 0.28, trunkH, 6), '#6b4a2b', { y: trunkH / 2 })]
    const tiers: Array<[number, number, number, string]> = v
      ? [
          [1.3, 2.0, 1.1, '#1f6b3a'],
          [1.1, 1.9, 2.1, '#26784a'],
          [0.85, 1.8, 3.1, '#2e8753'],
          [0.55, 1.4, 4.1, '#379660'],
        ]
      : [
          [1.55, 2.0, 1.2, '#2e7d32'],
          [1.25, 1.8, 2.2, '#388e3c'],
          [0.9, 1.6, 3.1, '#43a047'],
        ]
    tiers.forEach(([r, h, y, c], k) => parts.push(part(cone(r, h, 7), c, { y: y + h / 2, ry: k * 0.45, shadeBottom: 0.3 })))
    return { body: merge(parts) }
  },

  oak(v) {
    const leaves = v ? ['#e0892b', '#f0a33a', '#d9772a', '#f5b945'] : ['#4caf50', '#5cb85c', '#43a047', '#66bb6a']
    return {
      body: merge([
        part(cyl(0.3, 0.45, 2.4, 6), '#7a5230', { y: 1.2 }),
        limb([0.1, 1.9, 0], [1, 1.1, 0.2], 1.4, 0.16, 0.08, '#7a5230'),
        limb([-0.1, 2.1, 0], [-0.9, 1, -0.3], 1.2, 0.14, 0.07, '#7a5230'),
        part(ico(1.8), leaves[0], { y: 3.6, ry: 0.3, shadeBottom: 0.35 }),
        part(ico(1.3), leaves[1], { x: 1.25, y: 3.1, z: 0.4, shadeBottom: 0.35 }),
        part(ico(1.2), leaves[2], { x: -1.15, y: 3.2, z: -0.3, shadeBottom: 0.35 }),
        part(ico(1.1), leaves[3], { x: 0.2, y: 4.7, z: -0.4, shadeBottom: 0.25 }),
      ]),
    }
  },

  /** Near-white so the instance tint turns it into the stage's own stone. */
  rock(v) {
    if (v === 0) return { body: merge([part(dodeca(1), '#f0f0f0', { y: 0.72, sx: 1.25, sy: 0.8, sz: 1.05, jitter: 0.1, shadeBottom: 0.25 })]) }
    return {
      body: merge([
        part(ico(0.9), '#f2f2f2', { x: 0.2, y: 0.77, sx: 1.2, sy: 0.9, jitter: 0.1, shadeBottom: 0.25 }),
        part(dodeca(0.55), '#e2e2e2', { x: -0.9, y: 0.52, z: 0.5, ry: 0.7, jitter: 0.1 }),
        part(ico(0.4), '#e8e8e8', { x: 0.75, y: 0.42, z: -0.8, rx: 0.4, jitter: 0.1 }),
      ]),
    }
  },

  bush() {
    return {
      body: merge([
        part(ico(0.7), '#3d8b37', { y: 0.6, shadeBottom: 0.35 }),
        part(ico(0.55), '#4a9e40', { x: 0.55, y: 0.48, z: 0.2, shadeBottom: 0.35 }),
        part(ico(0.5), '#57b049', { x: -0.5, y: 0.46, z: -0.15, shadeBottom: 0.35 }),
        part(ico(0.45), '#4a9e40', { x: 0.05, y: 0.42, z: -0.55, shadeBottom: 0.35 }),
        part(octa(0.08), '#e53935', { x: 0.35, y: 0.9, z: 0.45 }),
        part(octa(0.08), '#e53935', { x: -0.45, y: 0.72, z: 0.3 }),
        part(octa(0.08), '#e53935', { x: 0.62, y: 0.62, z: -0.2 }),
      ]),
    }
  },

  flower(v) {
    const petal = ['#ff6fa8', '#ffd23f', '#b48cff'][v % 3]
    const centre = v % 3 === 1 ? '#ff8a3d' : '#fff3b0'
    const parts: THREE.BufferGeometry[] = []
    const blooms: Array<[number, number, number]> = [
      [0, 0, 0.5],
      [0.26, 0.14, 0.38],
      [-0.2, 0.22, 0.3],
    ]
    for (const [x, z, h] of blooms) {
      parts.push(part(cyl(0.025, 0.03, h, 3), '#3f8f2f', { x, y: h / 2, z }))
      // An upside-down cone is a cup: its cap faces the sky as the petals.
      parts.push(part(cone(0.17, 0.1, 5), petal, { x, y: h, z, rx: PI }))
      parts.push(part(octa(0.06), centre, { x, y: h + 0.06, z }))
    }
    return { body: merge(parts) }
  },

  mushroom(v) {
    if (v === 0) {
      return {
        body: merge([
          part(cyl(0.1, 0.13, 0.45, 6), '#f3ead7', { y: 0.225 }),
          part(dome(0.34, 7, 3), '#e53935', { y: 0.42, sy: 0.8 }),
          part(octa(0.055), '#ffffff', { x: 0.14, y: 0.64, z: 0.1 }),
          part(octa(0.05), '#ffffff', { x: -0.16, y: 0.6, z: 0.05 }),
          part(octa(0.05), '#ffffff', { x: 0.02, y: 0.63, z: -0.17 }),
          part(cyl(0.06, 0.08, 0.25, 6), '#f3ead7', { x: 0.35, y: 0.125, z: 0.2 }),
          part(dome(0.2, 7, 3), '#e53935', { x: 0.35, y: 0.24, z: 0.2, sy: 0.8 }),
        ]),
      }
    }
    const caps = ['#b07a4f', '#9c6b43', '#c48a5a']
    const spots: Array<[number, number, number]> = [
      [0, 0, 1],
      [0.3, 0.15, 0.7],
      [-0.22, 0.25, 0.55],
    ]
    const parts: THREE.BufferGeometry[] = []
    spots.forEach(([x, z, s], k) => {
      parts.push(part(cyl(0.08 * s, 0.1 * s, 0.4 * s, 6), '#efe3c8', { x, y: 0.2 * s, z }))
      parts.push(part(dome(0.3 * s, 7, 2), caps[k], { x, y: 0.38 * s, z, sy: 0.55 }))
    })
    return { body: merge(parts) }
  },

  cactus(v) {
    const green = '#3f9e4a'
    if (v === 0) {
      return {
        body: merge([
          part(cyl(0.32, 0.36, 2.8, 7), green, { y: 1.4, shadeBottom: 0.2 }),
          part(dome(0.32, 7, 2), green, { y: 2.8 }),
          part(cyl(0.17, 0.17, 0.6, 6), '#43a64e', { x: 0.5, y: 1.3, rz: PI / 2 }),
          part(cyl(0.2, 0.2, 1.0, 6), '#43a64e', { x: 0.8, y: 1.75 }),
          part(dome(0.2, 6, 2), '#43a64e', { x: 0.8, y: 2.25 }),
          part(cyl(0.15, 0.15, 0.5, 6), '#399343', { x: -0.45, y: 0.95, rz: PI / 2 }),
          part(cyl(0.17, 0.17, 0.7, 6), '#399343', { x: -0.7, y: 1.25 }),
          part(dome(0.17, 6, 2), '#399343', { x: -0.7, y: 1.6 }),
          part(octa(0.12), '#ff6fa8', { y: 3.1 }),
        ]),
      }
    }
    return {
      body: merge([
        part(new THREE.SphereGeometry(0.5, 8, 5), '#4caf50', { y: 0.42, sy: 0.9, shadeBottom: 0.3 }),
        part(octa(0.1), '#ffd23f', { y: 0.9 }),
        part(new THREE.SphereGeometry(0.28, 7, 4), '#43a047', { x: 0.55, y: 0.27, z: 0.25, shadeBottom: 0.3 }),
        part(octa(0.07), '#ff6fa8', { x: 0.55, y: 0.55, z: 0.25 }),
      ]),
    }
  },

  pillar(v) {
    const stone = ['#e8c690', '#d9b27a', '#c99a62']
    if (v === 0) {
      return {
        body: merge([
          part(box(1.5, 0.4, 1.5), stone[2], { y: 0.2 }),
          part(cyl(0.5, 0.56, 4.2, 8), stone[0], { y: 2.5, shadeBottom: 0.2 }),
          part(box(1.4, 0.35, 1.4), stone[1], { y: 4.78 }),
          part(box(1.6, 0.2, 1.6), stone[2], { y: 5.05 }),
        ]),
      }
    }
    return {
      body: merge([
        part(box(1.5, 0.4, 1.5), stone[2], { y: 0.2 }),
        part(cyl(0.5, 0.56, 2.3, 8), stone[0], { y: 1.55, shadeBottom: 0.2 }),
        part(cyl(0.48, 0.5, 0.7, 8), stone[1], { x: 0.25, y: 2.95, rz: -0.45 }),
        part(dodeca(0.35), stone[1], { x: 1.2, y: 0.33, z: 0.3 }),
        part(dodeca(0.28), stone[2], { x: -0.7, y: 0.27, z: 0.95 }),
      ]),
    }
  },

  bones(v) {
    const bone = '#efe6cf'
    if (v === 0) {
      const parts = [part(box(0.12, 0.12, 1.6), '#dcd0b3', { y: 0.12 })]
      for (let k = 0; k < 4; k++) {
        const r = 0.42 - k * 0.04
        // Half tori arch across the spine like ribs.
        parts.push(part(new THREE.TorusGeometry(r, 0.05, 3, 7, PI), bone, { y: 0.1, z: -0.55 + k * 0.36 }))
      }
      parts.push(part(dodeca(0.22), bone, { y: 0.2, z: 1.0 }))
      return { body: merge(parts) }
    }
    return {
      body: merge([
        part(dodeca(0.28), bone, { y: 0.26 }),
        part(box(0.3, 0.1, 0.22), '#dcd0b3', { y: 0.08, z: 0.12 }),
        part(octa(0.075), '#3a3026', { x: 0.11, y: 0.3, z: 0.22 }),
        part(octa(0.075), '#3a3026', { x: -0.11, y: 0.3, z: 0.22 }),
        part(cyl(0.05, 0.05, 0.95, 4), '#dcd0b3', { y: 0.06, z: 0.5, rz: PI / 2, ry: 0.6, order: 'YXZ' }),
        part(cyl(0.05, 0.05, 0.95, 4), '#dcd0b3', { y: 0.06, z: 0.5, rz: PI / 2, ry: -0.6, order: 'YXZ' }),
      ]),
    }
  },

  tumbleweed() {
    const r = TUMBLEWEED_RADIUS
    return {
      body: merge([
        part(new THREE.TorusGeometry(r * 0.92, 0.05, 3, 9), '#a67c52'),
        part(new THREE.TorusGeometry(r * 0.92, 0.05, 3, 9), '#8d6440', { rx: PI / 2 }),
        part(new THREE.TorusGeometry(r * 0.92, 0.05, 3, 9), '#b8905e', { ry: PI / 2 }),
        part(new THREE.TorusGeometry(r * 0.8, 0.045, 3, 8), '#9a7048', { rx: PI / 4, ry: PI / 4 }),
        part(ico(r * 0.5), '#7a5536', { jitter: 0.15 }),
      ]),
    }
  },

  palm() {
    const parts: THREE.BufferGeometry[] = []
    let x = 0
    let y = 0
    for (let k = 0; k < 6; k++) {
      const h = 0.85
      const lean = 0.06 + k * 0.035
      parts.push(limb([x, y, 0], [Math.sin(lean), Math.cos(lean), 0], h + 0.05, 0.24 - k * 0.015, 0.2 - k * 0.015, k % 2 ? '#a1805c' : '#8d6e4f', 6))
      x += Math.sin(lean) * h
      y += Math.cos(lean) * h
    }
    for (let k = 0; k < 7; k++) {
      const yaw = (k / 7) * PI * 2
      const droop = 0.35 + (k % 2) * 0.2
      const reach = 1.15
      parts.push(
        part(box(0.5, 0.06, 2.3), k % 2 ? '#2e8b3a' : '#3aa845', {
          x: x + Math.sin(yaw) * Math.cos(droop) * reach,
          y: y - Math.sin(droop) * reach + 0.1,
          z: Math.cos(yaw) * Math.cos(droop) * reach,
          rx: droop,
          ry: yaw,
          order: 'YXZ',
        }),
      )
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * PI * 2 + 0.4
      parts.push(part(ico(0.15), '#6d4c2f', { x: x + Math.cos(a) * 0.22, y: y - 0.18, z: Math.sin(a) * 0.22 }))
    }
    return { body: merge(parts) }
  },

  tombstone(v) {
    const stone = '#a3a8b4'
    const dark = '#6f7680'
    if (v === 0) {
      return {
        body: merge([
          part(box(1.0, 0.18, 0.45), dark, { y: 0.09 }),
          part(box(0.8, 0.8, 0.2), stone, { y: 0.58 }),
          // Half a disc on top for the rounded headstone.
          part(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 8, 1, false, -PI / 2, PI), stone, { y: 0.98, rx: -PI / 2 }),
          part(box(0.5, 0.05, 0.02), '#80858f', { y: 0.95, z: 0.11 }),
        ]),
      }
    }
    if (v === 1) {
      return {
        body: merge([
          part(box(0.6, 0.2, 0.45), dark, { y: 0.1 }),
          part(box(0.22, 1.3, 0.2), stone, { y: 0.85 }),
          part(box(0.75, 0.2, 0.2), stone, { y: 1.15 }),
        ]),
      }
    }
    return {
      body: merge([
        part(box(0.9, 0.2, 0.5), dark, { y: 0.1 }),
        part(box(0.6, 1.2, 0.3), '#9499a6', { y: 0.8 }),
        part(box(0.72, 0.12, 0.4), dark, { y: 1.46 }),
        part(cone(0.36, 0.3, 4), '#9499a6', { y: 1.67, ry: PI / 4, sz: 0.55 }),
      ]),
    }
  },

  deadtree(v) {
    const bark = ['#5b4b48', '#4a3c3a', '#6a5955']
    if (v === 0) {
      return {
        body: merge([
          limb([0, 0, 0], [0.08, 1, 0], 3.3, 0.32, 0.12, bark[0]),
          limb([0.1, 2.2, 0], [1, 0.8, 0.1], 1.5, 0.12, 0.04, bark[1], 4),
          limb([0.05, 1.8, 0], [-1, 0.9, 0.35], 1.3, 0.11, 0.04, bark[2], 4),
          limb([0.2, 2.8, 0], [0.1, 0.7, -1], 1.1, 0.09, 0.03, bark[1], 4),
          limb([1.0, 3.0, 0.1], [0.7, 1, 0.5], 0.7, 0.05, 0.02, bark[2], 3),
        ]),
      }
    }
    return {
      body: merge([
        limb([0, 0, 0], [-0.1, 1, 0.05], 1.6, 0.34, 0.2, bark[0]),
        limb([-0.12, 1.5, 0], [-0.6, 1, 0.2], 1.6, 0.18, 0.06, bark[1], 4),
        limb([-0.1, 1.5, 0], [0.7, 1, -0.2], 1.8, 0.17, 0.05, bark[2], 4),
        limb([0.8, 2.6, -0.2], [1, 0.3, 0.4], 0.8, 0.05, 0.02, bark[1], 3),
      ]),
    }
  },

  crypt() {
    const wall = '#8a8499'
    const trim = '#6b6480'
    return {
      body: merge([
        part(box(6.4, 0.5, 5.4), trim, { y: 0.25 }),
        part(box(2.0, 0.25, 0.8), trim, { y: 0.125, z: 3.0 }),
        part(box(5.2, 3.0, 4.2), wall, { y: 2.0, shadeBottom: 0.25 }),
        part(box(5.8, 0.35, 4.8), trim, { y: 3.68 }),
        part(cone(4.0, 2.2, 4), '#4b4560', { y: 4.95, ry: PI / 4, sz: 0.85 }),
        part(box(1.4, 2.1, 0.1), '#241c33', { y: 1.55, z: 2.12 }),
        part(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 8, 1, false, -PI / 2, PI), '#241c33', { y: 2.6, z: 2.12, rx: -PI / 2 }),
        part(cyl(0.25, 0.28, 3.0, 6), '#a19bb0', { x: -1.6, y: 2.0, z: 2.3 }),
        part(cyl(0.25, 0.28, 3.0, 6), '#a19bb0', { x: 1.6, y: 2.0, z: 2.3 }),
        part(box(0.2, 1.0, 0.2), trim, { y: 6.3 }),
        part(box(0.6, 0.2, 0.2), trim, { y: 6.45 }),
      ]),
      // Eerie slit windows on the sides.
      glow: merge([
        part(box(0.08, 1.0, 0.25), '#ffffff', { x: 2.62, y: 2.2, z: -0.8 }),
        part(box(0.08, 1.0, 0.25), '#ffffff', { x: 2.62, y: 2.2, z: 0.8 }),
        part(box(0.08, 1.0, 0.25), '#ffffff', { x: -2.62, y: 2.2, z: -0.8 }),
        part(box(0.08, 1.0, 0.25), '#ffffff', { x: -2.62, y: 2.2, z: 0.8 }),
      ]),
    }
  },

  candle() {
    const wax = '#f3e9d2'
    const candles: Array<[number, number, number, number]> = [
      [0, 0, 0.5, 0.075],
      [0.17, 0.08, 0.35, 0.065],
      [-0.1, 0.15, 0.25, 0.07],
    ]
    return {
      body: merge([
        part(cyl(0.25, 0.3, 0.06, 7), '#e6d9bf', { y: 0.03 }),
        ...candles.map(([x, z, h, r]) => part(cyl(r, r + 0.01, h, 6), wax, { x, y: 0.06 + h / 2, z })),
      ]),
      glow: merge(candles.map(([x, z, h]) => part(octa(0.06), '#ffffff', { x, y: 0.06 + h + 0.08, z, sy: 1.8 }))),
    }
  },

  pumpkin() {
    return {
      body: merge([
        part(new THREE.SphereGeometry(0.45, 10, 6), '#ff8a1f', { y: 0.32, sy: 0.72, shadeBottom: 0.3 }),
        part(cyl(0.05, 0.07, 0.2, 5), '#4e7a2a', { y: 0.72, rz: 0.2 }),
        part(new THREE.TetrahedronGeometry(0.12), '#5c9a33', { x: 0.1, y: 0.68, sy: 0.3 }),
      ]),
      glow: merge([
        // Tipped so the flat base faces out and the triangle points up.
        part(cone(0.085, 0.1, 3), '#ffffff', { x: 0.14, y: 0.4, z: 0.43, rx: -PI / 2 }),
        part(cone(0.085, 0.1, 3), '#ffffff', { x: -0.14, y: 0.4, z: 0.43, rx: -PI / 2 }),
        part(box(0.3, 0.07, 0.08), '#ffffff', { y: 0.24, z: 0.42 }),
      ]),
    }
  },
}

/** A prop model by kind; unknown kinds fall back to a rock so a new stage never crashes. */
export function buildPropModel(kind: string, variant = 0): PropModel {
  return (BUILDERS[kind] ?? BUILDERS.rock)(variant)
}

export function hasPropModel(kind: string): boolean {
  return kind in BUILDERS
}

/** A chunky near-white boulder centred on the origin, stretched per instance into boundary cliffs. */
export function buildCliffRock(): THREE.BufferGeometry {
  return merge([
    part(dodeca(1), '#f4f4f4', { jitter: 0.12, shadeBottom: 0.3 }),
    part(ico(0.7), '#e6e6e6', { x: 0.45, y: 0.35, z: 0.3, jitter: 0.12 }),
    part(ico(0.55), '#ececec', { x: -0.5, y: -0.1, z: -0.35, jitter: 0.12 }),
  ])
}

/** A puffy low-poly cloud about 2 m across at scale 1, white on top and grey underneath. */
export function buildCloud(): THREE.BufferGeometry {
  const puffs: Array<[number, number, number, number]> = [
    [0, 0.2, 0, 0.75],
    [0.7, 0, 0.1, 0.55],
    [-0.65, 0.02, -0.05, 0.6],
    [0.25, 0.05, -0.45, 0.5],
    [-0.2, -0.02, 0.45, 0.5],
  ]
  return merge(puffs.map(([x, y, z, r]) => part(ico(r, 1), '#ffffff', { x, y, z, sy: 0.7, jitter: 0.03, shadeBottom: 0.22 })))
}
