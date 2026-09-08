import { describe, expect, it } from 'vitest'
import { cumulativeDistances, destination, haversine, type LatLng } from './geo'
import { hasFinished, isOffRoute, locateOnRoute, projectOntoSegment } from './follow'

const start: LatLng = { lat: 42.3601, lng: -71.0589 }

/** A 1 km square loop, 40 m between vertices. */
function squareLoop(): LatLng[] {
  const path: LatLng[] = []
  let corner = start
  for (const bearing of [0, 90, 180, 270]) {
    for (let d = 0; d < 250; d += 40) path.push(destination(corner, bearing, d))
    corner = destination(corner, bearing, 250)
  }
  path.push(start)
  return path
}

describe('projectOntoSegment', () => {
  const a = start
  const b = destination(start, 90, 100)

  it('finds a point already on the line', () => {
    const midpoint = destination(start, 90, 50)
    const result = projectOntoSegment(a, b, midpoint)
    expect(result.distance).toBeLessThan(1)
    expect(result.t).toBeCloseTo(0.5, 1)
  })

  it('measures perpendicular distance', () => {
    const offset = destination(destination(start, 90, 50), 0, 30)
    expect(projectOntoSegment(a, b, offset).distance).toBeCloseTo(30, 0)
  })

  it('clamps before the start of the segment', () => {
    const behind = destination(start, 270, 40)
    const result = projectOntoSegment(a, b, behind)
    expect(result.t).toBe(0)
    expect(result.distance).toBeCloseTo(40, 0)
  })

  it('clamps past the end of the segment', () => {
    const beyond = destination(b, 90, 25)
    const result = projectOntoSegment(a, b, beyond)
    expect(result.t).toBe(1)
    expect(result.distance).toBeCloseTo(25, 0)
  })

  it('handles a zero-length segment', () => {
    const result = projectOntoSegment(a, a, destination(a, 0, 10))
    expect(result.t).toBe(0)
    expect(result.distance).toBeCloseTo(10, 0)
  })
})

describe('locateOnRoute', () => {
  const path = squareLoop()
  const cumulative = cumulativeDistances(path)
  const total = cumulative[cumulative.length - 1]

  it('reports no progress at the start line', () => {
    const progress = locateOnRoute(path, start)
    expect(progress.distanceAlong).toBeLessThan(5)
    expect(progress.offRouteBy).toBeLessThan(2)
    expect(progress.fraction).toBeLessThan(0.02)
  })

  it('measures how far along you are', () => {
    const quarter = destination(start, 0, 150)
    const progress = locateOnRoute(path, quarter)
    expect(progress.distanceAlong).toBeCloseTo(150, -1)
    expect(progress.distanceRemaining).toBeCloseTo(total - 150, -1)
  })

  it('measures how far off the line you have strayed', () => {
    const strayed = destination(destination(start, 0, 150), 90, 25)
    expect(locateOnRoute(path, strayed).offRouteBy).toBeCloseTo(25, 0)
  })

  it('flags being off route only past the tolerance', () => {
    const nearby = destination(destination(start, 0, 150), 90, 10)
    const lost = destination(destination(start, 0, 150), 90, 120)
    expect(isOffRoute(locateOnRoute(path, nearby))).toBe(false)
    expect(isOffRoute(locateOnRoute(path, lost))).toBe(true)
  })

  it('keeps progress moving forward where a loop returns to its own start', () => {
    // Standing at the start point when nearly finished must read as nearly
    // finished, not as having just set off.
    const nearTheEnd = path.length - 3
    const progress = locateOnRoute(path, start, { fromSegment: nearTheEnd }, cumulative)
    expect(progress.distanceAlong).toBeGreaterThan(total * 0.9)
  })

  it('does not jump ahead when the route passes close to itself', () => {
    // Without a window, a point near the start would match the final segment.
    const justStarted = destination(start, 0, 20)
    const progress = locateOnRoute(path, justStarted, { fromSegment: 0 }, cumulative)
    expect(progress.distanceAlong).toBeLessThan(60)
  })

  it('advances steadily as a runner works round the loop', () => {
    let segment = 0
    let previous = -1
    for (let d = 0; d <= 240; d += 30) {
      const progress = locateOnRoute(path, destination(start, 0, d), { fromSegment: segment }, cumulative)
      expect(progress.distanceAlong).toBeGreaterThan(previous)
      previous = progress.distanceAlong
      segment = progress.segment
    }
  })

  it('snaps to a point that actually lies on the route', () => {
    const strayed = destination(destination(start, 0, 100), 90, 30)
    const { snapped } = locateOnRoute(path, strayed)
    const onPath = Math.min(...path.map((p) => haversine(p, snapped)))
    expect(onPath).toBeLessThan(45)
  })

  it('copes with a degenerate route', () => {
    expect(locateOnRoute([start], start).distanceAlong).toBe(0)
    expect(locateOnRoute([], start).offRouteBy).toBe(0)
  })
})

