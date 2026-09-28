/**
 * Tiny helpers for building low-poly models out of primitives: each part is
 * placed and painted with vertex colours, then everything merges into one
 * BufferGeometry so a single InstancedMesh draws a multi-coloured model.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type Triple = readonly [number, number, number]

export interface PartOptions {
  at?: Triple
  /** Euler angles in radians, XYZ order. */
  rot?: Triple
  scale?: Triple | number
}

const matrix = new THREE.Matrix4()
const quat = new THREE.Quaternion()
const euler = new THREE.Euler()
const posV = new THREE.Vector3()
const scaleV = new THREE.Vector3()
const color = new THREE.Color()

/**
 * Non-indexed so every part merges with every other (polyhedra come
 * non-indexed, boxes and cylinders indexed) and flat shading has hard edges.
 */
function prepare(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g !== geo) geo.dispose()
  if (g.getAttribute('uv')) g.deleteAttribute('uv')
  if (g.getAttribute('uv1')) g.deleteAttribute('uv1')
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  return g
}

export function place(geo: THREE.BufferGeometry, opts: PartOptions = {}): THREE.BufferGeometry {
  const s = opts.scale ?? 1
  posV.set(opts.at?.[0] ?? 0, opts.at?.[1] ?? 0, opts.at?.[2] ?? 0)
  quat.setFromEuler(euler.set(opts.rot?.[0] ?? 0, opts.rot?.[1] ?? 0, opts.rot?.[2] ?? 0))
  if (typeof s === 'number') scaleV.setScalar(s)
  else scaleV.set(s[0], s[1], s[2])
  geo.applyMatrix4(matrix.compose(posV, quat, scaleV))
  return geo
}

/** A primitive, painted one colour and placed. */
export function part(geo: THREE.BufferGeometry, hex: THREE.ColorRepresentation, opts: PartOptions = {}): THREE.BufferGeometry {
  const g = prepare(geo)
  paint(g, hex)
  return place(g, opts)
}

/**
 * A primitive painted per triangle by `pick(x, y, z)` at the triangle's
 * centre (in the part's own space, before placing), so bands stay crisp.
 */
export function partBy(
  geo: THREE.BufferGeometry,
  pick: (x: number, y: number, z: number, out: THREE.Color) => void,
  opts: PartOptions = {},
): THREE.BufferGeometry {
  const g = prepare(geo)
  const pos = g.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3
    pick(cx, cy, cz, color)
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = color.r
      colors[(i + k) * 3 + 1] = color.g
      colors[(i + k) * 3 + 2] = color.b
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return place(g, opts)
}

/**
 * A primitive painted per vertex by `pick` (smooth gradients, e.g. light
 * beams that fade upward).
 */
export function partByVertex(
  geo: THREE.BufferGeometry,
  pick: (x: number, y: number, z: number, out: THREE.Color) => void,
  opts: PartOptions = {},
): THREE.BufferGeometry {
  const g = prepare(geo)
  const pos = g.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    pick(pos.getX(i), pos.getY(i), pos.getZ(i), color)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return place(g, opts)
}

export function paint(geo: THREE.BufferGeometry, hex: THREE.ColorRepresentation): void {
  color.set(hex)
  const count = geo.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

/** Merges painted parts into one geometry and frees the parts. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  if (!merged) throw new Error('modelKit.merge: parts have mismatched attributes')
  merged.computeBoundingSphere()
  return merged
}

/** Flat-shaded, vertex-coloured Lambert: the look of every solid model. */
export function flatMaterial(emissive: THREE.ColorRepresentation = 0x000000): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive })
}

/**
 * An InstancedMesh ready for per-frame writes: dynamic matrices, per-instance
 * colours initialised to white (so tinting later never recompiles the shader),
 * and no frustum culling (the bounding sphere would go stale as instances move).
 */
export function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  capacity: number,
  castShadow = false,
): THREE.InstancedMesh {
  const cap = Math.max(1, Math.floor(capacity))
  const mesh = new THREE.InstancedMesh(geo, mat, cap)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const white = new THREE.Color(1, 1, 1)
  for (let i = 0; i < cap; i++) mesh.setColorAt(i, white)
  mesh.frustumCulled = false
  mesh.castShadow = castShadow
  mesh.count = 0
  return mesh
}

/** Flags the first `count` instance matrices (and colours) for upload. */
export function flush(mesh: THREE.InstancedMesh, count: number, colors = false): void {
  mesh.count = count
  mesh.visible = count > 0
  if (count <= 0) return
  const m = mesh.instanceMatrix
  m.clearUpdateRanges()
  m.addUpdateRange(0, count * 16)
  m.needsUpdate = true
  if (colors && mesh.instanceColor) {
    const c = mesh.instanceColor
    c.clearUpdateRanges()
    c.addUpdateRange(0, count * 3)
    c.needsUpdate = true
  }
}
