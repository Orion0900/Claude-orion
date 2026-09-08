/**
 * Turn-by-turn guidance: what to say next, and how far away it is.
 *
 * The routing engine describes a route as a list of maneuvers. To guide someone
 * mid-run each maneuver needs a position *along* the route, so it can be
 * compared against how far they've got. Those positions are measured by
 * projecting each maneuver onto the route itself, walking forwards, which keeps
 * them in order even where a loop crosses its own path.
 */
import { cumulativeDistances, haversine, type LatLng } from './geo'
import { projectOntoSegment } from './follow'
import type { Maneuver } from './turns'
import { metersToFeet, metersToMiles, type DistanceUnit } from './units'

export interface RawStep extends Maneuver {
  /** Where the maneuver happens. */
  location: LatLng
  /** The road this step travels along, i.e. what you turn onto. */
  name?: string
  /** Road number, for roads carrying one instead of a name ("A21"). */
  ref?: string
  /** Where the road leads, as signposted ("Town Centre"). */
  destinations?: string
  /** Roundabout exit number, when the engine gives one. */
  exit?: number
  /** How to say the name aloud, when the engine offers a hint. */
  pronunciation?: string
  /** How far this step travels before the next, in meters, when the engine says. */
  length?: number
}

/**
 * What to call the road you're turning onto. A name is best; failing that a
 * road number is still something you can read off a sign; failing that, where
 * the road is signposted to.
 */
export function roadLabel(step: RawStep): string | null {
  if (step.name) return step.ref && !step.name.includes(step.ref) ? `${step.name} (${step.ref})` : step.name
  if (step.ref) return step.ref
  if (step.destinations) return `toward ${step.destinations.split(/[,;]/)[0].trim()}`
  return null
}

/**
 * Whether a maneuver is worth announcing while riding.
 *
 * Deliberately wider than `isTurn`, which answers a different question — how
 * complicated a route is to remember. A gentle bend doesn't add to that, but
 * mid-run you still want to be told which way the road forks.
 */
export function isInstruction({ type, modifier }: Maneuver): boolean {
  if (type === 'depart' || type === 'arrive' || type === 'notification') return false
  // Carrying straight on down the same road needs no instruction; every other
  // junction type does, including the slight ones.
  if (type === 'continue' || type === 'new name') {
    return modifier !== undefined && modifier !== 'straight'
  }
  return true
}

export interface RouteStep extends RawStep {
  /** Distance from the start of the route to this maneuver, in meters. */
  distanceAlong: number
}

/**
 * Place each maneuver along the route. The search only ever moves forwards, so
 * a loop passing back through its own start can't drag a late instruction back
 * to the beginning.
 */
export function placeSteps(path: LatLng[], steps: RawStep[]): RouteStep[] {
  if (path.length < 2) return steps.map((step) => ({ ...step, distanceAlong: 0 }))

  const cumulative = cumulativeDistances(path)
  // A loop ends where it began, so the opening maneuver sits exactly on the
  // closing one. Ties go to the earliest segment still ahead of the last
  // maneuver placed, which keeps the list in running order.
  const TIE_METERS = 0.5
  let from = 0

  return steps.map((step) => {
    let best = { distance: Infinity, index: from, t: 0 }
    for (let i = from; i < path.length - 1; i++) {
      const candidate = projectOntoSegment(path[i], path[i + 1], step.location)
      if (candidate.distance < best.distance - TIE_METERS) {
        best = { distance: candidate.distance, index: i, t: candidate.t }
      }
    }
    from = best.index
    const segmentLength = cumulative[best.index + 1] - cumulative[best.index]
    return { ...step, distanceAlong: cumulative[best.index] + segmentLength * best.t }
  })
}

/** The next maneuver worth announcing, given how far along the runner is. */
export function nextStep(steps: RouteStep[], distanceAlong: number): RouteStep | null {
  // A small lookback stops an instruction vanishing the instant you reach it.
  return steps.find((step) => isInstruction(step) && step.distanceAlong > distanceAlong - 8) ?? null
}

/** Degrees to swing an arrow: negative left, positive right, 180 back on yourself. */
export function turnAngle(step: Maneuver): number {
  if (step.type === 'arrive') return 0
  switch (step.modifier) {
    case 'uturn':
      return 180
    case 'sharp left':
      return -135
    case 'left':
      return -90
    case 'slight left':
      return -40
    case 'slight right':
      return 40
    case 'right':
      return 90
    case 'sharp right':
      return 135
    default:
      return 0
  }
}

