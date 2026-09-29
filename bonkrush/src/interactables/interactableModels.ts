/**
 * Low-poly models for chests, pots, shrines, the boss altar and the portal.
 * Each is one merged, vertex-coloured geometry with its origin on the ground
 * at the model's centre and its front facing +Z.
 */
import * as THREE from 'three'
import { merge, part, partBy, partByVertex } from '../pickups/modelKit'

type Triple = [number, number, number]

export const CHEST_BODY_H = 0.55
export const CHEST_DEPTH = 0.72
const CHEST_W = 1.1

interface ChestPalette {
  wood: string
  woodDark: string
  trim: string
  lock: string
  keyhole: string
}

const WOODEN: ChestPalette = {
  wood: '#a0602f',
  woodDark: '#834b22',
  trim: '#ffc933',
  lock: '#ffd84a',
  keyhole: '#3a2410',
}
const GOLDEN: ChestPalette = {
  wood: '#ffc62e',
  woodDark: '#f0a91c',
  trim: '#fff4c2',
  lock: '#ff3b5c',
  keyhole: '#7a1020',
}

/** The chest without its lid: planked box, gold corner posts and bands, a lock plate. */
export function chestBodyGeometry(golden: boolean): THREE.BufferGeometry {
  const c = golden ? GOLDEN : WOODEN
  const hw = CHEST_W / 2 - 0.02
  const hd = CHEST_DEPTH / 2 - 0.02
  const parts = [
    // Three plank rows; the middle one darker.
    partBy(new THREE.BoxGeometry(CHEST_W, CHEST_BODY_H, CHEST_DEPTH, 1, 3, 1), (_x, y, _z, out) => {
      out.set(Math.abs(y) < CHEST_BODY_H / 6 ? c.woodDark : c.wood)
    }, { at: [0, CHEST_BODY_H / 2, 0] }),
    part(new THREE.BoxGeometry(CHEST_W + 0.05, 0.08, CHEST_DEPTH + 0.05), c.trim, { at: [0, 0.04, 0] }),
    part(new THREE.BoxGeometry(CHEST_W + 0.05, 0.06, CHEST_DEPTH + 0.05), c.trim, { at: [0, CHEST_BODY_H - 0.03, 0] }),
    part(new THREE.BoxGeometry(0.22, 0.26, 0.05), c.lock, { at: [0, CHEST_BODY_H - 0.16, CHEST_DEPTH / 2 + 0.02] }),
    part(new THREE.BoxGeometry(0.05, 0.1, 0.03), c.keyhole, { at: [0, CHEST_BODY_H - 0.18, CHEST_DEPTH / 2 + 0.045] }),
  ]
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(part(new THREE.BoxGeometry(0.09, CHEST_BODY_H, 0.09), c.trim, { at: [sx * hw, CHEST_BODY_H / 2, sz * hd] }))
    }
  }
  return merge(parts)
}

/**
 * The domed lid, hinged at its origin: it spans z = 0 (back edge) to
 * CHEST_DEPTH (front), so rotating about X swings it open.
 */
export function chestLidGeometry(golden: boolean): THREE.BufferGeometry {
  const c = golden ? GOLDEN : WOODEN
  const r = CHEST_DEPTH / 2
  const dome = (radius: number, length: number, hex: string, x = 0): THREE.BufferGeometry =>
    part(new THREE.CylinderGeometry(radius, radius, length, 8, 1, false, 0, Math.PI), hex, {
      rot: [0, 0, Math.PI / 2],
      at: [x, 0, r],
    })
  const g = merge([
    dome(r, CHEST_W, c.wood),
    dome(r + 0.02, 0.1, c.trim, -0.38),
    dome(r + 0.02, 0.1, c.trim, 0.38),
    part(new THREE.BoxGeometry(CHEST_W, 0.04, CHEST_DEPTH), c.woodDark, { at: [0, 0.02, r] }),
    part(new THREE.BoxGeometry(0.22, 0.12, 0.06), c.lock, { at: [0, 0.06, CHEST_DEPTH + 0.01] }),
  ])
  // Flatten the dome so the chest keeps a chunky, squat silhouette.
  g.scale(1, 0.7, 1)
  return g
}

