/**
 * Player movement as a pure step function: state + input + terrain + dt in,
 * the same state mutated and a list of what happened out. No scene, no
 * events, no randomness, so the feel can be tuned and tested in node.
 *
 * Conventions: Y is up; yaw 0 faces -Z and turning right lowers yaw, so
 * forward(yaw) = (-sin, 0, -cos) and right(yaw) = (cos, 0, -sin).
 */
import { Vector3 } from 'three'

/** Tuning from docs/DESIGN.md "Movement". Speeds in m/s, accelerations in m/s². */
export const MOVE = {
  runSpeed: 7,
  groundAccel: 60,
  /** Exponential rate (per second) that stops you when there's no input. */
  groundFriction: 10,
  airAccel: 18,
  /** Speed gained per second while strafing diagonally to your velocity in the air (best at 45°). */
  airStrafeGain: 2.5,
  gravity: 28,
  jumpVelocity: 10,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  airJumpScale: 0.9,
  slideMinSpeed: 3,
  /** A slide that slows below this on flat ground or uphill ends. */
  slideExitSpeed: 1.5,
  slideBurst: 1.3,
  /**
   * A burst alone never takes you past this × run speed, so spamming slide on
   * flat ground tops out at a jog; hills are how you reach 3–4×.
   */
  slideBurstCeiling: 2,
  slideCooldown: 0.6,
  slideFriction: 0.6,
  /** How hard you can steer a slide; weak on purpose. */
  slideSteer: 6,
  slopeDownhill: 1.6,
  slopeUphill: 1,
  bhopWindow: 0.12,
  bhopBonus: 1.06,
  /** Hard cap on horizontal speed, × run speed. */
  speedCap: 4,
  overspeedDecay: 6,
  maxSlopeTan: Math.tan((50 * Math.PI) / 180),
  /** How far above your feet ground can be and still be stepped onto from the air. */
  stepUp: 0.45,
  /**
   * The ground holds you if it's no further below the ballistic arc than this
   * (metres, plus `groundStick` extra gravity). Fast slides still leave
   * sharp crests; walking over bumps never does.
   */
  groundSnap: 0.03,
  groundStick: 12,
  maxLaunchSpeed: 12,
  fallSafe: 9,
  fallDamagePerMetre: 4,
  /** Longest horizontal move per sub-step, so fast slides can't tunnel through props. */
  maxSubstep: 0.4,
  maxSubsteps: 8,
} as const

export interface MoveState {
  /** Feet position. */
  pos: Vector3
  vel: Vector3
  onGround: boolean
  sliding: boolean
  /** Seconds since leaving the ground (kept at 0 while grounded). */
  airTime: number
  /** Seconds since the last landing; bunny hops live in the first `bhopWindow`. */
  sinceLanded: number
  /** Seconds a pressed jump stays queued for the next chance to ground-jump. */
  jumpBuffer: number
  /** A ground jump was used since leaving the ground, so coyote time can't give a second one. */
  jumped: boolean
  airJumpsUsed: number
  slideCooldown: number
  /** A slide ran out of speed while held; it needs a fresh press. */
  slideLatched: boolean
  /** A slide was thrown off a crest; landing with Slide held resumes it without a new burst. */
  slideCarry: boolean
  /** Highest point since leaving the ground, for fall damage. */
  peakY: number
}

export interface MoveInput {
  /** Camera-space intent: x = right, y = forward, length <= 1. */
  moveX: number
  moveY: number
  /** Camera yaw the intent is relative to. */
  yaw: number
  jumpPressed: boolean
  slideHeld: boolean
}

export interface MoveParams {
  /** Multiplier on `MOVE.runSpeed`. */
  moveSpeed: number
  /** Multiplier on jump height (velocity scales with its square root). */
  jumpHeight: number
  extraJumps: number
}

/** What the step needs from the world; `WorldApi` satisfies it. */
export interface Terrain {
  heightAt(x: number, z: number): number
  normalAt(x: number, z: number, out: Vector3): Vector3
  collide?(pos: Vector3, radius: number): void
}