const DIRECTION_WORDS: Record<string, string> = {
  'sharp left': 'Sharp left',
  left: 'Turn left',
  'slight left': 'Bear left',
  'slight right': 'Bear right',
  right: 'Turn right',
  'sharp right': 'Sharp right',
  uturn: 'Turn around',
  straight: 'Carry straight on',
}

/** What to put on the banner: "Turn left onto Mill Road". */
export function instructionFor(step: RawStep): string {
  const road = roadLabel(step)
  // "toward the station" already reads as a phrase; a name needs "onto".
  const onto = road ? (road.startsWith('toward ') ? ` ${road}` : ` onto ${road}`) : ''

  switch (step.type) {
    case 'depart':
      return road ? `Set off along ${road}` : 'Set off'
    case 'arrive':
      return 'You have arrived'
    case 'exit roundabout':
      return `Leave the roundabout${onto}`
    case 'steps':
      return `Dismount for the steps${onto}`
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return step.exit
        ? `At the roundabout, take exit ${step.exit}${onto}`
        : `At the roundabout, ${(DIRECTION_WORDS[step.modifier ?? ''] ?? 'carry on').toLowerCase()}${onto}`
    case 'fork':
      return step.modifier?.includes('left')
        ? `Keep left${onto}`
        : step.modifier?.includes('right')
          ? `Keep right${onto}`
          : `Keep going${onto}`
    case 'end of road':
      return `${DIRECTION_WORDS[step.modifier ?? ''] ?? 'Turn'} at the end${onto}`
    case 'merge':
      return `Merge${onto}`
    case 'new name':
      return `Continue${onto}`
    default:
      return `${DIRECTION_WORDS[step.modifier ?? ''] ?? 'Continue'}${onto}`
  }
}

/** "300 ft", "0.4 mi", "250 m", "1.2 km" — whichever reads naturally. */
export function distancePhrase(meters: number, unit: DistanceUnit): string {
  if (unit === 'mi') {
    const miles = metersToMiles(meters)
    // Feet up to a fifth of a mile: "0.1 mi" is too coarse to run to.
    if (miles < 0.2) return `${Math.max(10, Math.round(metersToFeet(meters) / 10) * 10)} ft`
    return `${miles.toFixed(1)} mi`
  }
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

/** The same distance, said out loud: "660 feet", "0.4 miles", "250 metres". */
export function spokenDistance(meters: number, unit: DistanceUnit): string {
  const [value, abbreviation] = distancePhrase(meters, unit).split(' ')
  const words: Record<string, string> = { ft: 'feet', mi: 'miles', m: 'metres', km: 'kilometres' }
  return `${value} ${words[abbreviation] ?? abbreviation}`
}

/** Spoken form, e.g. "In 660 feet, turn left onto Mill Road". */
export function announcementFor(step: RawStep, metersAway: number, unit: DistanceUnit): string {
  const written = instructionFor(step)
  const spokenName = step.pronunciation && step.name
  const instruction = spokenName ? written.replace(step.name!, step.pronunciation!) : written
  if (metersAway < 45) return instruction
  return `In ${spokenDistance(metersAway, unit)}, ${instruction.charAt(0).toLowerCase()}${instruction.slice(1)}`
}

/**
 * Distances at which to speak, nearest first. Each maneuver is announced at
 * most once per band, so you get a heads-up and then a final call. A bike
 * covers ground faster than a runner, so the bands sit further out.
 */
export const ANNOUNCE_BANDS = [40, 200, 600]

/** The tightest band a distance falls inside, or null if it's still too far. */
export function bandFor(metersAway: number): number | null {
  return ANNOUNCE_BANDS.find((band) => metersAway <= band) ?? null
}

/** Bearing between two fixes, for pointing the map when the device won't. */
export function headingBetween(from: LatLng, to: LatLng): number | null {
  // Below GPS noise there's no meaningful direction to report.
  if (haversine(from, to) < 3) return null
  const y = Math.sin((to.lng - from.lng) * (Math.PI / 180)) * Math.cos(to.lat * (Math.PI / 180))
  const x =
    Math.cos(from.lat * (Math.PI / 180)) * Math.sin(to.lat * (Math.PI / 180)) -
    Math.sin(from.lat * (Math.PI / 180)) * Math.cos(to.lat * (Math.PI / 180)) * Math.cos((to.lng - from.lng) * (Math.PI / 180))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
