import { Vector3 } from 'three'
import {
  MOVE,
  applyImpulse,
  createMoveEvents,
  createMoveState,
  fallDamage,
  stepMovement,
  wrapAngle,
  yawOf,
  type MoveInput,
  type MoveParams,
  type MoveState,
  type Terrain,
} from './movement'

const DT = 1 / 60
const PARAMS: MoveParams = { moveSpeed: 1, jumpHeight: 1, extraJumps: 0 }

/** A terrain from a height function, with the normal taken by finite differences. */
function terrain(height: (x: number, z: number) => number, collide?: Terrain['collide']): Terrain {
  return {
    heightAt: height,
    normalAt(x, z, out) {
      const e = 0.05
      const dx = (height(x + e, z) - height(x - e, z)) / (2 * e)
      const dz = (height(x, z + e) - height(x, z - e)) / (2 * e)
      return out.set(-dx, 1, -dz).normalize()
    },
    collide,
  }
}

const FLAT = terrain(() => 0)

function input(over: Partial<MoveInput> = {}): MoveInput {
  return { moveX: 0, moveY: 0, yaw: 0, jumpPressed: false, slideHeld: false, ...over }
}

function grounded(x = 0, y = 0, z = 0): MoveState {
  const s = createMoveState(new Vector3(x, y, z))
  s.onGround = true
  s.jumped = false
  return s
}

function hspeed(s: MoveState): number {
  return Math.hypot(s.vel.x, s.vel.z)
}

/** Yaw whose forward is +X, so "forward" input runs downhill on the ramps below. */
const FACE_X = yawOf(1, 0)

