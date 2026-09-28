/**
 * Low-poly pickup models, each one merged geometry with vertex colours.
 * Sizes are chunky on purpose: pickups must read at a glance in a crowd.
 */
import * as THREE from 'three'
import { merge, part, partBy } from './modelKit'

/**
 * A two-tone gem: light upper facets, darker lower ones. The tier colour comes
 * from the material so one geometry serves blue, green and red gems.
 */
export function gemGeometry(): THREE.BufferGeometry {
  return merge([
    partBy(
      new THREE.OctahedronGeometry(0.2, 0),
      (_x, y, _z, out) => {
        out.setScalar(y > 0 ? 1 : 0.62)
      },
      { scale: [1, 1.45, 1] },
    ),
  ])
}

/** An upright coin (spins about Y): dark rim, bright faces, a raised boss. */
export function coinGeometry(rim: string, face: string): THREE.BufferGeometry {
  const upright: [number, number, number] = [Math.PI / 2, 0, 0]
  return merge([
    part(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 10), rim, { rot: upright }),
    part(new THREE.CylinderGeometry(0.18, 0.18, 0.085, 10), face, { rot: upright }),
    part(new THREE.BoxGeometry(0.1, 0.12, 0.1), rim, { rot: [0, 0, Math.PI / 4] }),
  ])
}

/** A drumstick: a chunky meat lump on a bone with two knobs. */
export function healthGeometry(): THREE.BufferGeometry {
  const meat = partBy(
    new THREE.IcosahedronGeometry(0.2, 0),
    (_x, y, _z, out) => {
      out.set(y > 0.05 ? '#d9823f' : '#b45a26')
    },
    { scale: [1.35, 1, 1] },
  )
  const bone = part(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 5), '#f6eedc', {
    rot: [0, 0, Math.PI / 2],
    at: [0.34, 0, 0],
  })
  const knobA = part(new THREE.IcosahedronGeometry(0.065, 0), '#fffaf0', { at: [0.46, 0.05, 0] })
  const knobB = part(new THREE.IcosahedronGeometry(0.065, 0), '#fffaf0', { at: [0.46, -0.05, 0] })
  const g = merge([meat, bone, knobA, knobB])
  g.rotateZ(-0.5)
  g.scale(1.25, 1.25, 1.25)
  // Centred so it spins in place rather than orbiting.
  return g.center()
}

/** A classic red horseshoe magnet with silver tips, opening upward. */
export function magnetGeometry(): THREE.BufferGeometry {
  const red = '#e8343a'
  const tip = '#e9eef5'
  return merge([
    part(new THREE.TorusGeometry(0.18, 0.07, 5, 10, Math.PI), red, { rot: [0, 0, Math.PI] }),
    part(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 6), red, { at: [0.18, 0.07, 0] }),
    part(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 6), red, { at: [-0.18, 0.07, 0] }),
    part(new THREE.CylinderGeometry(0.072, 0.072, 0.09, 6), tip, { at: [0.18, 0.185, 0] }),
    part(new THREE.CylinderGeometry(0.072, 0.072, 0.09, 6), tip, { at: [-0.18, 0.185, 0] }),
  ]).scale(1.3, 1.3, 1.3)
}

/** A round cartoon bomb with a metal cap, a fuse and a spark. */
export function bombGeometry(): THREE.BufferGeometry {
  return merge([
    partBy(new THREE.IcosahedronGeometry(0.26, 1), (x, y, _z, out) => {
      // A small highlight patch sells the roundness under flat shading.
      out.set(y > 0.12 && x < -0.02 ? '#4a4f72' : '#262839')
    }),
    part(new THREE.CylinderGeometry(0.09, 0.1, 0.08, 6), '#9aa0b4', { at: [0, 0.27, 0] }),
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 4), '#d8b27a', { at: [0.04, 0.37, 0], rot: [0, 0, -0.5] }),
    part(new THREE.OctahedronGeometry(0.065, 0), '#ffcf3a', { at: [0.085, 0.45, 0] }),
    part(new THREE.OctahedronGeometry(0.04, 0), '#ff6a1a', { at: [0.085, 0.45, 0.03] }),
  ])
}

/** A chunky golden key. */
export function keyGeometry(): THREE.BufferGeometry {
  const gold = '#ffd23f'
  const dark = '#d49a1c'
  return merge([
    part(new THREE.TorusGeometry(0.1, 0.035, 4, 8), gold, { at: [0, 0.16, 0] }),
    part(new THREE.BoxGeometry(0.05, 0.3, 0.05), gold, { at: [0, -0.04, 0] }),
    part(new THREE.BoxGeometry(0.09, 0.04, 0.05), dark, { at: [0.06, -0.13, 0] }),
    part(new THREE.BoxGeometry(0.07, 0.04, 0.05), dark, { at: [0.05, -0.05, 0] }),
  ]).scale(1.3, 1.3, 1.3)
}