export interface MoveEvents {
  jumped: boolean
  airJump: boolean
  landed: boolean
  /** Downward speed at touchdown. */
  landSpeed: number
  /** How long the landing ended an airborne spell for. */
  airTime: number
  fallDamage: number
  slideStarted: boolean
  slideBurst: boolean
}

export function createMoveState(pos?: Vector3): MoveState {
  const p = pos ? pos.clone() : new Vector3()
  return {
    pos: p,
    vel: new Vector3(),
    onGround: false,
    sliding: false,
    airTime: 0,
    sinceLanded: 99,
    jumpBuffer: 0,
    jumped: true,
    airJumpsUsed: 0,
    slideCooldown: 0,
    slideLatched: false,
    slideCarry: false,
    peakY: p.y,
  }
}

export function createMoveEvents(): MoveEvents {
  return {
    jumped: false,
    airJump: false,
    landed: false,
    landSpeed: 0,
    airTime: 0,
    fallDamage: 0,
    slideStarted: false,
    slideBurst: false,
  }
}

/** Fall damage for a drop in metres; landing in a slide cancels it. */
export function fallDamage(drop: number, sliding: boolean): number {
  if (sliding || !(drop > MOVE.fallSafe)) return 0
  return (drop - MOVE.fallSafe) * MOVE.fallDamagePerMetre
}

/** Yaw that faces along (x, z). */
export function yawOf(x: number, z: number): number {
  return Math.atan2(-x, -z)
}

/** Wraps an angle into [-π, π]. */
export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0
  a = (a + Math.PI) % (Math.PI * 2)
  if (a < 0) a += Math.PI * 2
  return a - Math.PI
}

/** Pushes the player (knockback). Upward pushes lift them off the ground. */
export function applyImpulse(s: MoveState, x: number, y: number, z: number): void {
  s.vel.x += x
  s.vel.z += z
  if (y > 0) {
    s.vel.y = Math.max(s.vel.y, 0) + y
    if (s.onGround) leaveGround(s, true)
  }
}

/** Forgets any airborne history after a teleport so it can't turn into fall damage. */
export function resetAirState(s: MoveState): void {
  s.onGround = false
  s.sliding = false
  s.slideCarry = false
  s.jumped = true
  s.airTime = 0
  s.jumpBuffer = 0
  s.airJumpsUsed = 0
  s.peakY = s.pos.y
}

const _n = new Vector3()
const _c = new Vector3()
const _v = { x: 0, z: 0 }
const _events = createMoveEvents()

/**
 * Advances movement by `dt`. Mutates `s` and returns the events of this step
 * (a shared object unless `out` is given; read it before the next call).
 */
