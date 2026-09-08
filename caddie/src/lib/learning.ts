/**
 * What the player really hits each club, learned from the shot log.
 *
 * The stock chart for their level is the prior. Each tracked full swing is a
 * vote against it, weighted so that a handful of shots move the number a
 * little and a couple of rounds move it all the way to the truth.
 */
import { chartDistance, SPREAD_FRACTION, type ClubId } from './clubs'
import type { Profile } from './profile'
import type { Shot } from './shots'
import { stdDev, trimmedMean } from './stats'

export interface ClubStats {
  club: ClubId
  count: number
  /** Trimmed mean of tracked carries, meters. */
  mean: number
  stdDev: number
  longest: number
  shortest: number
}

export interface DistanceEstimate {
  club: ClubId
  /** Meters the advisor plans on. */
  distance: number
  /** One standard deviation of that, meters. */
  spread: number
  /** Where the number comes from: the chart, a blend, or mostly the player. */
  source: 'chart' | 'blended' | 'learned'
  count: number
  chart: number
}

/**
 * How many tracked shots it takes to count as much as the chart. Four means
 * the player's fourth shot already has them and the chart level pegging.
 */
export const CHART_WEIGHT = 4

/** From this many shots the estimate is mostly the player's own. */
export const LEARNED_AT = 8

/**
 * A recorded carry below this fraction of the stock number was a chip, a
 * punch or a topped ball, not a swing that tells us the club's distance.
 */
export const FULL_SWING_FRACTION = 0.45

/** Tracked shots that say something about how far a club goes. */
export function fullSwings(shots: Shot[], club: ClubId, profile: Profile): number[] {
  const chart = chartDistance(profile.skill, club)
  if (chart === null) return []
  return shots
    .filter((s) => s.club === club && s.distance !== null && s.lie !== 'green' && s.plan?.mode !== 'pitch')
    .map((s) => s.distance as number)
    .filter((d) => d >= chart * FULL_SWING_FRACTION && d <= chart * 1.6)
}

export function clubStats(shots: Shot[], club: ClubId, profile: Profile): ClubStats | null {
  const samples = fullSwings(shots, club, profile)
  if (samples.length === 0) return null
  return {
    club,
    count: samples.length,
    mean: trimmedMean(samples),
    stdDev: stdDev(samples),
    longest: Math.max(...samples),
    shortest: Math.min(...samples),
  }
}

export function estimateDistance(club: ClubId, profile: Profile, shots: Shot[]): DistanceEstimate | null {
  const chart = chartDistance(profile.skill, club)
  if (chart === null) return null
  const chartSpread = chart * SPREAD_FRACTION[profile.skill]
  const stats = clubStats(shots, club, profile)
  if (!stats) return { club, distance: chart, spread: chartSpread, source: 'chart', count: 0, chart }

  const n = stats.count
  const distance = (n * stats.mean + CHART_WEIGHT * chart) / (n + CHART_WEIGHT)
  // A standard deviation from two shots is noise; lean on the chart until
  // there are enough to say something.
  const spread = n >= 3 ? (n * stats.stdDev + CHART_WEIGHT * chartSpread) / (n + CHART_WEIGHT) : chartSpread
  return {
    club,
    distance,
    spread: Math.max(spread, chart * 0.03),
    source: n >= LEARNED_AT ? 'learned' : 'blended',
    count: n,
    chart,
  }
}

/** Estimates for every club in the bag except the putter, longest first. */
export function bagEstimates(profile: Profile, shots: Shot[]): DistanceEstimate[] {
  return profile.bag
    .map((club) => estimateDistance(club, profile, shots))
    .filter((e): e is DistanceEstimate => e !== null)
    .sort((a, b) => b.distance - a.distance)
}
