/**
 * Stop-motion poses for enemies: bob, waddle and squash computed from time,
 * but stepped at ~10 fps so the crowd moves with a deliberately choppy,
 * hand-animated charm. Pure; the renderer turns a pose into an instance matrix.
 */
import type { AnimStyle } from './EnemyModels'

export const ANIM_FPS = 10

export interface Pose {
  /** Vertical offset as a fraction of the model's height. */
  bob: number
  /** Side-to-side tilt (radians, around the facing axis). */
  roll: number
  /** Forward lean (radians). */
  pitch: number
  sx: number
  sy: number
  sz: number
}

export function emptyPose(): Pose {
  return { bob: 0, roll: 0, pitch: 0, sx: 1, sy: 1, sz: 1 }
}

interface StyleParams {
  /** Cycles per second at full speed. */
  freq: number
  bob: number
  roll: number
  squash: number
  lean: number
}

const STYLES: Record<AnimStyle, StyleParams> = {
  walk: { freq: 2.2, bob: 0.06, roll: 0.12, squash: 0.06, lean: 0.08 },
  hop: { freq: 2.4, bob: 0.22, roll: 0.05, squash: 0.16, lean: 0.05 },
  flap: { freq: 3.2, bob: 0.12, roll: 0.1, squash: 0.28, lean: 0.12 },
  float: { freq: 0.9, bob: 0.08, roll: 0.07, squash: 0.04, lean: 0.1 },
  heavy: { freq: 1.1, bob: 0.035, roll: 0.07, squash: 0.05, lean: 0.05 },
  skitter: { freq: 4, bob: 0.04, roll: 0.05, squash: 0.05, lean: 0.03 },
  waddle: { freq: 1.8, bob: 0.04, roll: 0.2, squash: 0.05, lean: 0.04 },
}

/** Time snapped down to the animation frame rate. */
export function stepTime(time: number): number {
  return Math.floor(time * ANIM_FPS) / ANIM_FPS
}

/**
 * The pose for this moment. `phase` (seconds) desynchronises individuals;
 * `motion` (0..1) is how hard it is moving, so idle and frozen enemies settle.
 */
export function poseFor(style: AnimStyle, time: number, phase: number, motion: number, out: Pose): Pose {
  const p = STYLES[style]
  const m = motion < 0 ? 0 : motion > 1 ? 1 : motion
  const t = stepTime(time + phase)
  const a = t * p.freq * Math.PI * 2
  const s = Math.sin(a)
  const c = Math.cos(a)
  out.bob = 0
  out.roll = 0
  out.pitch = 0
  out.sx = out.sy = out.sz = 1
  switch (style) {
    case 'hop': {
      const up = Math.max(0, s)
      out.bob = up * p.bob * m
      // Squashed on the ground, stretched in the air.
      const k = (up > 0.05 ? 1 : -1) * p.squash * (up > 0.05 ? up : 1) * (m * 0.8 + 0.2)
      out.sy = 1 + k
      out.roll = c * p.roll * m
      break
    }
    case 'flap':
      out.bob = (s * 0.5 + 0.5) * p.bob
      out.sx = 1 + s * p.squash
      out.sy = 1 - s * p.squash * 0.3
      out.roll = c * p.roll
      break
    case 'float':
      out.bob = (s * 0.5 + 0.5) * p.bob
      out.roll = c * p.roll
      out.sy = 1 + s * p.squash
      break
    default: {
      out.bob = Math.abs(s) * p.bob * m
      out.roll = s * p.roll * m
      out.sy = 1 + (Math.abs(c) - 0.5) * p.squash * (0.3 + 0.7 * m)
      break
    }
  }
  out.pitch = p.lean * m
  // Keep the volume roughly constant as it squashes.
  const side = 1 / Math.sqrt(Math.max(0.2, out.sy))
  out.sx *= side
  out.sz *= side
  return out
}