export function stepMovement(
  s: MoveState,
  input: MoveInput,
  params: MoveParams,
  terrain: Terrain,
  dt: number,
  radius = 0.5,
  out: MoveEvents = _events,
): MoveEvents {
  clearEvents(out)
  if (!(dt > 0)) return out

  const run = MOVE.runSpeed * Math.max(0, params.moveSpeed || 0)
  const cap = run * MOVE.speedCap

  // Camera-relative wish direction (unit) and how hard it's pushed (0..1).
  let wish = Math.min(1, Math.hypot(input.moveX, input.moveY))
  let wishX = 0
  let wishZ = 0
  if (wish > 1e-3) {
    const sin = Math.sin(input.yaw)
    const cos = Math.cos(input.yaw)
    const x = cos * input.moveX - sin * input.moveY
    const z = -sin * input.moveX - cos * input.moveY
    const len = Math.hypot(x, z)
    wishX = x / len
    wishZ = z / len
  } else {
    wish = 0
  }

  s.slideCooldown = Math.max(0, s.slideCooldown - dt)
  s.jumpBuffer = Math.max(0, s.jumpBuffer - dt)
  s.sinceLanded += dt
  if (!s.onGround) s.airTime += dt
  if (!input.slideHeld) s.slideLatched = false

  let vx = s.vel.x
  let vz = s.vel.z

  // ── Jumps ──
  const jumpVel = MOVE.jumpVelocity * Math.sqrt(Math.max(0, params.jumpHeight || 0))
  const canGroundJump = s.onGround || (s.airTime <= MOVE.coyoteTime && !s.jumped)
  if (input.jumpPressed) {
    if (!canGroundJump && s.airJumpsUsed < params.extraJumps && !aboutToLand(s, terrain)) {
      s.airJumpsUsed++
      s.vel.y = jumpVel * MOVE.airJumpScale
      s.peakY = s.pos.y
      // An air jump redirects you, which makes it a dodge as well as a hop.
      if (wish > 0.1) {
        const speed = Math.max(Math.hypot(vx, vz), run * wish)
        vx = wishX * speed
        vz = wishZ * speed
      }
      out.jumped = true
      out.airJump = true
    } else {
      s.jumpBuffer = MOVE.jumpBuffer
    }
  }
  if (s.jumpBuffer > 0 && canGroundJump) {
    if (s.sinceLanded <= MOVE.bhopWindow) {
      const speed = Math.hypot(vx, vz)
      const boosted = Math.min(cap, speed * MOVE.bhopBonus)
      if (speed > 1e-4 && boosted > speed) {
        vx *= boosted / speed
        vz *= boosted / speed
      }
    }
    // Leaving an upslope throws you a little higher.
    const climb = s.onGround ? Math.min(MOVE.maxLaunchSpeed, Math.max(0, s.vel.y)) : 0
    s.vel.y = jumpVel + climb * 0.5
    leaveGround(s, true)
    s.jumpBuffer = 0
    out.jumped = true
  }

  // ── Horizontal ──
  let speed = Math.hypot(vx, vz)
  if (s.onGround) {
    terrain.normalAt(s.pos.x, s.pos.z, _n)
    const slopeSin = Math.min(1, Math.hypot(_n.x, _n.z))
    const downX = slopeSin > 1e-4 ? _n.x / slopeSin : 0
    const downZ = slopeSin > 1e-4 ? _n.z / slopeSin : 0

    if (s.sliding) {
      const goingDownhill = slopeSin > 0.05 && vx * downX + vz * downZ > 0
      if (!input.slideHeld) {
        s.sliding = false
      } else if (speed < MOVE.slideExitSpeed && !goingDownhill) {
        s.sliding = false
        s.slideLatched = true
      }
    } else if (input.slideHeld && !s.slideLatched && (speed > MOVE.slideMinSpeed || s.slideCarry)) {
      s.sliding = true
      if (!s.slideCarry) {
        out.slideStarted = true
        if (s.slideCooldown <= 0 && speed > 1e-4) {
          const target = Math.min(speed * MOVE.slideBurst, Math.max(speed, run * MOVE.slideBurstCeiling))
          vx *= target / speed
          vz *= target / speed
          speed = target
          s.slideCooldown = MOVE.slideCooldown
          out.slideBurst = true
        }
      }
    }
    s.slideCarry = false

    if (s.sliding) {
      const f = Math.exp(-MOVE.slideFriction * dt)
      vx *= f
      vz *= f
      if (wish > 0) {
        _v.x = vx
        _v.z = vz
        steer(_v, wishX, wishZ, MOVE.slideSteer * dt * wish, 0, 0)
        vx = _v.x
        vz = _v.z
      }
      // Slopes are speed: downhill pulls harder than uphill holds you back.
      if (slopeSin > 1e-4) {
        const along = vx * downX + vz * downZ
        const a = MOVE.gravity * slopeSin * (along >= 0 ? MOVE.slopeDownhill : MOVE.slopeUphill)
        vx += downX * a * dt
        vz += downZ * a * dt
      }
    } else if (wish > 0) {
      if (speed <= run + 1e-3) {
        const tx = wishX * run * wish
        const tz = wishZ * run * wish
        const dx = tx - vx
        const dz = tz - vz
        const d = Math.hypot(dx, dz)
        const step = MOVE.groundAccel * dt
        if (d <= step) {
          vx = tx
          vz = tz
        } else {
          vx += (dx / d) * step
          vz += (dz / d) * step
        }
      } else {
        _v.x = vx
        _v.z = vz
        steer(_v, wishX, wishZ, MOVE.groundAccel * dt * wish, run, 0)
        vx = _v.x
        vz = _v.z
        // Over run speed on foot you slow back down — unless you're mid bunny hop.
        const sp = Math.hypot(vx, vz)
        if (sp > run && s.sinceLanded > MOVE.bhopWindow) {
          const k = Math.max(run, sp - MOVE.overspeedDecay * dt) / sp
          vx *= k
          vz *= k
        }
      }
    } else if (s.sinceLanded > MOVE.bhopWindow) {
      const f = Math.exp(-MOVE.groundFriction * dt)
      vx *= f
      vz *= f
      if (Math.hypot(vx, vz) < 0.05) {
        vx = 0
        vz = 0
      }
    }
  } else if (wish > 0) {
    _v.x = vx
    _v.z = vz
    steer(_v, wishX, wishZ, MOVE.airAccel * dt * wish, run * wish, MOVE.airStrafeGain * dt * wish)
    vx = _v.x
    vz = _v.z
  }

  speed = Math.hypot(vx, vz)
  if (speed > cap) {
    vx *= cap / speed
    vz *= cap / speed
  }
  if (!Number.isFinite(vx) || !Number.isFinite(vz)) {
    vx = 0
    vz = 0
  }
  s.vel.x = vx
  s.vel.z = vz

  // ── Integrate in sub-steps short enough that props and cliffs can't be skipped ──
  const travel = Math.hypot(vx, vz) * dt
  const steps = Math.min(MOVE.maxSubsteps, Math.max(1, Math.ceil(travel / MOVE.maxSubstep)))
  const h = dt / steps
  for (let i = 0; i < steps; i++) integrate(s, terrain, h, radius, input.slideHeld, out)
  return out
}

