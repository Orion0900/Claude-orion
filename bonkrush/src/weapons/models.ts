/**
 * Procedural low-poly models for weapon projectiles and effects. Each model
 * is merged from primitives into one non-indexed BufferGeometry with vertex
 * colours, so one InstancedMesh draws a whole multi-coloured model and flat
 * shading comes for free.
 *
 * Conventions: projectiles point along +Z; ground effects lie in XZ with a
 * unit radius; everything is scaled per instance.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s = new THREE.Vector3()

function at(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz))
}

/** One single-coloured, non-indexed piece of a model. */
function part(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g !== geo) geo.dispose()
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name)
  if (m) g.applyMatrix4(m)
  paint(g, new THREE.Color(color))
  return g
}

function paint(g: THREE.BufferGeometry, c: THREE.Color): void {
  const n = g.getAttribute('position').count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

function fromArrays(positions: number[], colors: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

// ─────────────────────────── materials ───────────────────────────

export function solidMaterial(emissive?: THREE.ColorRepresentation): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  if (emissive !== undefined) m.emissive.set(emissive)
  return m
}

/** Glowing, additive, unlit: fading an instance's tint to black fades it out. */
export function glowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  })
}

// ─────────────────────────── shared effects ───────────────────────────

export function emberGeometry(): THREE.BufferGeometry {
  return merge([part(new THREE.OctahedronGeometry(1, 0), '#ffffff')])
}

export function blastGeometry(): THREE.BufferGeometry {
  return merge([part(new THREE.IcosahedronGeometry(1, 1), '#ffffff')])
}

/** A unit box centred on the origin; bolts stretch it along +Z. */
export function boltGeometry(): THREE.BufferGeometry {
  return merge([part(new THREE.BoxGeometry(1, 1, 1), '#ffffff')])
}

// ─────────────────────────── melee ───────────────────────────

/**
 * A crescent blade trail in XZ, unit radius, centred on −Z and spanning
 * `arcDeg`. It is thickest near its leading (+yaw) end and fades from a
 * white-hot outer edge to nothing inside, which reads as a slash when drawn
 * additively.
 */
export function slashGeometry(arcDeg: number, width: number, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const seg = 24
  const half = (arcDeg * Math.PI) / 360
  const base = new THREE.Color(color)
  const edge = base.clone().lerp(new THREE.Color(1, 1, 1), 0.7)
  const mid = base.clone().multiplyScalar(0.9)
  const positions: number[] = []
  const colors: number[] = []
  const rows = (t: number) => {
    const profile = Math.pow(Math.sin(Math.PI * t), 0.7) * (0.45 + 0.55 * t)
    return [
      { r: 1, y: 0, c: edge },
      { r: 1 - width * 0.3 * profile, y: -0.02, c: mid },
      { r: 1 - width * profile, y: -0.06, c: new THREE.Color(0, 0, 0) },
    ]
  }
  const point = (t: number, row: { r: number; y: number; c: THREE.Color }) => {
    const a = -half + t * 2 * half
    positions.push(-Math.sin(a) * row.r, row.y, -Math.cos(a) * row.r)
    colors.push(row.c.r, row.c.g, row.c.b)
  }
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg
    const t1 = (i + 1) / seg
    const r0 = rows(t0)
    const r1 = rows(t1)
    for (let k = 0; k < 2; k++) {
      point(t0, r0[k])
      point(t0, r0[k + 1])
      point(t1, r1[k])
      point(t1, r1[k])
      point(t0, r0[k + 1])
      point(t1, r1[k + 1])
    }
  }
  return fromArrays(positions, colors)
}

// ─────────────────────────── projectiles ───────────────────────────

/** About 1.2 m long along Z; tumbles about X. */
export function boneGeometry(): THREE.BufferGeometry {
  const ivory = '#f4ecd6'
  const shade = '#dccfae'
  return merge([
    part(new THREE.CylinderGeometry(0.09, 0.09, 0.85, 6), ivory, at(0, 0, 0, Math.PI / 2)),
    part(new THREE.IcosahedronGeometry(0.17, 0), ivory, at(0.1, 0, 0.45)),
    part(new THREE.IcosahedronGeometry(0.17, 0), shade, at(-0.1, 0, 0.45)),
    part(new THREE.IcosahedronGeometry(0.17, 0), shade, at(0.1, 0, -0.45)),
    part(new THREE.IcosahedronGeometry(0.17, 0), ivory, at(-0.1, 0, -0.45)),
  ])
}

