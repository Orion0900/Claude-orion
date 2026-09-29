import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hash2 } from './noise'

/**
 * Helpers for building low-poly models out of primitives: each part is
 * placed, flat-shaded (non-indexed) and painted with a vertex colour, then
 * the parts are merged so one InstancedMesh draws a many-coloured model.
 */
export interface PartOptions {
  x?: number
  y?: number
  z?: number
  rx?: number
  ry?: number
  rz?: number
  /** Euler order; 'YXZ' reads as "tilt, then turn". */
  order?: THREE.EulerOrder
  /** Uniform scale, multiplied into sx/sy/sz. */
  s?: number
  sx?: number
  sy?: number
  sz?: number
  /** Replaces the Euler rotation (for limbs aimed along a direction). */
  quaternion?: THREE.Quaternion
  /** Per-face brightness jitter, ±fraction. */
  jitter?: number
  /** Darkens the part toward its bottom by this fraction (fake ambient occlusion). */
  shadeBottom?: number
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _c = new THREE.Color()
let faceSalt = 1

export function part(source: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: PartOptions = {}): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source
  if (g !== source) source.dispose()
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name)
  g.clearGroups()

  const s = o.s ?? 1
  if (o.quaternion) _q.copy(o.quaternion)
  else _q.setFromEuler(_e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, o.order ?? 'XYZ'))
  _m.compose(_p.set(o.x ?? 0, o.y ?? 0, o.z ?? 0), _q, _s.set((o.sx ?? 1) * s, (o.sy ?? 1) * s, (o.sz ?? 1) * s))
  g.applyMatrix4(_m)
  g.computeVertexNormals()

  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const n = pos.count
  const colors = new Float32Array(n * 3)
  _c.set(color)
  const jitter = o.jitter ?? 0.06
  const shade = o.shadeBottom ?? 0
  let minY = Infinity
  let maxY = -Infinity
  if (shade > 0) {
    for (let v = 0; v < n; v++) {
      const y = pos.getY(v)
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const spanY = maxY - minY > 1e-6 ? maxY - minY : 1
  const salt = faceSalt++
  for (let f = 0; f < n; f += 3) {
    const k = 1 + (hash2(f, salt, 17) - 0.5) * 2 * jitter
    for (let v = f; v < f + 3 && v < n; v++) {
      const ao = shade > 0 ? 1 - shade * (1 - (pos.getY(v) - minY) / spanY) : 1
      colors[v * 3] = _c.r * k * ao
      colors[v * 3 + 1] = _c.g * k * ao
      colors[v * 3 + 2] = _c.b * k * ao
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/** A tapered cylinder from `from` along `dir` (need not be unit length), for trunks and branches. */
export function limb(
  from: readonly [number, number, number],
  dir: readonly [number, number, number],
  length: number,
  rBase: number,
  rTip: number,
  color: THREE.ColorRepresentation,
  segments = 5,
): THREE.BufferGeometry {
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)
  return part(new THREE.CylinderGeometry(rTip, rBase, length, segments), color, {
    x: from[0] + (d.x * length) / 2,
    y: from[1] + (d.y * length) / 2,
    z: from[2] + (d.z * length) / 2,
    quaternion: q,
  })
}

/** Merges painted parts into one geometry and frees the parts. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  if (!g) throw new Error('world/geo: parts have mismatched attributes')
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}
