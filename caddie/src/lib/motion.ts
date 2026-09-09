/**
 * The small amount of maths behind the app's animation.
 *
 * Motion here has one job: make a change obvious without making anyone wait.
 * Everything is short, everything decelerates, and everything can be switched
 * off — a golfer who has asked their phone to stop animating things has asked
 * for a reason.
 */

/** Decelerating curve: fast off the mark, gentle at the end. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 1 - (1 - clamped) ** 3
}

/**
 * A spring-ish overshoot for things that should feel bouncy — a club
 * changing, a number landing. Ends exactly at 1 so nothing is left crooked.
 */
export function easeOutBack(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  if (clamped === 1) return 1
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (clamped - 1) ** 3 + c1 * (clamped - 1) ** 2
}

/**
 * Whether a change in the yardage is worth flashing.
 *
 * The number itself never animates — golf apps learned the hard way that a
 * rolling readout is unreadable at the moment you're choosing a club. What it
 * gets instead is a quick flash, and only when the change is real rather than
 * the GPS breathing.
 */
export function worthFlagging(from: number | null, to: number | null): boolean {
  if (from === null || to === null) return false
  return Math.abs(to - from) >= 3
}

export interface ConfettiPiece {
  /** Percent across the burst's box. */
  x: number
  /** Degrees of spin over the fall. */
  spin: number
  /** Seconds before this piece starts. */
  delay: number
  /** Seconds it falls for. */
  duration: number
  /** Index into the palette, so callers need no colour knowledge. */
  color: number
  /** Pixels of sideways drift. */
  drift: number
}

/**
 * A burst of confetti, spread across the width and staggered in time so it
 * reads as a shower rather than a curtain. Deterministic given a seed, which
 * keeps it testable.
 */
export function confettiBurst(count: number, seed = 1): ConfettiPiece[] {
  let state = seed
  // Park-Miller: a tiny generator, no dependency, good enough for confetti.
  const random = () => {
    state = (state * 48271) % 2147483647
    return state / 2147483647
  }
  return Array.from({ length: count }, () => ({
    x: random() * 100,
    spin: 180 + random() * 540,
    delay: random() * 0.35,
    duration: 1.1 + random() * 0.8,
    color: Math.floor(random() * 5),
    drift: (random() - 0.5) * 120,
  }))
}

/** True when the player has asked their phone to keep still. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
