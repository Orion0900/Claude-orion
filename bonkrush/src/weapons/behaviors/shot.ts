import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import { pooled, type Pooled } from '../pool'

/**
 * A pooled projectile. The fields are generic on purpose: each behavior
 * gives `state`, `timer`, `n`, `k` and `aux` its own meaning.
 */
export interface Shot extends Pooled {
  readonly vel: THREE.Vector3
  /** Position at the start of this frame, for swept hits. */
  readonly prev: THREE.Vector3
  readonly aux: THREE.Vector3
  /** Uids already hit, so pierce never hits the same enemy twice. */
  readonly hits: Set<number>
  age: number
  life: number
  /** Metres it may still travel. */
  travel: number
  pierce: number
  bounces: number
  radius: number
  spin: number
  state: number
  timer: number
  n: number
  k: number
  target: Enemy | null
}

export function makeShot(): Shot {
  return {
    ...pooled(),
    vel: new THREE.Vector3(),
    prev: new THREE.Vector3(),
    aux: new THREE.Vector3(),
    hits: new Set<number>(),
    age: 0,
    life: 1,
    travel: Infinity,
    pierce: 1,
    bounces: 0,
    radius: 0.3,
    spin: 0,
    state: 0,
    timer: 0,
    n: 0,
    k: 0,
    target: null,
  }
}

/** Clears a recycled shot back to defaults. */
export function resetShot(s: Shot): Shot {
  s.vel.set(0, 0, 0)
  s.aux.set(0, 0, 0)
  s.hits.clear()
  s.quat.identity()
  s.scale.set(1, 1, 1)
  s.tint.setRGB(1, 1, 1)
  s.age = 0
  s.life = 1
  s.travel = Infinity
  s.pierce = 1
  s.bounces = 0
  s.radius = 0.3
  s.spin = 0
  s.state = 0
  s.timer = 0
  s.n = 0
  s.k = 0
  s.target = null
  return s
}
