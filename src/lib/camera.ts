/**
 * Sizing the navigation camera so the map never runs out.
 *
 * While navigating, the map is drawn on an oversized "rotor" that turns with the
 * runner and, in the third-person view, is tipped back like the ground ahead.
 * The rotor has to reach every corner of the screen whichever way it is turned.
 * A rectangle can't: sized for north-up, it leaves a black void above the road
 * as soon as the runner faces east or west. So the rotor is a square, and the
 * square is sized from the geometry of the screen rather than guessed.
 *
 * A square turned to any angle still covers a disc of half its side around its
 * centre, and the rotor's centre is the runner. So the question is only: how far
 * from the runner, on the map, is the furthest point that shows on screen?
 *
 * Flat on, that is just the furthest screen corner. Tilted, the top of the
 * screen looks a long way down the road, and the distance grows quickly the
 * closer the top gets to the horizon — which is why the tilted view only has to
 * reach a little below the top edge, where the instruction banner and a haze
 * cover the rest.
 */
export type CameraPerspective = '3d' | '2d'

/** How far the ground is pitched back in the third-person view. */
export const TILT_DEGREES = 42

/**
 * Viewing distance for the tilted view, in CSS pixels. Nearer exaggerates the
 * convergence of the road and pushes the far edge out very fast; this keeps a
 * clear sense of depth while the rotor stays a size a phone can composite.
 */
export const PERSPECTIVE_PX = 1400

/**
 * How far down the screen, as a fraction, the tilted map must reach. Above it
 * sits the instruction banner and a haze, so tiles there would never be seen.
 */
export const HORIZON_FRACTION = 0.14

/** Room for rounding and sub-pixel seams. */
const MARGIN_PX = 12

export interface CameraInput {
  /** Viewport size in CSS pixels. */
  width: number
  height: number
  /** Where the runner sits, as a fraction of the height down from the top. */
  puckFraction: number
  perspective: CameraPerspective
}

export interface Camera {
  /** Side of the square rotor, in CSS pixels. */
  rotorSize: number
  /** How far to move the rotor's centre down from the viewport's centre. */
  shiftY: number
  /** Degrees of pitch; 0 when flat. */
  tilt: number
  /** CSS perspective distance, or null when flat. */
  perspectivePx: number | null
}

const toRad = (degrees: number) => (degrees * Math.PI) / 180

/**
 * The map point that a screen point shows, measured from the runner.
 *
 * `x` is across the screen and `up` is up it, both from the runner's spot on
 * screen. Returns how far that is on the (tilted) map, in the same pixels the
 * map is drawn in. Beyond the horizon there is no such point.
 */
export function groundDistance(
  x: number,
  up: number,
  tilt: number,
  perspective: number | null,
): number {
  if (perspective === null || tilt === 0) return Math.hypot(x, up)
  const cos = Math.cos(toRad(tilt))
  const sin = Math.sin(toRad(tilt))
  const denominator = perspective * cos - up * sin
  if (denominator <= 0) return Infinity
  // Distance into the screen along the ground, then the sideways spread, which
  // widens with depth for the same reason railway lines appear to meet.
  const along = (up * perspective) / denominator
  const across = (x * (perspective + along * sin)) / perspective
  return Math.hypot(across, along)
}

export function cameraFor({ width, height, puckFraction, perspective }: CameraInput): Camera {
  const puckY = height * puckFraction
  const halfWidth = width / 2
  const shiftY = puckY - height / 2

  if (perspective === '2d') {
    const reach = Math.hypot(halfWidth, Math.max(puckY, height - puckY))
    return { rotorSize: Math.ceil(2 * (reach + MARGIN_PX)), shiftY, tilt: 0, perspectivePx: null }
  }

  // The screen's extremes: its two top corners at the horizon line, and its two
  // bottom corners. Everything between lies closer.
  const topUp = puckY - height * HORIZON_FRACTION
  const bottomUp = puckY - height
  const reach = Math.max(
    groundDistance(halfWidth, topUp, TILT_DEGREES, PERSPECTIVE_PX),
    groundDistance(halfWidth, bottomUp, TILT_DEGREES, PERSPECTIVE_PX),
  )
  return {
    rotorSize: Math.ceil(2 * (reach + MARGIN_PX)),
    shiftY,
    tilt: TILT_DEGREES,
    perspectivePx: PERSPECTIVE_PX,
  }
}