describe('hasFinished', () => {
  const path = squareLoop()
  const cumulative = cumulativeDistances(path)
  const total = cumulative[cumulative.length - 1]

  it('is false partway round', () => {
    expect(hasFinished(locateOnRoute(path, destination(start, 0, 150)), total)).toBe(false)
  })

  it('is true back at the start after a full lap', () => {
    const progress = locateOnRoute(path, start, { fromSegment: path.length - 3 }, cumulative)
    expect(hasFinished(progress, total)).toBe(true)
  })
})

describe('recovering from a gap in GPS', () => {
  const path = squareLoop()
  const cumulative = cumulativeDistances(path)

  it('re-acquires when you reappear far past the last fix', () => {
    // Signal lost near the start, regained on the third side of the square —
    // well outside the window that follows a normal stream of fixes.
    const thirdCorner = destination(destination(start, 0, 250), 90, 250)
    const reappeared = destination(thirdCorner, 180, 120)
    const progress = locateOnRoute(path, reappeared, { fromSegment: 1 }, cumulative)

    expect(progress.offRouteBy).toBeLessThan(5)
    expect(progress.distanceAlong).toBeCloseTo(620, -1)
  })

  it('still refuses to jump for a fix that is merely a little off line', () => {
    // 20 m off near the start is you, not a relocation: stay put.
    const slightlyOff = destination(destination(start, 0, 80), 90, 20)
    const progress = locateOnRoute(path, slightlyOff, { fromSegment: 1 }, cumulative)

    expect(progress.distanceAlong).toBeLessThan(200)
  })

  it('leaves a genuinely lost runner marked as off route', () => {
    const lost = destination(start, 45, 900)
    const progress = locateOnRoute(path, lost, { fromSegment: 2 }, cumulative)
    expect(isOffRoute(progress)).toBe(true)
  })
})

describe('refusing to teleport the runner', () => {
  const path = squareLoop()
  const cumulative = cumulativeDistances(path)

  it('stays put for a poor fix near a parallel stretch of the same loop', () => {
    // On the north leg heading east, a bad fix lands nearer the parallel south
    // leg — a block away. Snapping there is what threw runners across town.
    const onNorthLeg = destination(start, 0, 120)
    const anchored = locateOnRoute(path, onNorthLeg, {}, cumulative)

    const strayed = destination(onNorthLeg, 90, 90)
    const next = locateOnRoute(path, strayed, { fromSegment: anchored.segment }, cumulative)

    expect(next.relocated).toBe(false)
    // Progress may nudge, but must not leap to the far side of the loop.
    expect(Math.abs(next.distanceAlong - anchored.distanceAlong)).toBeLessThan(250)
  })

  it('still re-acquires after a genuine signal gap', () => {
    const thirdCorner = destination(destination(start, 0, 250), 90, 250)
    const reappeared = destination(thirdCorner, 180, 120)
    const progress = locateOnRoute(path, reappeared, { fromSegment: 1 }, cumulative)

    expect(progress.relocated).toBe(true)
    expect(progress.distanceAlong).toBeCloseTo(620, -1)
  })

  it('reports plainly whether a fix was matched near the last one', () => {
    const near = locateOnRoute(path, destination(start, 0, 40), { fromSegment: 0 }, cumulative)
    expect(near.relocated).toBe(false)
  })

  it('refuses to relocate onto a point that is not really a match either', () => {
    // Far from every part of the route: nowhere is a good candidate, so the
    // runner is off route rather than somewhere else on it.
    const lost = destination(start, 45, 900)
    const progress = locateOnRoute(path, lost, { fromSegment: 2 }, cumulative)

    expect(progress.relocated).toBe(false)
    expect(isOffRoute(progress)).toBe(true)
  })
})
