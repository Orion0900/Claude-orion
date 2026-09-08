/**
 * The caddie: given where the ball is and where the hole is, what to hit.
 *
 * Every candidate club is judged on two things — how close its expected
 * carry lands to where we want the ball, and the odds of finding a hazard
 * on the way — and the player's aggressiveness sets how much of the second
 * they'll accept.
 */
import { clubById, clubName, type ClubId } from './clubs'
import { bagEstimates, type DistanceEstimate } from './learning'
import type { Aggressiveness, Profile } from './profile'
import type { Lie, Shot } from './shots'
import { probabilityBetween } from './stats'
import { formatDistance, formatSpread, type Unit } from './units'

export type HazardKind = 'water' | 'bunker'

/** A hazard the line to the hole crosses, as meters from the ball. */
export interface HazardInterval {
  kind: HazardKind
  from: number
  to: number
}

export interface Situation {
  /** Meters to the target (the pin, or the middle of the green). */
  distance: number
  lie: Lie
  hazards: HazardInterval[]
  /** Meters to the front and back edges of the green, when the outline is known. */
  green: { front: number; back: number } | null
}

export type ShotMode = 'putt' | 'attack' | 'layup' | 'pitch'

export interface Advice {
  club: ClubId
  mode: ShotMode
  /** What the club should carry, meters. */
  expected: number
  spread: number
  /** Where we want the ball to land, meters from the player. */
  aim: number
  /** Probability the shot lands in a hazard, 0–1. */
  risk: number
  /** Probability the shot finishes on the green (attack only). */
  greenOdds: number | null
  longer: ClubId | null
  shorter: ClubId | null
  notes: string[]
  estimate: DistanceEstimate | null
}

/** How much hazard risk each mindset lives with. */
export const RISK_TOLERANCE: Record<Aggressiveness, number> = {
  conservative: 0.06,
  balanced: 0.15,
  aggressive: 0.3,
}

/** Distance and spread multipliers for hitting out of each lie. */
const LIE_EFFECT: Record<Lie, { distance: number; spread: number }> = {
  tee: { distance: 1.02, spread: 1 },
  fairway: { distance: 1, spread: 1 },
  rough: { distance: 0.93, spread: 1.3 },
  sand: { distance: 0.88, spread: 1.45 },
  green: { distance: 1, spread: 1 },
}

/** Clubs that can't be hit from a lie, whatever the yardage says. */
function playable(club: ClubId, lie: Lie): boolean {
  const kind = clubById(club).kind
  if (lie === 'sand') return kind !== 'wood' && club !== '4H' && club !== '4i'
  if (lie === 'rough') return club !== 'D'
  if (lie === 'fairway') return club !== 'D'
  return true
}

interface Candidate {
  estimate: DistanceEstimate
  expected: number
  spread: number
  risk: number
}

function hazardRisk(expected: number, spread: number, hazards: HazardInterval[]): number {
  let risk = 0
  for (const h of hazards) risk += probabilityBetween(expected, spread, h.from, h.to)
  return Math.min(1, risk)
}

function candidates(situation: Situation, profile: Profile, shots: Shot[]): Candidate[] {
  const lie = LIE_EFFECT[situation.lie]
  return bagEstimates(profile, shots)
    .filter((e) => playable(e.club, situation.lie))
    .map((estimate) => {
      const expected = estimate.distance * lie.distance
      const spread = estimate.spread * lie.spread
      return { estimate, expected, spread, risk: hazardRisk(expected, spread, situation.hazards) }
    })
}

function neighbours(all: Candidate[], chosen: Candidate): { longer: ClubId | null; shorter: ClubId | null } {
  const sorted = [...all].sort((a, b) => b.expected - a.expected)
  const i = sorted.findIndex((c) => c.estimate.club === chosen.estimate.club)
  return {
    longer: i > 0 ? sorted[i - 1].estimate.club : null,
    shorter: i >= 0 && i < sorted.length - 1 ? sorted[i + 1].estimate.club : null,
  }
}

function describeHazard(h: HazardInterval, unit: Unit): string {
  const name = h.kind === 'water' ? 'Water' : 'Sand'
  return `${name} from ${formatDistance(h.from, unit)} to ${formatDistance(h.to, unit)}`
}