/** A clay (or silver) pot: a lathe with a dark band, a lip and a darker foot. */
export function potGeometry(silvery: boolean): THREE.BufferGeometry {
  const profile = [
    [0, 0],
    [0.24, 0],
    [0.34, 0.1],
    [0.4, 0.26],
    [0.38, 0.42],
    [0.28, 0.56],
    [0.18, 0.64],
    [0.17, 0.7],
    [0.25, 0.76],
    [0.21, 0.8],
    [0.13, 0.74],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const [body, band, rim, foot] = silvery
    ? ['#cfd8e3', '#7f8ca3', '#ffffff', '#9aa6b8']
    : ['#cf6d3c', '#7e3a20', '#e8915c', '#a4522b']
  return merge([
    partBy(new THREE.LatheGeometry(profile, 8), (_x, y, _z, out) => {
      if (y < 0.06) out.set(foot)
      else if (y > 0.25 && y < 0.36) out.set(band)
      else if (y > 0.68) out.set(rim)
      else out.set(body)
    }),
  ])
}

/** The charge shrine's stepped stone plinth with a trim colour (teal, or gold for golden shrines). */
export function chargePlinthGeometry(golden: boolean): THREE.BufferGeometry {
  const trim = golden ? '#ffd23f' : '#3ee8d0'
  const stone = golden ? '#8a8272' : '#6b7f86'
  const stoneLight = golden ? '#a39a86' : '#7e959b'
  const column = golden ? '#c9a54a' : '#4fb8a8'
  const parts = [
    part(new THREE.CylinderGeometry(1.0, 1.15, 0.45, 6), stone, { at: [0, 0.125, 0] }),
    part(new THREE.CylinderGeometry(0.75, 0.85, 0.25, 6), stoneLight, { at: [0, 0.475, 0] }),
    part(new THREE.CylinderGeometry(0.38, 0.48, 1.1, 6), column, { at: [0, 1.15, 0] }),
    part(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 6), trim, { at: [0, 0.66, 0] }),
    part(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 6), trim, { at: [0, 1.62, 0] }),
    part(new THREE.CylinderGeometry(0.72, 0.45, 0.25, 6), stoneLight, { at: [0, 1.8, 0] }),
  ]
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6
    parts.push(
      part(new THREE.BoxGeometry(0.12, 0.42, 0.06), trim, {
        at: [Math.sin(a) * 0.42, 1.15, Math.cos(a) * 0.42],
        rot: [0, a, 0],
      }),
    )
  }
  return merge(parts)
}

/** Floating shrine crystal, white so the instance colour tints it. */
export function crystalGeometry(): THREE.BufferGeometry {
  return merge([
    partBy(new THREE.OctahedronGeometry(0.34, 0), (_x, y, _z, out) => out.setScalar(y > 0 ? 1 : 0.7), {
      scale: [1, 1.6, 1],
    }),
  ])
}

/** One peg of a charge shrine's ring; the ring lights up peg by peg as it charges. */
export function pegGeometry(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CylinderGeometry(0.09, 0.15, 0.55, 5), '#ffffff', { at: [0, 0.18, 0] }),
    part(new THREE.OctahedronGeometry(0.11, 0), '#ffffff', { at: [0, 0.5, 0], scale: [1, 1.5, 1] }),
  ])
}

/** Greed shrine: a big gold coin on a pedestal with coin stacks at its feet. */
export function greedIdolGeometry(): THREE.BufferGeometry {
  const upright: Triple = [Math.PI / 2, 0, 0]
  const parts = [
    part(new THREE.BoxGeometry(1.7, 0.5, 1.3), '#8a7f6a', { at: [0, 0.15, 0] }),
    part(new THREE.BoxGeometry(1.05, 0.65, 0.75), '#a39578', { at: [0, 0.72, 0] }),
    part(new THREE.CylinderGeometry(0.78, 0.78, 0.2, 12), '#e0a21e', { rot: upright, at: [0, 1.85, 0] }),
    part(new THREE.CylinderGeometry(0.6, 0.6, 0.24, 12), '#ffd84a', { rot: upright, at: [0, 1.85, 0] }),
    part(new THREE.BoxGeometry(0.16, 0.5, 0.3), '#e0a21e', { at: [0, 1.85, 0] }),
    part(new THREE.BoxGeometry(0.38, 0.1, 0.3), '#e0a21e', { at: [0, 2.02, 0] }),
    part(new THREE.BoxGeometry(0.38, 0.1, 0.3), '#e0a21e', { at: [0, 1.68, 0] }),
  ]
  const stacks: Array<[number, number, number]> = [
    [-0.62, 0.45, 3],
    [0.64, 0.4, 2],
    [0.3, 0.52, 1],
  ]
  for (const [x, z, n] of stacks) {
    for (let i = 0; i < n; i++) {
      parts.push(part(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 8), i % 2 ? '#ffd84a' : '#f0b429', { at: [x, 0.45 + i * 0.09, z] }))
    }
  }
  return merge(parts)
}

