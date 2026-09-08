import { describe, expect, it } from 'vitest'
import { destination, haversine, pathLength, type LatLng } from './geo'
import { buildProfile } from './elevation'
import { placeSteps, type RawStep, type RouteStep } from './navigation'
import type { RouteResult } from './routeSearch'
import {
  detectDirection,
  MIN_MOVEMENT_METERS,
  mirrorModifier,
  reverseProfile,
  reverseRoute,
  reverseSteps,
} from './direction'

const start: LatLng = { lat: 42.3601, lng: -71.0589 }

/** A 1 km square loop run clockwise: north, east, south, west. */
function squareLoop(): LatLng[] {
  const path: LatLng[] = []
  let corner = start
  for (const bearing of [0, 90, 180, 270]) {
    for (let d = 0; d < 250; d += 25) path.push(destination(corner, bearing, d))
    corner = destination(corner, bearing, 250)
  }
  path.push(start)
  return path
}

const corners = {
  home: start,
  north: destination(start, 0, 250),
  northEast: destination(destination(start, 0, 250), 90, 250),
  southEast: destination(destination(destination(start, 0, 250), 90, 250), 180, 250),
}

function loopSteps(path: LatLng[]): RouteStep[] {
  const raw: RawStep[] = [
    { type: 'depart', location: corners.home, name: 'Home Street' },
    { type: 'turn', modifier: 'right', location: corners.north, name: 'North Road' },
    { type: 'turn', modifier: 'right', location: corners.northEast, name: 'East Lane' },
    { type: 'turn', modifier: 'right', location: corners.southEast, name: 'South Way' },
    { type: 'arrive', location: corners.home },
  ]
  return placeSteps(path, raw)
}

describe('mirrorModifier', () => {
  it('swaps left and right', () => {
    expect(mirrorModifier('left')).toBe('right')
    expect(mirrorModifier('right')).toBe('left')
  })

  it('swaps the graded turns too', () => {
    expect(mirrorModifier('slight left')).toBe('slight right')
    expect(mirrorModifier('sharp right')).toBe('sharp left')
  })

  it('leaves straight on and turning round alone', () => {
    expect(mirrorModifier('straight')).toBe('straight')
    expect(mirrorModifier('uturn')).toBe('uturn')
  })

  it('passes through anything it does not recognise', () => {
    expect(mirrorModifier(undefined)).toBeUndefined()
    expect(mirrorModifier('sideways')).toBe('sideways')
  })
})

describe('reverseSteps', () => {
  const path = squareLoop()
  const forward = loopSteps(path)
  const reversedPath = [...path].reverse()
  const reversed = reverseSteps(forward, reversedPath)

  it('keeps the same number of instructions', () => {
    expect(reversed).toHaveLength(forward.length)
  })

  it('opens by departing and closes by arriving', () => {
    expect(reversed[0].type).toBe('depart')
    expect(reversed[reversed.length - 1].type).toBe('arrive')
  })

  it('sets off along the road that used to lead home', () => {
    // Clockwise you finish along South Way, so anticlockwise you start on it.
    expect(reversed[0].name).toBe('South Way')
  })

  it('turns the other way at every junction', () => {
    // Every corner of a clockwise square is a right turn; anticlockwise they
    // are all left turns.
    const turns = reversed.filter((step) => step.type === 'turn')
    expect(turns).toHaveLength(3)
    expect(turns.every((step) => step.modifier === 'left')).toBe(true)
  })

  it('names the road you actually end up on', () => {
    // Going anticlockwise, the first turn takes you off South Way onto East Lane.
    const turns = reversed.filter((step) => step.type === 'turn')
    expect(turns.map((step) => step.name)).toEqual(['East Lane', 'North Road', 'Home Street'])
  })

  it('places instructions in running order along the reversed route', () => {
    for (let i = 1; i < reversed.length; i++) {
      expect(reversed[i].distanceAlong).toBeGreaterThanOrEqual(reversed[i - 1].distanceAlong)
    }
  })

  it('mirrors each junction to the right distance from the new start', () => {
    const total = pathLength(reversedPath)
    const turns = reversed.filter((step) => step.type === 'turn')
    // The last clockwise turn is 750 m in, so it is 250 m into the reverse run.
    expect(turns[0].distanceAlong).toBeCloseTo(total - 750, -1)
  })

  it('keeps each junction where it physically is', () => {
    const turns = reversed.filter((step) => step.type === 'turn')
    expect(haversine(turns[0].location, corners.southEast)).toBeLessThan(1)
  })

  it('drops a roundabout exit number rather than guessing it', () => {
    const withRoundabout = placeSteps(path, [
      { type: 'depart', location: corners.home, name: 'Home Street' },
      { type: 'roundabout', modifier: 'right', exit: 2, location: corners.north, name: 'North Road' },
      { type: 'arrive', location: corners.home },
    ])
    const out = reverseSteps(withRoundabout, reversedPath)
    expect(out.some((step) => step.exit !== undefined)).toBe(false)
  })

  it('copes with an empty instruction list', () => {
    expect(reverseSteps([], reversedPath)).toEqual([])
  })
})

