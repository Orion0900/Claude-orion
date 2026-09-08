/**
 * Working out which way the runner is facing.
 *
 * Two sources disagree about "heading". Satellites report *course over ground*
 * — the direction you are travelling — which is null while you stand still and
 * only catches up after several fixes. The magnetometer reports which way the
 * phone is pointing, right now, whether you are moving or not. Turning on the
 * spot only shows up in the second, which is why a map driven by GPS alone
 * feels like it is lagging behind you.
 *
 * Everything here is angle arithmetic, where the hazard is 359° and 1° being
 * two degrees apart rather than 358.
 */

/** Fold any angle into 0-360. */
export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Shortest way round from `from` to `to`: negative is anticlockwise. */
export function angleDifference(from: number, to: number): number {
  const delta = normalizeAngle(to - from)
  return delta > 180 ? delta - 360 : delta
}

/**
 * Ease from one heading toward another, the short way round.
 *
 * `factor` is how much of the remaining turn to take per update: 1 snaps
 * instantly, small values crawl. Smoothing exists to take the jitter off a
 * magnetometer, not to slow the turn down, so it stays high.
 */
export function smoothHeading(previous: number | null, next: number, factor = 0.45): number {
  if (previous === null) return normalizeAngle(next)
  const clamped = Math.min(1, Math.max(0, factor))
  return normalizeAngle(previous + angleDifference(previous, next) * clamped)
}

/** Below this, a change is magnetometer noise and not worth redrawing for. */
export const HEADING_EPSILON_DEGREES = 0.75

export function headingChanged(previous: number | null, next: number): boolean {
  if (previous === null) return true
  return Math.abs(angleDifference(previous, next)) >= HEADING_EPSILON_DEGREES
}

export interface OrientationReading {
  /** Safari's compass heading: degrees clockwise from true north. */
  webkitCompassHeading?: number
  /** Standard rotation about the screen's normal, anticlockwise from north. */
  alpha?: number | null
  /** True when alpha is measured against north rather than an arbitrary origin. */
  absolute?: boolean
}

/**
 * Convert a device orientation reading into a compass heading.
 *
 * Safari hands over a true heading directly. Everywhere else `alpha` counts
 * anticlockwise, so it has to be flipped, and it is measured against the
 * device rather than the screen — so a phone held in landscape needs the screen
 * rotation added back.
 */
export function headingFromOrientation(
  reading: OrientationReading,
  screenAngle = 0,
): number | null {
  if (typeof reading.webkitCompassHeading === 'number' && !Number.isNaN(reading.webkitCompassHeading)) {
    return normalizeAngle(reading.webkitCompassHeading)
  }
  if (typeof reading.alpha === 'number' && !Number.isNaN(reading.alpha) && reading.absolute !== false) {
    return normalizeAngle(360 - reading.alpha + screenAngle)
  }
  return null
}

/**
 * Pick between the compass and satellite course.
 *
 * The compass wins because it is the one that answers "which way am I facing".
 * Course over ground only stands in when there is no magnetometer, and even
 * then only once moving faster than a slow walk, below which its direction is
 * mostly noise.
 */
export const MIN_SPEED_FOR_COURSE = 1.2

export function chooseHeading(input: {
  compass: number | null
  course: number | null
  speed: number | null
  derived: number | null
}): number | null {
  if (input.compass !== null) return input.compass
  if (input.course !== null && (input.speed === null || input.speed >= MIN_SPEED_FOR_COURSE)) {
    return input.course
  }
  return input.derived
}