/** Magnet shrine: a stone pillar crowned with a big blue horseshoe magnet. */
export function magnetTotemGeometry(): THREE.BufferGeometry {
  const blue = '#2f7bff'
  const tip = '#eef3ff'
  const y = 2.55
  return merge([
    part(new THREE.BoxGeometry(1.25, 0.5, 1.25), '#6f7788', { at: [0, 0.1, 0] }),
    part(new THREE.CylinderGeometry(0.28, 0.38, 1.7, 6), '#8792a6', { at: [0, 1.15, 0] }),
    part(new THREE.TorusGeometry(0.55, 0.2, 6, 12, Math.PI), blue, { rot: [0, 0, Math.PI], at: [0, y, 0] }),
    part(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 6), blue, { at: [0.55, y + 0.25, 0] }),
    part(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 6), blue, { at: [-0.55, y + 0.25, 0] }),
    part(new THREE.CylinderGeometry(0.21, 0.21, 0.26, 6), tip, { at: [0.55, y + 0.63, 0] }),
    part(new THREE.CylinderGeometry(0.21, 0.21, 0.26, 6), tip, { at: [-0.55, y + 0.63, 0] }),
  ])
}

/** A cartoon skull facing +Z: dome, sockets, nose and jaw. */
function skullParts(center: Triple, size: number, eyes = '#1a0f18'): THREE.BufferGeometry[] {
  const [x, y, z] = center
  const s = size
  return [
    part(new THREE.IcosahedronGeometry(s, 0), '#efe8d8', { at: [x, y, z], scale: [1, 0.95, 0.85] }),
    part(new THREE.BoxGeometry(s * 0.32, s * 0.34, s * 0.14), eyes, { at: [x - s * 0.36, y + s * 0.05, z + s * 0.72] }),
    part(new THREE.BoxGeometry(s * 0.32, s * 0.34, s * 0.14), eyes, { at: [x + s * 0.36, y + s * 0.05, z + s * 0.72] }),
    part(new THREE.BoxGeometry(s * 0.14, s * 0.18, s * 0.1), eyes, { at: [x, y - s * 0.3, z + s * 0.78] }),
    part(new THREE.BoxGeometry(s * 1.0, s * 0.36, s * 0.7), '#ddd3be', { at: [x, y - s * 0.72, z + s * 0.3] }),
  ]
}

/** Challenge shrine: a purple obelisk with a skull set into its face. */
export function challengeObeliskGeometry(): THREE.BufferGeometry {
  const square: Triple = [0, Math.PI / 4, 0]
  return merge([
    part(new THREE.BoxGeometry(1.5, 0.5, 1.5), '#3d3552', { at: [0, 0.1, 0] }),
    part(new THREE.BoxGeometry(1.15, 0.25, 1.15), '#4a4063', { at: [0, 0.47, 0] }),
    part(new THREE.CylinderGeometry(0.3, 0.6, 3.0, 4), '#7a3cff', { rot: square, at: [0, 2.1, 0] }),
    part(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 4), '#c89bff', { rot: square, at: [0, 0.64, 0] }),
    part(new THREE.ConeGeometry(0.32, 0.55, 4), '#d7b6ff', { rot: square, at: [0, 3.87, 0] }),
    ...skullParts([0, 1.75, 0.33], 0.27),
  ])
}

/** Curse shrine: a dark red altar with horns, runes, candles and a blood crystal. */
export function curseAltarGeometry(): THREE.BufferGeometry {
  const parts = [
    part(new THREE.BoxGeometry(1.9, 0.4, 1.3), '#3a2a2e', { at: [0, 0.05, 0] }),
    part(new THREE.BoxGeometry(0.32, 0.62, 0.8), '#4a3438', { at: [-0.62, 0.56, 0] }),
    part(new THREE.BoxGeometry(0.32, 0.62, 0.8), '#4a3438', { at: [0.62, 0.56, 0] }),
    part(new THREE.BoxGeometry(2.0, 0.24, 1.15), '#6a3a42', { at: [0, 0.98, 0] }),
    part(new THREE.IcosahedronGeometry(0.3, 0), '#ff2040', { at: [0, 1.45, 0], scale: [1, 1.3, 1] }),
    part(new THREE.ConeGeometry(0.13, 0.6, 4), '#d8cfc0', { at: [-0.92, 1.35, -0.38], rot: [0, 0, 0.5] }),
    part(new THREE.ConeGeometry(0.13, 0.6, 4), '#d8cfc0', { at: [0.92, 1.35, -0.38], rot: [0, 0, -0.5] }),
  ]
  for (const x of [-0.5, 0, 0.5]) {
    parts.push(part(new THREE.BoxGeometry(0.2, 0.08, 0.04), '#ff2a3a', { at: [x, 0.98, 0.59], rot: [0, 0, x * 1.2] }))
  }
  for (const x of [-0.78, 0.78]) {
    parts.push(part(new THREE.CylinderGeometry(0.06, 0.07, 0.26, 5), '#f2e6c8', { at: [x, 1.23, 0.32] }))
    parts.push(part(new THREE.OctahedronGeometry(0.07, 0), '#ffb020', { at: [x, 1.42, 0.32], scale: [1, 1.5, 1] }))
  }
  return merge(parts)
}

