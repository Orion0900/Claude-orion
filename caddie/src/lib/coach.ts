/**
 * Coaching that only a shot log can give: where the player's real numbers
 * disagree with what they think, and what to do about it.
 */
import { clubName, type ClubId } from './clubs'
import { clubStats, estimateDistance, LEARNED_AT } from './learning'
import type { Profile } from './profile'
import type { Shot } from './shots'
import { mean } from './stats'
import { formatDistance, formatSpread } from './units'

export interface Insight {
  kind: 'distance' | 'tendency' | 'consistency' | 'progress'
  title: string
  body: string
  club?: ClubId
}

/** A club's real carry differs from the chart by more than this fraction. */
const NOTABLE_DIFFERENCE = 0.05

export function insights(shots: Shot[], profile: Profile): Insight[] {
  const out: Insight[] = []
  const unit = profile.unit

  // 1. Clubs the player hits a different distance than the chart says.
  for (const club of profile.bag) {
    const est = estimateDistance(club, profile, shots)
    if (!est || est.count < 3) continue
    const diff = (est.distance - est.chart) / est.chart
    if (Math.abs(diff) < NOTABLE_DIFFERENCE) continue
    const direction = diff > 0 ? 'longer' : 'shorter'
    out.push({
      kind: 'distance',
      club,
      title: `${clubName(club)} goes ${formatDistance(est.distance, unit)}`,
      body: `${Math.round(Math.abs(diff) * 100)}% ${direction} than the chart, over ${est.count} shots. Already in the plan.`,
    })
  }

  // 2. Approach tendency: short or long of the number the plan called for.
  const approaches = shots.filter(
    (s) => s.plan && s.distance !== null && s.toHole !== null && s.lie !== 'green' && s.plan.aim === s.toHole,
  )
  if (approaches.length >= 5) {
    const errors = approaches.map((s) => (s.distance as number) - (s.plan as NonNullable<Shot['plan']>).aim)
    const short = errors.filter((e) => e < 0).length / errors.length
    const avg = mean(errors)
    if (short >= 0.65 && avg < -4) {
      out.push({
        kind: 'tendency',
        title: `Short on ${Math.round(short * 100)}% of approaches`,
        body: `${formatDistance(-avg, unit)} short on average. Take one more club.`,
      })
    } else if (short <= 0.35 && avg > 4) {
      out.push({
        kind: 'tendency',
        title: `Long on ${Math.round((1 - short) * 100)}% of approaches`,
        body: `${formatDistance(avg, unit)} past on average. Your numbers now say so.`,
      })
    } else {
      out.push({
        kind: 'tendency',
        title: 'Dialled in',
        body: `Within ${formatDistance(Math.abs(avg), unit)} of the plan across ${approaches.length} approaches.`,
      })
    }
  }

  // 3. A long club that scatters more than the next one down is worth for the distance it adds.
  const longClubs: ClubId[] = ['D', '3W', '5W', '4H', '4i']
  const tracked = longClubs
    .map((club) => ({ club, stats: clubStats(shots, club, profile) }))
    .filter((x): x is { club: ClubId; stats: NonNullable<ReturnType<typeof clubStats>> } => x.stats !== null && x.stats.count >= 4)
  for (let i = 0; i < tracked.length - 1; i++) {
    const a = tracked[i]
    const b = tracked[i + 1]
    const gain = a.stats.mean - b.stats.mean
    if (a.stats.stdDev > b.stats.stdDev * 1.6 && gain < a.stats.stdDev) {
      out.push({
        kind: 'consistency',
        club: a.club,
        title: `${clubName(b.club)} over ${clubName(a.club).toLowerCase()}`,
        body: `It scatters ${formatSpread(a.stats.stdDev, unit)} for ${formatDistance(Math.max(0, gain), unit)} more.`,
      })
    }
  }

  // 4. Something to say on day one.
  const tracked_total = shots.filter((s) => s.distance !== null).length
  if (tracked_total === 0) {
    out.push({
      kind: 'progress',
      title: 'Track a few shots',
      body: 'Mark each shot and the caddie learns your real numbers.',
    })
  } else if (tracked_total < 20) {
    out.push({
      kind: 'progress',
      title: `${tracked_total} shot${tracked_total === 1 ? '' : 's'} tracked`,
      body: `Three with a club and the caddie starts using yours. ${LEARNED_AT} and it trusts you.`,
    })
  }
  return out
}
