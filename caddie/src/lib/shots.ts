/**
 * The shot log: what was hit, from where, and how far it actually went.
 *
 * A shot is opened when the player marks it and closed when they mark the
 * next one (or hole out), because that is the moment the ball's resting
 * place is known. The distance is GPS unless the player types one in.
 */
import { haversine, type LatLng } from './geo'
import type { ClubId } from './clubs'

export type Lie = 'tee' | 'fairway' | 'rough' | 'sand' | 'green'

export const LIES: Array<{ id: Lie; label: string }> = [
  { id: 'tee', label: 'Tee' },
  { id: 'fairway', label: 'Fairway' },
  { id: 'rough', label: 'Rough' },
  { id: 'sand', label: 'Sand' },
  { id: 'green', label: 'Green' },
]

export interface PlanSnapshot {
  club: ClubId
  /** A full swing, a lay-up, a pitch or a putt. Pitches don't teach distances. */
  mode: 'attack' | 'layup' | 'pitch' | 'putt'
  /** What the advisor expected the chosen club to carry, in meters. */
  expected: number
  /** How far the advisor wanted the ball to go, in meters. */
  aim: number
}

export interface Shot {
  id: string
  roundId: string
  hole: number
  /** 1-based shot number on the hole. */
  number: number
  club: ClubId
  lie: Lie
  start: LatLng
  end: LatLng | null
  /** Meters the ball travelled. Null until the shot is closed. */
  distance: number | null
  /** True when the player typed the distance rather than trusting GPS. */
  manual: boolean
  /** Meters to the hole when the shot was played. */
  toHole: number | null
  plan: PlanSnapshot | null
  timestamp: number
}

export interface Round {
  id: string
  courseName: string | null
  startedAt: number
}

let counter = 0
export function newId(prefix: string): string {
  counter++
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function shotsOnHole(shots: Shot[], roundId: string, hole: number): Shot[] {
  return shots.filter((s) => s.roundId === roundId && s.hole === hole).sort((a, b) => a.number - b.number)
}

/** The most recent shot on the hole that hasn't landed yet. */
export function openShot(shots: Shot[], roundId: string, hole: number): Shot | null {
  const onHole = shotsOnHole(shots, roundId, hole)
  const last = onHole[onHole.length - 1]
  return last && last.end === null ? last : null
}

/**
 * Record where the ball came to rest. GPS is trusted unless the player has
 * already typed a distance for this shot.
 */
export function closeShot(shot: Shot, end: LatLng): Shot {
  if (shot.manual && shot.distance !== null) return { ...shot, end }
  return { ...shot, end, distance: haversine(shot.start, end), manual: false }
}

export function setManualDistance(shot: Shot, meters: number | null): Shot {
  if (meters === null) {
    // Back to GPS, if the shot has been closed.
    return { ...shot, manual: false, distance: shot.end ? haversine(shot.start, shot.end) : null }
  }
  return { ...shot, manual: true, distance: Math.max(0, meters) }
}

/**
 * Mark a new shot from `at`. Any open shot on this hole lands here first,
 * so one tap both finishes the last shot and starts the next.
 */
export function markShot(
  shots: Shot[],
  input: { roundId: string; hole: number; club: ClubId; lie: Lie; at: LatLng; toHole: number | null; plan: PlanSnapshot | null; now?: number },
): Shot[] {
  const open = openShot(shots, input.roundId, input.hole)
  const closed = open ? shots.map((s) => (s.id === open.id ? closeShot(s, input.at) : s)) : shots
  const number = shotsOnHole(shots, input.roundId, input.hole).length + 1
  const shot: Shot = {
    id: newId('shot'),
    roundId: input.roundId,
    hole: input.hole,
    number,
    club: input.club,
    lie: input.lie,
    start: input.at,
    end: null,
    distance: null,
    manual: false,
    toHole: input.toHole,
    plan: input.plan,
    timestamp: input.now ?? Date.now(),
  }
  return [...closed, shot]
}

/** The ball is in the hole: the open shot ends at the cup. */
export function holeOut(shots: Shot[], roundId: string, hole: number, cup: LatLng): Shot[] {
  const open = openShot(shots, roundId, hole)
  if (!open) return shots
  return shots.map((s) => (s.id === open.id ? closeShot(s, cup) : s))
}

/** Remove the last shot on the hole and reopen the one before it. */
export function undoLastShot(shots: Shot[], roundId: string, hole: number): Shot[] {
  const onHole = shotsOnHole(shots, roundId, hole)
  const last = onHole[onHole.length - 1]
  if (!last) return shots
  const previous = onHole[onHole.length - 2]
  return shots
    .filter((s) => s.id !== last.id)
    .map((s) => (previous && s.id === previous.id ? { ...s, end: null, distance: s.manual ? s.distance : null } : s))
}

export function updateShot(shots: Shot[], id: string, patch: Partial<Shot>): Shot[] {
  return shots.map((s) => (s.id === id ? { ...s, ...patch } : s))
}