function clearEvents(out: MoveEvents): void {
  out.jumped = false
  out.airJump = false
  out.landed = false
  out.landSpeed = 0
  out.airTime = 0
  out.fallDamage = 0
  out.slideStarted = false
  out.slideBurst = false
}

function leaveGround(s: MoveState, jumped: boolean): void {
  if (s.sliding && !jumped) s.slideCarry = true
  s.onGround = false
  s.sliding = false
  s.jumped = jumped
  s.airTime = 0
  s.peakY = s.pos.y
}

/** Falling onto nearby ground: a jump press should wait for the landing rather than spend an air jump. */
function aboutToLand(s: MoveState, terrain: Terrain): boolean {
  return s.vel.y < 0 && s.pos.y - terrain.heightAt(s.pos.x, s.pos.z) < 0.35
}

/**
 * Turns (x, z) toward the wish direction at a rate set by `accel` while
 * keeping its speed, then speeds up along the wish toward `target` or brakes
 * against it. `strafeGain` adds a little speed for diagonal input.
 */
function steer(v: { x: number; z: number }, wx: number, wz: number, accel: number, target: number, strafeGain: number): void {
  const speed = Math.hypot(v.x, v.z)
  if (speed < 1e-4) {
    const s = Math.min(accel, target)
    v.x = wx * s
    v.z = wz * s
    return
  }
  const dx = v.x / speed
  const dz = v.z / speed
  const along = wx * dx + wz * dz
  const px = wx - dx * along
  const pz = wz - dz * along
  let nx = v.x + px * accel
  let nz = v.z + pz * accel
  const nlen = Math.hypot(nx, nz)
  nx /= nlen
  nz /= nlen
  let ns = speed
  if (along > 0 && speed < target) ns = Math.min(target, speed + along * accel)
  else if (along < 0) ns = Math.max(0, speed + along * accel)
  if (strafeGain > 0 && along > 0) ns += strafeGain * 2 * along * Math.hypot(px, pz)
  v.x = nx * ns
  v.z = nz * ns
}

function tooSteep(rise: number, run: number): boolean {
  return run > 1e-5 && rise > run * MOVE.maxSlopeTan + 0.01
}

