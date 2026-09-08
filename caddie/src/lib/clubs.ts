/**
 * The bag, and what a typical player at each level carries each club.
 *
 * The chart is a starting point, nothing more. The moment a golfer tracks a
 * few shots, `learning.ts` blends their real numbers in and these fade out.
 */
import { yardsToMeters } from './units'

export type ClubId =
  | 'D'
  | '3W'
  | '5W'
  | '4H'
  | '4i'
  | '5i'
  | '6i'
  | '7i'
  | '8i'
  | '9i'
  | 'PW'
  | 'GW'
  | 'SW'
  | 'LW'
  | 'P'

export type ClubKind = 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter'

export interface Club {
  id: ClubId
  name: string
  kind: ClubKind
}

/** Longest to shortest, which is the order every decision below walks them in. */
export const CLUBS: Club[] = [
  { id: 'D', name: 'Driver', kind: 'wood' },
  { id: '3W', name: '3 wood', kind: 'wood' },
  { id: '5W', name: '5 wood', kind: 'wood' },
  { id: '4H', name: '4 hybrid', kind: 'hybrid' },
  { id: '4i', name: '4 iron', kind: 'iron' },
  { id: '5i', name: '5 iron', kind: 'iron' },
  { id: '6i', name: '6 iron', kind: 'iron' },
  { id: '7i', name: '7 iron', kind: 'iron' },
  { id: '8i', name: '8 iron', kind: 'iron' },
  { id: '9i', name: '9 iron', kind: 'iron' },
  { id: 'PW', name: 'Pitching wedge', kind: 'wedge' },
  { id: 'GW', name: 'Gap wedge', kind: 'wedge' },
  { id: 'SW', name: 'Sand wedge', kind: 'wedge' },
  { id: 'LW', name: 'Lob wedge', kind: 'wedge' },
  { id: 'P', name: 'Putter', kind: 'putter' },
]

const BY_ID = new Map(CLUBS.map((club) => [club.id, club]))

export function clubById(id: ClubId): Club {
  const club = BY_ID.get(id)
  if (!club) throw new Error(`Unknown club ${id}`)
  return club
}

export function clubName(id: ClubId): string {
  return clubById(id).name
}

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'scratch'

export const SKILL_LEVELS: Array<{ id: SkillLevel; label: string; hint: string }> = [
  { id: 'beginner', label: 'Beginner', hint: 'Breaking 100 is the goal' },
  { id: 'intermediate', label: 'Intermediate', hint: 'Bogey golf, low 90s' },
  { id: 'advanced', label: 'Advanced', hint: 'Single-digit handicap' },
  { id: 'scratch', label: 'Scratch', hint: 'Par is the expectation' },
]

type Chart = Record<Exclude<ClubId, 'P'>, number>

/** Typical full-swing carry, in yards, by level. Converted to meters below. */
const CHART_YARDS: Record<SkillLevel, Chart> = {
  beginner: { D: 200, '3W': 180, '5W': 170, '4H': 160, '4i': 150, '5i': 145, '6i': 135, '7i': 125, '8i': 115, '9i': 105, PW: 95, GW: 82, SW: 68, LW: 52 },
  intermediate: { D: 230, '3W': 210, '5W': 195, '4H': 185, '4i': 175, '5i': 165, '6i': 155, '7i': 145, '8i': 135, '9i': 125, PW: 112, GW: 100, SW: 85, LW: 65 },
  advanced: { D: 250, '3W': 230, '5W': 215, '4H': 205, '4i': 195, '5i': 185, '6i': 175, '7i': 163, '8i': 152, '9i': 140, PW: 128, GW: 115, SW: 100, LW: 80 },
  scratch: { D: 270, '3W': 245, '5W': 230, '4H': 220, '4i': 210, '5i': 200, '6i': 188, '7i': 176, '8i': 164, '9i': 152, PW: 138, GW: 125, SW: 108, LW: 88 },
}

/**
 * How much a full swing scatters in distance, as a fraction of the carry.
 * A beginner's 7-iron might go anywhere in a 30-yard window; a scratch
 * player's lands within a few yards of the number most of the time.
 */
export const SPREAD_FRACTION: Record<SkillLevel, number> = {
  beginner: 0.12,
  intermediate: 0.09,
  advanced: 0.065,
  scratch: 0.045,
}

/** Stock carry for a club at a level, in meters. Null for the putter. */
export function chartDistance(skill: SkillLevel, club: ClubId): number | null {
  if (club === 'P') return null
  return yardsToMeters(CHART_YARDS[skill][club])
}

/**
 * What a player at each level usually carries. Long irons are hard to hit,
 * so the beginner's bag swaps them for a hybrid and a second wood.
 */
export function defaultBag(skill: SkillLevel): ClubId[] {
  switch (skill) {
    case 'beginner':
      return ['D', '3W', '5W', '4H', '6i', '7i', '8i', '9i', 'PW', 'SW', 'P']
    case 'intermediate':
      return ['D', '3W', '5W', '4H', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'P']
    case 'advanced':
    case 'scratch':
      return ['D', '3W', '4H', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW', 'P']
  }
}