/**
 * The boss altar: a stone archway on a platform, crowned with a horned skull
 * with red eyes, and two torches out front. The opening spans x ∈ ±1.3,
 * y ∈ 0.4…4.4 at z = 0.
 */
export function bossAltarGeometry(): THREE.BufferGeometry {
  const parts = [
    part(new THREE.BoxGeometry(5.4, 0.6, 2.7), '#5e5868', { at: [0, 0.1, 0] }),
    part(new THREE.BoxGeometry(3.6, 0.25, 0.9), '#6f6a7a', { at: [0, 0.12, 1.6] }),
    part(new THREE.BoxGeometry(4.7, 0.8, 1.15), '#6f6a7a', { at: [0, 4.8, 0] }),
    part(new THREE.BoxGeometry(5.0, 0.25, 1.3), '#57525f', { at: [0, 5.32, 0] }),
    ...skullParts([0, 6.15, 0], 0.8),
    part(new THREE.OctahedronGeometry(0.1, 0), '#ff3030', { at: [-0.29, 6.2, 0.62] }),
    part(new THREE.OctahedronGeometry(0.1, 0), '#ff3030', { at: [0.29, 6.2, 0.62] }),
    part(new THREE.ConeGeometry(0.2, 1.0, 5), '#d8cfc0', { at: [-0.85, 6.7, 0], rot: [0, 0, 0.65] }),
    part(new THREE.ConeGeometry(0.2, 1.0, 5), '#d8cfc0', { at: [0.85, 6.7, 0], rot: [0, 0, -0.65] }),
  ]
  const blocks = ['#6f6a7a', '#5f5a6a', '#747080', '#5a5566']
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const w = i % 2 ? 0.9 : 1.0
      parts.push(part(new THREE.BoxGeometry(w, 1.0, w), blocks[(i + (sx > 0 ? 1 : 0)) % 4], { at: [sx * 1.8, 0.9 + i, 0] }))
    }
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.1, 1.3, 5), '#4a3a2a', { at: [sx * 2.4, 1.05, 1.1] }))
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.12, 0.2, 6), '#3a2f24', { at: [sx * 2.4, 1.75, 1.1] }))
    parts.push(part(new THREE.OctahedronGeometry(0.18, 0), '#ff8a2a', { at: [sx * 2.4, 1.98, 1.1], scale: [1, 1.6, 1] }))
  }
  return merge(parts)
}

/**
 * A light beam of unit height, brightest at the base and fading to black at
 * the top (black is invisible under additive blending). Tint per instance.
 */
export function beamGeometry(): THREE.BufferGeometry {
  return merge([
    partByVertex(
      new THREE.CylinderGeometry(0.12, 0.3, 1, 8, 4, true),
      (_x, y, _z, out) => {
        const t = Math.min(1, Math.max(0, y + 0.5))
        out.setScalar((1 - t) ** 1.6)
      },
      { at: [0, 0.5, 0] },
    ),
  ])
}

/** The portal's rim: a thick torus in the XY plane with segments in three purples. */
export function portalRingGeometry(): THREE.BufferGeometry {
  const shades = ['#9b4dff', '#6a1fd1', '#e0a8ff']
  return merge([
    partBy(new THREE.TorusGeometry(2.1, 0.3, 6, 30), (x, y, _z, out) => {
      const a = Math.atan2(y, x) + Math.PI
      out.set(shades[Math.floor((a / (Math.PI * 2)) * 15) % 3])
    }),
  ])
}

/** The swirl inside the portal: spiral arms in vertex colours, drawn additively. */
export function portalDiscGeometry(): THREE.BufferGeometry {
  const dark = new THREE.Color('#2a0850')
  const bright = new THREE.Color('#f3c8ff')
  return merge([
    partByVertex(new THREE.RingGeometry(0.05, 2.0, 40, 6), (x, y, _z, out) => {
      const r = Math.hypot(x, y)
      const a = Math.atan2(y, x)
      const arms = 0.5 + 0.5 * Math.sin(a * 3 + r * 4.5)
      const edge = Math.min(1, (2.0 - r) * 2.5)
      out.copy(dark).lerp(bright, arms * arms).multiplyScalar(0.35 + 0.65 * edge)
    }),
  ])
}