export function advise(situation: Situation, profile: Profile, shots: Shot[]): Advice {
  const unit = profile.unit
  const notes: string[] = []

  if (situation.lie === 'green') {
    return {
      club: 'P',
      mode: 'putt',
      expected: situation.distance,
      spread: 0,
      aim: situation.distance,
      risk: 0,
      greenOdds: null,
      longer: null,
      shorter: null,
      notes: [
        situation.distance > 9
          ? 'Lag it: the first putt only has to leave a tap-in.'
          : 'Pick a line and hit it firm enough to hold it.',
      ],
      estimate: null,
    }
  }

  const all = candidates(situation, profile, shots)
  if (all.length === 0) {
    return {
      club: 'PW',
      mode: 'attack',
      expected: 0,
      spread: 0,
      aim: situation.distance,
      risk: 0,
      greenOdds: null,
      longer: null,
      shorter: null,
      notes: ['Add some clubs to your bag in Settings.'],
      estimate: null,
    }
  }

  // Inside a full wedge: a pitch or a chip with the most lofted club.
  const shortest = all.reduce((a, b) => (a.expected < b.expected ? a : b))
  if (situation.distance < shortest.expected * 0.8) {
    const lofted = (['LW', 'SW', 'GW', 'PW'] as ClubId[]).find((id) => profile.bag.includes(id)) ?? shortest.estimate.club
    const chip = situation.distance < 30
    const inSand = situation.lie === 'sand'
    return {
      club: inSand ? (profile.bag.includes('SW') ? 'SW' : lofted) : lofted,
      mode: 'pitch',
      expected: situation.distance,
      spread: situation.distance * 0.15,
      aim: situation.distance,
      risk: hazardRisk(situation.distance, situation.distance * 0.15, situation.hazards),
      greenOdds: null,
      longer: null,
      shorter: null,
      notes: [
        inSand
          ? `Greenside bunker: open the face, hit the sand ${unit === 'yd' ? 'an inch or two' : 'a few centimetres'} behind the ball, and swing through.`
          : chip
            ? `A chip from ${formatDistance(situation.distance, unit)}: land it on the green and let it run to the hole.`
            : `A pitch from ${formatDistance(situation.distance, unit)}: pick a landing spot a few paces short of the flag and swing to it, not at the ball.`,
        ...(profile.aggressiveness === 'conservative' ? ['Take the flag out of it: anywhere on the green is the win here.'] : []),
        'Partial shots aren\'t used to learn your full-swing distances.',
      ],
      estimate: null,
    }
  }

  const tolerance = RISK_TOLERANCE[profile.aggressiveness]
  const longest = all.reduce((a, b) => (a.expected > b.expected ? a : b))
  const stretch = profile.aggressiveness === 'aggressive' ? longest.spread : profile.aggressiveness === 'balanced' ? longest.spread * 0.4 : 0
  const reachable = situation.distance <= longest.expected + stretch

  if (situation.lie === 'rough') notes.push('Out of the rough the ball comes off with less spin: expect about 7% less and a bigger miss.')
  if (situation.lie === 'sand') notes.push('Fairway bunker: ball first, take one more club, and just get out if the lip is high.')

  if (reachable) {
    // Where to land it: the flag, or the middle of the green for a safe play.
    const aim =
      profile.aggressiveness === 'conservative' && situation.green
        ? (situation.green.front + situation.green.back) / 2
        : situation.distance
    if (aim !== situation.distance) notes.push('Aiming at the middle of the green, not the flag.')

    // Only clubs that can actually hit the number are attack candidates: a
    // club that clears the water by flying the green isn't an attack.
    const inRange = all.filter((c) => Math.abs(c.expected - aim) <= c.spread)
    const scored = (inRange.length > 0 ? inRange : all).map((c) => {
      const miss = Math.abs(c.expected - aim)
      // Amateurs come up short far more often than long, so when two clubs
      // are close the bolder mindsets nudge toward the longer one. Playing
      // safe, long is the worse miss: over the back is where the trouble is.
      const nudge =
        profile.aggressiveness === 'conservative'
          ? c.expected > aim
            ? c.spread * 0.15
            : 0
          : c.expected < aim
            ? c.spread * 0.15
            : 0
      return { c, score: miss + nudge + (c.risk > tolerance ? 1e6 : c.risk * 60) }
    })
    scored.sort((a, b) => a.score - b.score)
    const best = scored[0].c

    if (best.risk <= tolerance) {
      const { longer, shorter } = neighbours(all, best)
      const greenOdds = situation.green
        ? probabilityBetween(best.expected, best.spread, situation.green.front, situation.green.back)
        : null
      notes.unshift(
        `${clubName(best.estimate.club)} carries ${formatDistance(best.expected, unit)} ${formatSpread(best.spread, unit)} for you; the target is ${formatDistance(aim, unit)}.`,
      )
      if (best.estimate.source !== 'chart') {
        notes.push(
          `That number comes from ${best.estimate.count} tracked ${clubName(best.estimate.club).toLowerCase()} shot${best.estimate.count === 1 ? '' : 's'}, not the stock chart (${formatDistance(best.estimate.chart, unit)}).`,
        )
      }
      const crossed = situation.hazards.filter((h) => h.to < best.expected)
      if (crossed.length > 0) {
        const worst = crossed.reduce((a, b) => (a.to > b.to ? a : b))
        const carryOdds = 1 - probabilityBetween(best.expected, best.spread, -Infinity, worst.to)
        notes.push(`${describeHazard(worst, unit)}; this club carries it ${Math.round(carryOdds * 100)}% of the time.`)
      }
      if (greenOdds !== null && greenOdds < 0.5 && profile.aggressiveness !== 'aggressive') {
        notes.push('A pitch short of the green beats a bunker long; take the safe miss.')
      }
      if (best.expected < aim - best.spread * 0.5 && longer) {
        notes.push(`Short of the number: a smooth ${clubName(longer).toLowerCase()} is the other play.`)
      }
      return {
        club: best.estimate.club,
        mode: 'attack',
        expected: best.expected,
        spread: best.spread,
        aim,
        risk: best.risk,
        greenOdds,
        longer,
        shorter,
        notes,
        estimate: best.estimate,
      }
    }

    const blocking = situation.hazards.filter((h) => probabilityBetween(best.expected, best.spread, h.from, h.to) > 0.02)
    notes.push(
      `${blocking.map((h) => describeHazard(h, unit)).join('; ')}: the club that reaches finds it ${Math.round(best.risk * 100)}% of the time. Laying up.`,
    )
  }

  // Lay-up: as far as the mindset allows, short of trouble, leaving a shot
  // the player likes.
  const wedge = all.find((c) => c.estimate.club === 'PW') ?? all.find((c) => c.estimate.club === '9i') ?? all[all.length - 1]
  const comfortable = wedge.expected
  const safe = all.filter((c) => c.risk <= tolerance && c.expected <= situation.distance)
  const pool = safe.length > 0 ? safe : all
  if (safe.length === 0) notes.push('Nothing in the bag misses the trouble outright; the club with the lowest odds of finding it is below.')

  const pick = (() => {
    switch (profile.aggressiveness) {
      case 'aggressive':
        return pool.reduce((a, b) => (b.expected > a.expected ? b : a))
      case 'conservative':
        return pool.reduce((a, b) =>
          Math.abs(situation.distance - b.expected - comfortable) < Math.abs(situation.distance - a.expected - comfortable) ? b : a,
        )
      case 'balanced': {
        // Longest club that doesn't leave a half-swing pitch.
        const awkward = (c: Candidate) => {
          const left = situation.distance - c.expected
          return left > 15 && left < comfortable * 0.6
        }
        const fine = pool.filter((c) => !awkward(c))
        return (fine.length > 0 ? fine : pool).reduce((a, b) => (b.expected > a.expected ? b : a))
      }
    }
  })()
  if (safe.length === 0) {
    const least = all.reduce((a, b) => (b.risk < a.risk ? b : a))
    return finishLayup(least, all, situation, profile, notes)
  }
  return finishLayup(pick, all, situation, profile, notes)
}

function finishLayup(pick: Candidate, all: Candidate[], situation: Situation, profile: Profile, notes: string[]): Advice {
  const unit = profile.unit
  const left = Math.max(0, situation.distance - pick.expected)
  const { longer, shorter } = neighbours(all, pick)
  const reachNote =
    situation.distance > pick.expected + pick.spread
      ? `${clubName(pick.estimate.club)} to ${formatDistance(pick.expected, unit)} leaves ${formatDistance(left, unit)} in.`
      : `${clubName(pick.estimate.club)} gets it close to the green without flirting with the trouble.`
  notes.unshift(reachNote)
  if (pick.estimate.source !== 'chart') {
    notes.push(`Planned on your ${pick.estimate.count} tracked ${clubName(pick.estimate.club).toLowerCase()} shots.`)
  }
  if (profile.aggressiveness === 'conservative') notes.push('Playing to a full-wedge number: the shot you hit best.')
  return {
    club: pick.estimate.club,
    mode: 'layup',
    expected: pick.expected,
    spread: pick.spread,
    aim: pick.expected,
    risk: pick.risk,
    greenOdds: null,
    longer,
    shorter,
    notes,
    estimate: pick.estimate,
  }
}
