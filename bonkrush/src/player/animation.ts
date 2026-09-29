/**
 * Stop-motion poses for character rigs. Poses are sampled at a low, fixed
 * rate on purpose — the choppy stepping is the look, not a performance hack.
 *
 * Angles are radians. Limb swings are positive forward; `lean` is positive
 * forward; `crouch` lowers the whole model.
 */

export const POSE_FPS = 12

export type PoseName = 'idle' | 'run' | 'air' | 'slide' | 'dead'

export interface Pose {
  legL: number
  legR: number
  armL: number
  armR: number
  /** Arms out to the sides. */
  armSpread: number
  lean: number
  /** Body height offset. */
  bob: number
  crouch: number
  /** Head nod, positive looks down. */
  head: number
  /** Tail wag, sideways. */
  tail: number
}

export function createPose(): Pose {
  return { legL: 0, legR: 0, armL: 0, armR: 0, armSpread: 0, lean: 0, bob: 0, crouch: 0, head: 0, tail: 0 }
}

/** Airborne spells shorter than this keep the ground pose, so bumps don't flicker it. */
const AIR_POSE_DELAY = 0.1

export function choosePose(alive: boolean, onGround: boolean, sliding: boolean, airTime: number, speed: number): PoseName {
  if (!alive) return 'dead'
  if (sliding) return 'slide'
  if (!onGround && airTime > AIR_POSE_DELAY) return 'air'
  return speed > 0.6 ? 'run' : 'idle'
}

/**
 * Fills `out` for a pose. `phase` is the run cycle in cycles (0..1 is one
 * stride), `time` drives idle motion, `vy` tells rising from falling.
 */
export function computePose(name: PoseName, phase: number, time: number, vy: number, out: Pose): Pose {
  const TAU = Math.PI * 2
  const s = Math.sin(phase * TAU)
  const breathe = Math.sin(time * TAU * 0.8)
  switch (name) {
    case 'run':
      out.legL = s * 0.9
      out.legR = -s * 0.9
      out.armL = -s * 0.8
      out.armR = s * 0.8
      out.armSpread = 0.15
      out.lean = 0.22
      out.bob = Math.abs(Math.cos(phase * TAU)) * 0.07
      out.crouch = 0
      out.head = -0.12
      out.tail = s * 0.35
      break
    case 'air': {
      const rising = vy > 0
      out.legL = rising ? 0.95 : 0.35
      out.legR = rising ? -0.25 : -0.15
      out.armL = rising ? 2.3 : 2.7
      out.armR = rising ? 2.1 : 2.5
      out.armSpread = rising ? 0.35 : 0.6
      out.lean = rising ? 0.12 : -0.05
      out.bob = 0
      out.crouch = 0
      out.head = rising ? -0.15 : 0.15
      out.tail = rising ? -0.4 : 0.5
      break
    }
    case 'slide':
      out.legL = 1.3
      out.legR = 1.05
      out.armL = -0.7
      out.armR = -0.95
      out.armSpread = 0.5
      out.lean = -0.55
      out.bob = 0
      out.crouch = -0.45
      out.head = 0.4
      out.tail = -0.3
      break
    case 'dead':
      out.legL = 0.2
      out.legR = -0.1
      out.armL = 0.3
      out.armR = 0.1
      out.armSpread = 1.2
      out.lean = 0
      out.bob = 0
      out.crouch = 0
      out.head = 0.3
      out.tail = 0
      break
    default:
      out.legL = 0
      out.legR = 0
      out.armL = breathe * 0.05
      out.armR = -breathe * 0.05
      out.armSpread = 0.1 + breathe * 0.03
      out.lean = 0.03
      out.bob = breathe * 0.025
      out.crouch = 0
      out.head = breathe * 0.04
      out.tail = Math.sin(time * TAU * 0.6) * 0.3
  }
  return out
}

/** Ticks true at a fixed rate, whatever the frame rate. */
export class StepClock {
  private acc: number
  private readonly step: number

  constructor(fps = POSE_FPS) {
    this.step = 1 / fps
    // Start due, so the first frame poses the model immediately.
    this.acc = this.step
  }

  tick(dt: number): boolean {
    if (dt > 0) this.acc += dt
    if (this.acc < this.step) return false
    this.acc %= this.step
    return true
  }
}
