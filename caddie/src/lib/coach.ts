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
      title: `${clubName(club)}: ${formatDistance(est.distance, unit)}, not ${formatDistance(est.chart, unit)}`,
      body: `Your ${est.count} tracked shots run ${Math.round(Math.abs(diff) * 100)}% ${direction} than the ${profile.skill} chart. The advisor already plans with your number${est.source === 'learned' ? '' : ', and will trust it fully after ' + LEARNED_AT + ' shots'}.`,
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
        body: `On average ${formatDistance(-avg, unit)} short of the number. Most amateurs are: take one more club and swing smooth. The advisor now leans toward the longer club when two are close.`,
      })
    } else if (short <= 0.35 && avg > 4) {
      out.push({
        kind: 'tendency',
        title: `Long on ${Math.round((1 - short) * 100)}% of approaches`,
        body: `On average ${formatDistance(avg, unit)} past the number. Your chart is stale: the learned distances above already reflect it.`,
      })
    } else {
      out.push({
        kind: 'tendency',
        title: 'Distance control is on the number',
        body: `Across ${approaches.length} approaches you're within ${formatDistance(Math.abs(avg), unit)} of the plan on average. Nice.`,
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
        body: `${clubName(a.club)} scatters ${formatSpread(a.stats.stdDev, unit)} for only ${formatDistance(Math.max(0, gain), unit)} more than the ${clubName(b.club).toLowerCase()} (${formatSpread(b.stats.stdDev, unit)}). Off the deck the shorter club is the smarter play.`,
      })
    }
  }

  // 4. Something to say on day one.
  const tracked_total = shots.filter((s) => s.distance !== null).length
  if (tracked_total === 0) {
    out.push({
      kind: 'progress',
      title: 'Track a few shots',
      body: 'Mark each shot as you play and the caddie learns what you actually hit each club. Three shots with a club start moving its number; eight and it trusts you over the chart.',
    })
  } else if (tracked_total < 20) {
    out.push({
      kind: 'progress',
      title: `${tracked_total} shot${tracked_total === 1 ? '' : 's'} tracked`,
      body: 'Keep going. Clubs with three or more tracked shots already get their own number in the advisor.',
    })
  }
  return out
}
