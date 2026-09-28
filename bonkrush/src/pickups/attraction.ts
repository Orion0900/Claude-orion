/**
 * Pure pickup maths: magnet range, homing, gem tiers, the rising pitch of
 * quick XP chains and the pop-in curve. No renderer, so it is tested in node.
 */
import type { Vector3 } from 'three'

/** Magnet radius at pickupRange 1, metres. */
export const BASE_PICKUP_RANGE = 3.5
/** Pickups closer than this to the player's centre are collected. */
export const COLLECT_RADIUS = 0.8
/** Homing speed cap, unless the player outruns it (see `homingSpeedCap`). */
export const MAX_HOMING_SPEED = 30
/** m/s² while homing: a short visible lag, then a snap to the player. */
export const HOMING_ACCEL = 55
/** Speed a pickup starts homing at. */
export const HOMING_START_SPEED = 4

/** XP gem value thresholds: blue below 5, green below 25, red from 25. */
export const XP_GREEN = 5
export const XP_RED = 25

export function attractRange(pickupRange: number): number {
  return Number.isFinite(pickupRange) ? Math.max(0, pickupRange) * BASE_PICKUP_RANGE : BASE_PICKUP_RANGE
}

/** Pickups must always catch a sliding player, so the cap rides above the player's speed. */
export function homingSpeedCap(playerSpeed: number): number {
  return Math.max(MAX_HOMING_SPEED, (Number.isFinite(playerSpeed) ? playerSpeed : 0) + 6)
}

/**
 * Moves `pos` toward `target`, accelerating, and never past it. Returns the
 * new speed. Landing exactly on the target is what makes collection reliable
 * at any frame rate.
 */
export function homingStep(pos: Vector3, target: Vector3, speed: number, dt: number, maxSpeed = MAX_HOMING_SPEED): number {
  const next = Math.min(maxSpeed, Math.max(0, speed) + HOMING_ACCEL * dt)
  const dx = target.x - pos.x
  const dy = target.y - pos.y
  const dz = target.z - pos.z
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const step = next * dt
  if (dist <= step || dist < 1e-6) {
    pos.x = target.x
    pos.y = target.y
    pos.z = target.z
  } else {
    const k = step / dist
    pos.x += dx * k
    pos.y += dy * k
    pos.z += dz * k
  }
  return next
}

/** 0 = blue, 1 = green, 2 = red. */
export function xpTier(value: number): 0 | 1 | 2 {
  if (value >= XP_RED) return 2
  if (value >= XP_GREEN) return 1
  return 0
}

/** Bigger coin piles read bigger, gently: ×1 at 1 gold, about ×1.45 at 10, capped at ×1.8. */
export function valueScale(value: number): number {
  if (!(value > 1)) return 1
  return 1 + Math.min(0.8, Math.log10(value) * 0.45)
}

/** Scale over a pickup's first moments: a quick overshooting pop from nothing. */
export function popScale(age: number, duration = 0.18): number {
  if (age >= duration) return 1
  if (age <= 0) return 0.01
  const t = age / duration - 1
  const s = 1.70158
  return Math.max(0.01, 1 + (s + 1) * t * t * t + s * t * t)
}

/**
 * Tracks runs of quick collections so each gem in a chain sounds a little
 * higher, and throttles the sound so a magnet sweep isn't a wall of noise.
 */
export class PickupChain {
  private chain = 0
  private last = -Infinity
  private lastSound = -Infinity

  constructor(
    private readonly window = 0.45,
    private readonly minGap = 0.045,
    private readonly step = 0.04,
    private readonly maxSteps = 24,
  ) {}

  /** Registers one collection at game time `time`; returns the pitch to play, or 0 to stay quiet. */
  collect(time: number): number {
    this.chain = time - this.last <= this.window ? this.chain + 1 : 0
    this.last = time
    if (time - this.lastSound < this.minGap) return 0
    this.lastSound = time
    return 1 + Math.min(this.chain, this.maxSteps) * this.step
  }

  get length(): number {
    return this.chain
  }
}

/**
 * Index of the item nearest to (x, z) on the ground plane that `accept`
 * allows, or -1. Used to merge overflow value into an existing gem.
 */
export function nearestIndex<T extends { pos: Vector3 }>(
  items: readonly T[],
  x: number,
  z: number,
  accept: (item: T) => boolean,
): number {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!accept(item)) continue
    const dx = item.pos.x - x
    const dz = item.pos.z - z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
