/**
 * Double-tap detection.
 *
 * Kept away from the DOM so the timing and slop rules can be tested directly:
 * two taps count as one gesture only if they land close together in both time
 * and place, and a third tap starts a fresh pair rather than re-triggering.
 */

export interface DoubleTapOptions {
  /** Longest gap between the two taps, in milliseconds. */
  maxDelayMs?: number
  /** How far apart the taps may land, in pixels. */
  maxDistancePx?: number
}

export interface DoubleTapDetector {
  /** Feed a tap; returns true when it completes a double tap. */
  tap(x: number, y: number, timeMs: number): boolean
  reset(): void
}

export function createDoubleTapDetector(options: DoubleTapOptions = {}): DoubleTapDetector {
  const maxDelay = options.maxDelayMs ?? 320
  const maxDistance = options.maxDistancePx ?? 36
  let previous: { x: number; y: number; time: number } | null = null

  return {
    tap(x, y, timeMs) {
      const last = previous
      if (
        last &&
        timeMs - last.time <= maxDelay &&
        Math.hypot(x - last.x, y - last.y) <= maxDistance
      ) {
        // Consume the pair, so a third tap begins a new one.
        previous = null
        return true
      }
      previous = { x, y, time: timeMs }
      return false
    },
    reset() {
      previous = null
    },
  }
}