describe('reverseProfile', () => {
  const points = Array.from({ length: 5 }, (_, i) => destination(start, 90, i * 250))
  const profile = buildProfile(points, [0, 40, 80, 60, 20])

  it('swaps climbing for descent', () => {
    const reversed = reverseProfile(profile)
    expect(reversed.gain).toBeCloseTo(profile.loss, 5)
    expect(reversed.loss).toBeCloseTo(profile.gain, 5)
  })

  it('reads the elevations from the other end', () => {
    const reversed = reverseProfile(profile)
    expect(reversed.elevations[0]).toBeCloseTo(profile.elevations[profile.elevations.length - 1], 5)
  })

  it('keeps distances ascending and the same length overall', () => {
    const reversed = reverseProfile(profile)
    for (let i = 1; i < reversed.distances.length; i++) {
      expect(reversed.distances[i]).toBeGreaterThanOrEqual(reversed.distances[i - 1])
    }
    expect(reversed.distances[reversed.distances.length - 1]).toBeCloseTo(
      profile.distances[profile.distances.length - 1],
      5,
    )
  })

  it('leaves the high and low points as they were', () => {
    const reversed = reverseProfile(profile)
    expect(reversed.maxElevation).toBe(profile.maxElevation)
    expect(reversed.minElevation).toBe(profile.minElevation)
  })
})

describe('reverseRoute', () => {
  const path = squareLoop()
  const route: RouteResult = {
    id: 'r1',
    path,
    distance: pathLength(path),
    profile: buildProfile(path.filter((_, i) => i % 8 === 0), [10, 30, 50, 30, 10, 20]),
    outboundBearing: 0,
    turns: 3,
    steps: loopSteps(path),
    meetsCriteria: true,
    distanceError: 0.01,
    score: 0.02,
  }

  it('is the same run, the other way round', () => {
    const reversed = reverseRoute(route)
    expect(reversed.distance).toBe(route.distance)
    expect(reversed.path).toHaveLength(route.path.length)
    expect(haversine(reversed.path[0], route.path[route.path.length - 1])).toBeLessThan(1)
  })

  it('still starts and finishes at the same place', () => {
    const reversed = reverseRoute(route)
    expect(haversine(reversed.path[0], reversed.path[reversed.path.length - 1])).toBeLessThan(1)
  })

  it('heads out the opposite way', () => {
    // The loop's final leg runs west into home, so run backwards it sets off
    // east — the opposite of the clockwise route's northward start.
    const reversed = reverseRoute(route)
    expect(reversed.outboundBearing).toBeCloseTo(90, -1)
  })

  it('takes a new id, so it is never mistaken for the original', () => {
    expect(reverseRoute(route).id).not.toBe(route.id)
  })

  it('reverses twice back to where it started', () => {
    const there = reverseRoute(route)
    const back = reverseRoute(there)
    expect(haversine(back.path[0], route.path[0])).toBeLessThan(1)
    expect(back.profile.gain).toBeCloseTo(route.profile.gain, 5)
  })
})

describe('detectDirection', () => {
  const path = squareLoop()

  it('says nothing until the runner has actually moved', () => {
    const barely = destination(start, 0, MIN_MOVEMENT_METERS - 5)
    expect(detectDirection(path, start, barely)).toBeNull()
  })

  it('recognises setting off the way the route was built', () => {
    // The loop leaves heading north.
    expect(detectDirection(path, start, destination(start, 0, 40))).toBe('forward')
  })

  it('recognises setting off the other way round', () => {
    // The final leg runs west into home, so setting off backwards heads east.
    expect(detectDirection(path, start, destination(start, 90, 40))).toBe('reverse')
  })

  it('is not fooled by heading somewhere off the route entirely', () => {
    // Due south is neither way round this loop; the check should not insist.
    expect(detectDirection(path, start, destination(start, 180, 40))).toBeNull()
  })

  it('stays undecided when the two ways are hard to tell apart', () => {
    // An out-and-back leaves and returns along the same line.
    const outAndBack = [
      ...Array.from({ length: 10 }, (_, i) => destination(start, 90, i * 50)),
      ...Array.from({ length: 10 }, (_, i) => destination(start, 90, (9 - i) * 50)),
    ]
    expect(detectDirection(outAndBack, start, destination(start, 90, 40))).toBeNull()
  })

  it('refuses to guess from a degenerate route', () => {
    expect(detectDirection([start], start, destination(start, 0, 50))).toBeNull()
    expect(detectDirection([], start, destination(start, 0, 50))).toBeNull()
  })
})