/** Removes the part of the velocity that runs into the slope at (x, z). */
function blockUphill(s: MoveState, terrain: Terrain, x: number, z: number): void {
  terrain.normalAt(x, z, _n)
  const hl = Math.hypot(_n.x, _n.z)
  if (hl < 1e-4) return
  const ux = _n.x / hl
  const uz = _n.z / hl
  const vn = s.vel.x * ux + s.vel.z * uz
  if (vn < 0) {
    s.vel.x -= ux * vn
    s.vel.z -= uz * vn
  }
}

function integrate(s: MoveState, terrain: Terrain, h: number, radius: number, slideHeld: boolean, out: MoveEvents): void {
  const pos = s.pos
  const vel = s.vel
  const g = MOVE.gravity
  const px = pos.x
  const py = pos.y
  const pz = pos.z
  let nx = px + vel.x * h
  let nz = pz + vel.z * h
  let ground = terrain.heightAt(nx, nz)

  // Cliffs: too steep to walk up, and too high to step onto from the air.
  const blocked = s.onGround
    ? tooSteep(ground - py, Math.hypot(nx - px, nz - pz))
    : ground > Math.max(py, py + vel.y * h - 0.5 * g * h * h) + MOVE.stepUp
  if (blocked) {
    blockUphill(s, terrain, nx, nz)
    nx = px + vel.x * h
    nz = pz + vel.z * h
    ground = terrain.heightAt(nx, nz)
    const still = s.onGround
      ? tooSteep(ground - py, Math.hypot(nx - px, nz - pz))
      : ground > Math.max(py, py + vel.y * h - 0.5 * g * h * h) + MOVE.stepUp
    if (still) {
      vel.x = 0
      vel.z = 0
      nx = px
      nz = pz
      ground = terrain.heightAt(px, pz)
    }
  }

  // Props and the map wall push us out; stop pushing into them.
  if (terrain.collide) {
    _c.set(nx, py, nz)
    terrain.collide(_c, radius)
    const pushX = _c.x - nx
    const pushZ = _c.z - nz
    const push = Math.hypot(pushX, pushZ)
    if (push > 1e-6) {
      const ux = pushX / push
      const uz = pushZ / push
      const vn = vel.x * ux + vel.z * uz
      if (vn < 0) {
        vel.x -= ux * vn
        vel.z -= uz * vn
      }
      nx = _c.x
      nz = _c.z
      ground = terrain.heightAt(nx, nz)
    }
  }

  if (s.onGround) {
    // Carry on along the slope we're standing on; if the ground ahead drops
    // away from that line faster than gravity could follow, we're airborne.
    // The lower of the tangent and our actual climb rate wins, so neither a
    // stale speed after landing nor a normal sampled across a crease can
    // throw us off by itself.
    terrain.normalAt(px, pz, _n)
    const planeVy = -(_n.x * vel.x + _n.z * vel.z) / Math.max(0.2, _n.y)
    const ballistic = py + Math.min(planeVy, vel.y) * h - 0.5 * (g + MOVE.groundStick) * h * h - MOVE.groundSnap
    if (ground >= ballistic) {
      vel.y = Math.max(-60, Math.min(60, (ground - py) / h))
      pos.y = ground
    } else {
      // Leave with the vertical speed we actually had (a normal sampled across
      // a cliff edge would say we were already plunging).
      leaveGround(s, false)
      vel.y = Math.min(MOVE.maxLaunchSpeed, vel.y)
      pos.y = Math.max(ground, py + vel.y * h - 0.5 * g * h * h)
      vel.y -= g * h
    }
  } else {
    let ny = py + vel.y * h - 0.5 * g * h * h
    vel.y -= g * h
    if (ny > s.peakY) s.peakY = ny
    if (ny <= ground) {
      if (vel.y <= 0) {
        out.landed = true
        out.landSpeed = Math.max(out.landSpeed, -vel.y)
        out.airTime = s.airTime
        out.fallDamage += fallDamage(s.peakY - ground, slideHeld)
        s.onGround = true
        s.airJumpsUsed = 0
        s.jumped = false
        s.sinceLanded = 0
        s.airTime = 0
        vel.y = 0
      }
      ny = ground
    }
    pos.y = ny
  }
  pos.x = nx
  pos.z = nz
}