/** A hot core inside an orange shell, unit radius. Drawn additively. */
export function fireballGeometry(): THREE.BufferGeometry {
  return merge([
    part(new THREE.IcosahedronGeometry(1, 0), '#c43a00'),
    part(new THREE.IcosahedronGeometry(0.7, 0), '#ff8a1a', at(0, 0, 0, 0.6, 0.3, 0)),
    part(new THREE.IcosahedronGeometry(0.42, 0), '#fff2a8', at(0, 0, 0, 0.2, 0.9, 0.4)),
  ])
}

/** About 1.2 m, tip at +Z. */
export function arrowGeometry(fletch: THREE.ColorRepresentation): THREE.BufferGeometry {
  return merge([
    part(new THREE.BoxGeometry(0.05, 0.05, 1.0), '#8a5a2b'),
    part(new THREE.ConeGeometry(0.09, 0.28, 4), '#dfe6ee', at(0, 0, 0.62, Math.PI / 2)),
    part(new THREE.BoxGeometry(0.02, 0.2, 0.24), fletch, at(0, 0, -0.42)),
    part(new THREE.BoxGeometry(0.2, 0.02, 0.24), fletch, at(0, 0, -0.42)),
  ])
}

/** A unit diamond stretched along Z per instance into a tracer streak. Additive. */
export function tracerGeometry(): THREE.BufferGeometry {
  return merge([
    part(new THREE.OctahedronGeometry(0.5, 0), '#ffb347'),
    part(new THREE.OctahedronGeometry(0.28, 0), '#fff8d8', at(0, 0, 0.12)),
  ])
}

/** A flat yellow V about 1 m across, spinning about Y. */
export function boomerangGeometry(): THREE.BufferGeometry {
  const yellow = '#ffd83a'
  const tip = '#6b4418'
  return merge([
    part(new THREE.BoxGeometry(0.72, 0.1, 0.22), yellow, at(0.3, 0, 0.12, 0, 0.5)),
    part(new THREE.BoxGeometry(0.72, 0.1, 0.22), yellow, at(-0.3, 0, 0.12, 0, -0.5)),
    part(new THREE.BoxGeometry(0.2, 0.12, 0.24), '#fff08a', at(0, 0.01, 0.3)),
    part(new THREE.BoxGeometry(0.14, 0.12, 0.2), tip, at(0.6, 0, -0.06, 0, 0.5)),
    part(new THREE.BoxGeometry(0.14, 0.12, 0.2), tip, at(-0.6, 0, -0.06, 0, -0.5)),
  ])
}

/** Handle along Y, head at the top pointing +Z; tumbles about X. */
export function axeGeometry(accent: THREE.ColorRepresentation): THREE.BufferGeometry {
  return merge([
    part(new THREE.BoxGeometry(0.09, 1.0, 0.09), '#7a4a22'),
    part(new THREE.BoxGeometry(0.12, 0.12, 0.12), accent, at(0, -0.12, 0)),
    part(new THREE.BoxGeometry(0.08, 0.36, 0.4), '#9aa6b2', at(0, 0.36, 0.2)),
    part(new THREE.BoxGeometry(0.085, 0.44, 0.1), '#eef3f7', at(0, 0.36, 0.43)),
    part(new THREE.BoxGeometry(0.07, 0.14, 0.16), '#5d6670', at(0, 0.36, -0.07)),
  ])
}

/** About 0.9 m, blade toward +Z. */
export function daggerGeometry(): THREE.BufferGeometry {
  return merge([
    part(new THREE.OctahedronGeometry(0.5, 0), '#e6ecf5', at(0, 0, 0.22, 0, 0, 0, 0.16, 0.04, 0.62)),
    part(new THREE.BoxGeometry(0.3, 0.06, 0.06), '#ffd23f', at(0, 0, -0.1)),
    part(new THREE.BoxGeometry(0.07, 0.07, 0.22), '#6b3fa0', at(0, 0, -0.24)),
    part(new THREE.IcosahedronGeometry(0.06, 0), '#ffd23f', at(0, 0, -0.37)),
  ])
}