describe('movement', () => {
  it('jumps about 1.8 m on flat ground', () => {
    const s = grounded()
    stepMovement(s, input({ jumpPressed: true }), PARAMS, FLAT, DT)
    let peak = s.pos.y
    for (let i = 0; i < 200 && !s.onGround; i++) {
      stepMovement(s, input(), PARAMS, FLAT, DT)
      peak = Math.max(peak, s.pos.y)
    }
    expect(peak).toBeGreaterThan(1.7)
    expect(peak).toBeLessThan(1.9)
    expect(s.onGround).toBe(true)
    expect(s.pos.y).toBe(0)
  })

  it('scales jump height linearly with the jumpHeight stat', () => {
    const peakFor = (jumpHeight: number) => {
      const s = grounded()
      stepMovement(s, input({ jumpPressed: true }), { ...PARAMS, jumpHeight }, FLAT, 1 / 240)
      let peak = 0
      for (let i = 0; i < 2000 && !s.onGround; i++) {
        stepMovement(s, input(), { ...PARAMS, jumpHeight }, FLAT, 1 / 240)
        peak = Math.max(peak, s.pos.y)
      }
      return peak
    }
    expect(peakFor(2) / peakFor(1)).toBeCloseTo(2, 1)
  })

  it('reaches run speed quickly and stops quickly', () => {
    const s = grounded()
    for (let i = 0; i < 30; i++) stepMovement(s, input({ moveY: 1 }), PARAMS, FLAT, DT)
    expect(hspeed(s)).toBeCloseTo(MOVE.runSpeed, 3)
    // Forward at yaw 0 is -Z.
    expect(s.vel.z).toBeLessThan(0)
    for (let i = 0; i < 60; i++) stepMovement(s, input(), PARAMS, FLAT, DT)
    expect(hspeed(s)).toBe(0)
  })

  it('moves relative to the camera yaw', () => {
    const s = grounded()
    for (let i = 0; i < 30; i++) stepMovement(s, input({ moveX: 1, yaw: 0 }), PARAMS, FLAT, DT)
    expect(s.vel.x).toBeGreaterThan(6.9)
    const t = grounded()
    for (let i = 0; i < 30; i++) stepMovement(t, input({ moveY: 1, yaw: FACE_X }), PARAMS, FLAT, DT)
    expect(t.vel.x).toBeGreaterThan(6.9)
    expect(Math.abs(t.vel.z)).toBeLessThan(1e-6)
  })

  it('never produces NaN standing still on flat ground', () => {
    const s = grounded()
    for (let i = 0; i < 1000; i++) stepMovement(s, input(), PARAMS, FLAT, i % 7 === 0 ? 0 : DT)
    for (const v of [s.pos.x, s.pos.y, s.pos.z, s.vel.x, s.vel.y, s.vel.z]) expect(Number.isFinite(v)).toBe(true)
    expect(s.pos.length()).toBe(0)
    expect(s.onGround).toBe(true)
  })

  it('shrugs off zero stats and garbage dt', () => {
    const s = grounded()
    for (const dt of [0, -1, Number.NaN, DT]) {
      stepMovement(s, input({ moveY: 1, jumpPressed: true }), { moveSpeed: 0, jumpHeight: 0, extraJumps: 0 }, FLAT, dt)
    }
    for (const v of [s.pos.x, s.pos.y, s.pos.z, s.vel.x, s.vel.y, s.vel.z]) expect(Number.isFinite(v)).toBe(true)
  })

  it('slides downhill faster and faster', () => {
    const slope = Math.tan((18 * Math.PI) / 180)
    const ramp = terrain((x) => -x * slope)
    const s = grounded()
    s.vel.set(8, 0, 0)
    for (let i = 0; i < 180; i++) stepMovement(s, input({ slideHeld: true, yaw: FACE_X }), PARAMS, ramp, DT)
    expect(s.sliding).toBe(true)
    expect(hspeed(s)).toBeGreaterThan(MOVE.runSpeed * 3)
    expect(s.pos.x).toBeGreaterThan(20)
  })

  /** Slides with W held from run speed down a ramp `length` m long at `deg`°, flat either side; speed at the bottom. */
  function rampSlide(length: number, deg: number): number {
    const k = Math.tan((deg * Math.PI) / 180)
    const run = length * Math.cos((deg * Math.PI) / 180)
    const ramp = terrain((x) => -Math.min(run, Math.max(0, x)) * k)
    const s = grounded(-3, 0, 0)
    s.vel.set(MOVE.runSpeed, 0, 0)
    for (let i = 0; i < 600 && s.pos.x < run; i++) {
      stepMovement(s, input({ moveY: 1, yaw: FACE_X, slideHeld: true }), PARAMS, ramp, DT)
    }
    expect(s.pos.x).toBeGreaterThanOrEqual(run)
    return hspeed(s) / MOVE.runSpeed
  }

  it('takes a slide to 3–4× run speed down a long ramp', () => {
    // The world's slide ramps are 30–40 m at 15–25°; even the gentlest one gets you to 3×.
    expect(rampSlide(30, 15)).toBeGreaterThan(3.2)
    expect(rampSlide(35, 20)).toBeGreaterThan(3.8)
    expect(rampSlide(40, 25)).toBeLessThanOrEqual(MOVE.speedCap + 1e-9)
  })

  it('coasts a flat slide for several seconds', () => {
    const s = grounded()
    s.vel.set(MOVE.runSpeed, 0, 0)
    let t = 0
    while (t < 20) {
      stepMovement(s, input({ slideHeld: true, yaw: FACE_X }), PARAMS, FLAT, DT)
      t += DT
      if (!s.sliding) break
    }
    expect(t).toBeGreaterThan(5)
    expect(t).toBeLessThan(7)
    expect(s.pos.x).toBeGreaterThan(20)
    expect(s.pos.x).toBeLessThan(30)
  })

  it('makes hills faster than strafe-hopping on the flat', () => {
    // Ideal air strafing: W+D with the camera tracking the velocity, jumping on every landing.
    const s = grounded()
    s.vel.set(0, 0, -MOVE.runSpeed)
    let hops = 0
    let hopsToThree = -1
    for (let i = 0; i < 60 * 20 && hopsToThree < 0; i++) {
      const yaw = yawOf(s.vel.x, s.vel.z)
      if (stepMovement(s, input({ moveX: Math.SQRT1_2, moveY: Math.SQRT1_2, yaw, jumpPressed: s.onGround }), PARAMS, FLAT, DT).jumped) hops++
      if (hspeed(s) >= MOVE.runSpeed * 3) hopsToThree = hops
    }
    // About 7 s of perfect hopping to reach 3×; a 20° ramp does it in about one second.
    expect(hopsToThree).toBeGreaterThanOrEqual(9)
  })

  it('loses speed sliding on flat ground or uphill', () => {
    const flat = grounded()
    flat.vel.set(10, 0, 0)
    flat.slideCooldown = 1 // no burst, to compare like for like
    for (let i = 0; i < 60; i++) stepMovement(flat, input({ slideHeld: true }), PARAMS, FLAT, DT)
    expect(hspeed(flat)).toBeLessThan(10)

    const slope = Math.tan((15 * Math.PI) / 180)
    const up = grounded()
    up.vel.set(10, 0, 0)
    up.slideCooldown = 1
    for (let i = 0; i < 60; i++) stepMovement(up, input({ slideHeld: true }), PARAMS, terrain((x) => x * slope), DT)
    expect(hspeed(up)).toBeLessThan(hspeed(flat))
  })

  it('bursts when a slide starts, but only after the cooldown', () => {
    const s = grounded()
    s.vel.set(MOVE.runSpeed, 0, 0)
    const ev = stepMovement(s, input({ slideHeld: true }), PARAMS, FLAT, DT)
    expect(ev.slideStarted).toBe(true)
    expect(ev.slideBurst).toBe(true)
    expect(hspeed(s)).toBeGreaterThan(MOVE.runSpeed * 1.25)

    stepMovement(s, input(), PARAMS, FLAT, DT)
    const again = stepMovement(s, input({ slideHeld: true }), PARAMS, FLAT, DT)
    expect(again.slideStarted).toBe(true)
    expect(again.slideBurst).toBe(false)
  })

  it('does not slide from a standstill', () => {
    const s = grounded()
    const ev = stepMovement(s, input({ slideHeld: true }), PARAMS, FLAT, DT)
    expect(ev.slideStarted).toBe(false)
    expect(s.sliding).toBe(false)
  })

  it('keeps speed through bunny hops, and loses it without them', () => {
    const fast = MOVE.runSpeed * 2
    const hopper = grounded()
    hopper.vel.set(fast, 0, 0)
    let hops = 0
    for (let i = 0; i < 300; i++) {
      const ev = stepMovement(hopper, input({ moveY: 1, yaw: FACE_X, jumpPressed: hopper.onGround }), PARAMS, FLAT, DT)
      if (ev.jumped) hops++
    }
    expect(hops).toBeGreaterThan(3)
    expect(hspeed(hopper)).toBeGreaterThan(fast)

    const runner = grounded()
    runner.vel.set(fast, 0, 0)
    for (let i = 0; i < 300; i++) stepMovement(runner, input({ moveY: 1, yaw: FACE_X }), PARAMS, FLAT, DT)
    expect(hspeed(runner)).toBeCloseTo(MOVE.runSpeed, 3)
  })

  it('caps horizontal speed at 4× run speed', () => {
    const s = grounded()
    s.vel.set(100, 0, 0)
    stepMovement(s, input(), PARAMS, FLAT, DT)
    expect(hspeed(s)).toBeLessThanOrEqual(MOVE.runSpeed * MOVE.speedCap + 1e-9)

    const steep = Math.tan((40 * Math.PI) / 180)
    const t = grounded()
    t.vel.set(10, 0, 0)
    for (let i = 0; i < 600; i++) stepMovement(t, input({ slideHeld: true }), PARAMS, terrain((x) => -x * steep), DT)
    expect(hspeed(t)).toBeLessThanOrEqual(MOVE.runSpeed * MOVE.speedCap + 1e-9)
    expect(hspeed(t)).toBeGreaterThan(MOVE.runSpeed * 3.5)
  })

  it('blocks walking up cliffs over 50° but not gentle hills', () => {
    const cliff = terrain((x) => Math.max(0, (x - 2) * Math.tan((65 * Math.PI) / 180)))
    const s = grounded()
    for (let i = 0; i < 120; i++) stepMovement(s, input({ moveY: 1, yaw: FACE_X }), PARAMS, cliff, DT)
    expect(s.pos.x).toBeLessThan(2.2)
    expect(s.pos.y).toBeLessThan(0.5)

    const hill = terrain((x) => Math.max(0, (x - 2) * Math.tan((30 * Math.PI) / 180)))
    const t = grounded()
    for (let i = 0; i < 120; i++) stepMovement(t, input({ moveY: 1, yaw: FACE_X }), PARAMS, hill, DT)
    expect(t.pos.x).toBeGreaterThan(8)
    expect(t.pos.y).toBeGreaterThan(3)
  })

  it('can jump onto a ledge it cannot walk up', () => {
    const ledge = terrain((x) => (x > 1 ? 1.2 : 0))
    const s = grounded()
    for (let i = 0; i < 60; i++) stepMovement(s, input({ moveY: 1, yaw: FACE_X }), PARAMS, ledge, DT)
    expect(s.pos.x).toBeLessThan(1.05)
    for (let i = 0; i < 90; i++) stepMovement(s, input({ moveY: 1, yaw: FACE_X, jumpPressed: i === 0 }), PARAMS, ledge, DT)
    expect(s.pos.x).toBeGreaterThan(2)
    expect(s.pos.y).toBeCloseTo(1.2, 5)
  })

  it('allows a coyote jump just after running off a ledge', () => {
    const drop = terrain((x) => (x > 0.5 ? -6 : 0))
    const s = grounded()
    s.vel.set(MOVE.runSpeed, 0, 0)
    let offAt = -1
    for (let i = 0; i < 30; i++) {
      stepMovement(s, input({ moveY: 1, yaw: FACE_X }), PARAMS, drop, DT)
      if (!s.onGround) {
        offAt = i
        break
      }
    }
    expect(offAt).toBeGreaterThanOrEqual(0)
    stepMovement(s, input({ moveY: 1, yaw: FACE_X }), PARAMS, drop, DT)
    const ev = stepMovement(s, input({ moveY: 1, yaw: FACE_X, jumpPressed: true }), PARAMS, drop, DT)
    expect(ev.jumped).toBe(true)
    expect(ev.airJump).toBe(false)

    // Too late for coyote time and no air jumps: nothing happens.
    const late = grounded()
    late.vel.set(MOVE.runSpeed, 0, 0)
    for (let i = 0; i < 30; i++) stepMovement(late, input({ moveY: 1, yaw: FACE_X }), PARAMS, drop, DT)
    expect(late.onGround).toBe(false)
    expect(stepMovement(late, input({ jumpPressed: true }), PARAMS, drop, DT).jumped).toBe(false)
  })

  it('spends extra jumps in the air, one per press', () => {
    const params = { ...PARAMS, extraJumps: 1 }
    const s = grounded()
    stepMovement(s, input({ jumpPressed: true }), params, FLAT, DT)
    for (let i = 0; i < 20; i++) stepMovement(s, input(), params, FLAT, DT)
    const first = stepMovement(s, input({ jumpPressed: true }), params, FLAT, DT)
    expect(first.jumped && first.airJump).toBe(true)
    expect(s.vel.y).toBeCloseTo(MOVE.jumpVelocity * MOVE.airJumpScale - MOVE.gravity * DT, 5)
    for (let i = 0; i < 5; i++) stepMovement(s, input(), params, FLAT, DT)
    expect(stepMovement(s, input({ jumpPressed: true }), params, FLAT, DT).jumped).toBe(false)
  })

  it('buffers a jump pressed just before landing', () => {
    const s = createMoveState(new Vector3(0, 0.5, 0))
    s.vel.y = -8
    const events = createMoveEvents()
    stepMovement(s, input({ jumpPressed: true }), PARAMS, FLAT, DT, 0.5, events)
    expect(events.jumped).toBe(false)
    let jumped = false
    for (let i = 0; i < 10 && !jumped; i++) jumped = stepMovement(s, input(), PARAMS, FLAT, DT).jumped
    expect(jumped).toBe(true)
  })

  it('deals fall damage past 9 m unless you land sliding', () => {
    expect(fallDamage(8, false)).toBe(0)
    expect(fallDamage(15, false)).toBeCloseTo(24)
    expect(fallDamage(15, true)).toBe(0)

    const fall = (slideHeld: boolean) => {
      const s = createMoveState(new Vector3(0, 15, 0))
      for (let i = 0; i < 200; i++) {
        const ev = stepMovement(s, input({ slideHeld }), PARAMS, FLAT, DT)
        if (ev.landed) return ev.fallDamage
      }
      return -1
    }
    expect(fall(false)).toBeCloseTo(24, 0)
    expect(fall(true)).toBe(0)
  })

  it('slides along props instead of stopping dead', () => {
    // A solid post at the origin, radius 1.
    const post = terrain(
      () => 0,
      (pos, radius) => {
        const d = Math.hypot(pos.x, pos.z)
        const min = 1 + radius
        if (d < min && d > 1e-6) {
          pos.x *= min / d
          pos.z *= min / d
        }
      },
    )
    const s = grounded(-4, 0, 0.3)
    for (let i = 0; i < 120; i++) stepMovement(s, input({ moveY: 1, yaw: FACE_X }), PARAMS, post, DT)
    expect(Math.hypot(s.pos.x, s.pos.z)).toBeGreaterThanOrEqual(1.5 - 1e-6)
    expect(s.pos.x).toBeGreaterThan(1)
  })

  it('launches off a sharp crest at slide speed but hugs gentle ground', () => {
    const crest = terrain((x) => (x < 0 ? x * 0.6 : -x * 0.6))
    const fast = grounded(-5, -3, 0)
    fast.vel.set(24, 0, 0)
    let launched = false
    for (let i = 0; i < 30; i++) {
      stepMovement(fast, input({ moveY: 1, yaw: FACE_X }), PARAMS, crest, DT)
      if (!fast.onGround && fast.pos.x > 0) launched = true
    }
    expect(launched).toBe(true)

    const bumps = terrain((x, z) => Math.sin(x * 0.3) * 1.5 + Math.cos(z * 0.25))
    const walker = grounded(0, bumps.heightAt(0, 0), 0)
    for (let i = 0; i < 300; i++) {
      stepMovement(walker, input({ moveY: 1, moveX: 0.3, yaw: FACE_X }), PARAMS, bumps, DT)
      expect(walker.onGround).toBe(true)
    }
  })

  it('knockback with lift throws you into the air', () => {
    const s = grounded()
    applyImpulse(s, 5, 4, 0)
    expect(s.onGround).toBe(false)
    stepMovement(s, input(), PARAMS, FLAT, DT)
    expect(s.pos.y).toBeGreaterThan(0)
    expect(s.pos.x).toBeGreaterThan(0)
  })

  it('has consistent yaw helpers', () => {
    expect(yawOf(0, -1)).toBeCloseTo(0)
    expect(yawOf(1, 0)).toBeCloseTo(-Math.PI / 2)
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI)
    expect(wrapAngle(Math.PI / 2 + 2 * Math.PI)).toBeCloseTo(Math.PI / 2)
    expect(wrapAngle(-Math.PI / 2 - 4 * Math.PI)).toBeCloseTo(-Math.PI / 2)
    expect(wrapAngle(Number.NaN)).toBe(0)
  })
})
