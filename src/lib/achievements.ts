/**
 * The little wins a run earns.
 *
 * Nike Run Club and Strava are built around competing with your past self:
 * a longest run, a fastest pace, a first 10K, a streak kept alive. Each is
 * worked out by comparing this run with everything before it.
 */
import { lifetimeTotals, weekStart, weekStreak, type RunRecord } from './runHistory'
import { metersToDistance, METERS_PER_MILE, type DistanceUnit } from './units'

export interface Achievement {
  id: string
  title: string
  detail: string
  emoji: string
}

/** Pace comparisons only count runs at least this long; short ones flatter. */
export const MIN_DISTANCE_FOR_PACE_RECORD = METERS_PER_MILE

const RACE_DISTANCES: Array<{ id: string; meters: number; title: string }> = [
  { id: 'first-5k', meters: 5000, title: 'First 5K' },
  { id: 'first-10k', meters: 10000, title: 'First 10K' },
  { id: 'first-half', meters: 21097.5, title: 'First half marathon' },
]

const LIFETIME_MILESTONES = [10, 25, 50, 100, 250, 500, 1000]

const pace = (r: RunRecord) => r.movingSeconds / r.distance

export function achievementsFor(run: RunRecord, previous: RunRecord[], unit: DistanceUnit, now = new Date()): Achievement[] {
  const earlier = previous.filter((r) => r.id !== run.id)
  const earned: Achievement[] = []

  if (earlier.length === 0) {
    earned.push({ id: 'first-run', emoji: '🎉', title: 'First run logged', detail: 'The first of many.' })
  }

  const race = [...RACE_DISTANCES].reverse().find(
    (d) => run.distance >= d.meters && !earlier.some((r) => r.distance >= d.meters),
  )
  if (race && earlier.length > 0) {
    earned.push({ id: race.id, emoji: '🏅', title: race.title, detail: 'A new distance under your belt.' })
  }

  if (earlier.length > 0 && run.distance > Math.max(...earlier.map((r) => r.distance))) {
    earned.push({ id: 'longest', emoji: '📏', title: 'Longest run yet', detail: 'Further than you’ve gone before.' })
  }

  const paced = earlier.filter((r) => r.distance >= MIN_DISTANCE_FOR_PACE_RECORD && r.movingSeconds > 0)
  if (run.distance >= MIN_DISTANCE_FOR_PACE_RECORD && run.movingSeconds > 0 && paced.length > 0) {
    if (pace(run) < Math.min(...paced.map(pace))) {
      earned.push({ id: 'fastest', emoji: '⚡', title: 'Fastest pace yet', detail: 'Your quickest run of a mile or more.' })
    }
  }

  const before = metersToDistance(lifetimeTotals(earlier).distance, unit)
  const after = before + metersToDistance(run.distance, unit)
  const milestone = [...LIFETIME_MILESTONES].reverse().find((m) => before < m && after >= m)
  if (milestone) {
    earned.push({
      id: `lifetime-${milestone}`,
      emoji: '🌍',
      title: `${milestone} ${unit} run`,
      detail: 'All-time distance with LoopMaker.',
    })
  }

  // A streak is news on the run that extends it: the week's first.
  const thisWeek = weekStart(now).getTime()
  const firstThisWeek = !earlier.some((r) => Date.parse(r.finishedAt) >= thisWeek)
  const streak = weekStreak([run, ...earlier], now)
  if (firstThisWeek && streak >= 2) {
    earned.push({ id: 'streak', emoji: '🔥', title: `${streak}-week streak`, detail: 'A run every week. Keep it going.' })
  }

  return earned
}