/** A lumpy unit-radius boulder with faceted tones. */
export function rockGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0)
  const pos = g.getAttribute('position')
  // Duplicated corners share exact coordinates, so hashing them keeps the mesh closed.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
    const k = 0.82 + (h - Math.floor(h)) * 0.32
    pos.setXYZ(i, x * k, y * k * 0.88, z * k)
  }
  const tones = [new THREE.Color('#8c7a66'), new THREE.Color('#a8927a'), new THREE.Color('#6f6152')]
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const c = tones[Math.floor(i / 3) % tones.length]
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** A squat mine about 1 m across, sitting on y = 0. */
export function mineGeometry(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CylinderGeometry(0.46, 0.52, 0.22, 8), '#3a3f4a', at(0, 0.11, 0)),
    part(new THREE.CylinderGeometry(0.54, 0.54, 0.07, 8), '#ffd23f', at(0, 0.09, 0)),
    part(new THREE.CylinderGeometry(0.18, 0.26, 0.14, 8), '#23262d', at(0, 0.29, 0)),
    part(new THREE.BoxGeometry(0.08, 0.08, 0.2), '#ffd23f', at(0.38, 0.2, 0, 0, 0, 0)),
    part(new THREE.BoxGeometry(0.08, 0.08, 0.2), '#ffd23f', at(-0.38, 0.2, 0, 0, 0, 0)),
  ])
}

export function mineLightGeometry(): THREE.BufferGeometry {
  return merge([part(new THREE.IcosahedronGeometry(1, 0), '#ffffff')])
}

/** A twisting funnel: unit radius at the top, about 2.6 m tall. */
export function tornadoGeometry(accent: THREE.ColorRepresentation): THREE.BufferGeometry {
  const tiers: Array<[number, number, number, number, THREE.ColorRepresentation]> = [
    // radiusBottom, radiusTop, height, centre y, colour
    [0.14, 0.34, 0.7, 0.35, '#8fa3b5'],
    [0.3, 0.55, 0.65, 0.95, '#b7c8d6'],
    [0.5, 0.78, 0.65, 1.55, accent],
    [0.72, 1.0, 0.6, 2.15, '#eef8ff'],
  ]
  const parts = tiers.map(([rb, rt, h, y, c], i) =>
    part(new THREE.CylinderGeometry(rt, rb, h, 7, 1, true), c, at(0.06 * (i % 2 ? 1 : -1), y, 0.05 * i, 0, i * 0.45, 0)),
  )
  parts.push(part(new THREE.TorusGeometry(0.62, 0.05, 3, 9), '#ffffff', at(0, 1.25, 0, Math.PI / 2 + 0.2, 0, 0.1)))
  return merge(parts)
}

// ─────────────────────────── ground patches ───────────────────────────

/** A hexagonal slab of ice with crystal shards, unit radius. */
export function frostPatchGeometry(): THREE.BufferGeometry {
  const parts = [
    part(new THREE.CylinderGeometry(1, 1, 0.04, 6), '#bfefff', at(0, 0.02, 0)),
    part(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 6), '#f0fcff', at(0, 0.03, 0, 0, Math.PI / 6)),
  ]
  const shards: Array<[number, number, number, number]> = [
    // angle, distance, height, lean
    [0.3, 0.55, 0.42, 0.35],
    [1.6, 0.7, 0.3, 0.45],
    [2.7, 0.45, 0.5, 0.25],
    [3.9, 0.68, 0.34, 0.4],
    [5.1, 0.5, 0.44, 0.3],
  ]
  shards.forEach(([a, d, h, lean], i) => {
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    parts.push(
      part(
        new THREE.ConeGeometry(0.1, h, 4),
        i % 2 ? '#ffffff' : '#8fdcff',
        at(x, h / 2, z, Math.sin(a) * lean, 0, -Math.cos(a) * lean),
      ),
    )
  })
  return merge(parts)
}

/** A glowing scorch with tongues of flame, unit radius. Drawn additively. */
export function firePatchGeometry(): THREE.BufferGeometry {
  const parts = [part(new THREE.CylinderGeometry(1, 1, 0.02, 7), '#7a1e05', at(0, 0.01, 0))]
  const flames: Array<[number, number, number]> = [
    [0.2, 0.2, 0.9],
    [2.2, 0.5, 0.7],
    [4.3, 0.45, 0.8],
    [1.2, 0.62, 0.55],
    [3.3, 0.66, 0.5],
    [5.3, 0.6, 0.6],
  ]
  for (const [a, d, h] of flames) {
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    parts.push(part(new THREE.ConeGeometry(0.24, h, 4), '#ff5a14', at(x, h / 2, z, 0, a, 0)))
    parts.push(part(new THREE.ConeGeometry(0.12, h * 0.6, 4), '#ffd23f', at(x, (h * 0.6) / 2, z, 0, a + 0.8, 0)))
  }
  return merge(parts)
}
