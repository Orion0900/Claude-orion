import { describe, expect, it } from 'vitest'
import { chartDistance } from './clubs'
import { CHART_WEIGHT, estimateDistance, fullSwings } from './learning'
import { DEFAULT_PROFILE } from './profile'
import type { Shot } from './shots'
import { yardsToMeters } from './units'

const P = { lat: 0, lng: 0 }
function shot(club: Shot['club'], yards: number, lie: Shot['lie'] = 'fairway'): Shot {
  return {
    id: `${club}-${yards}-${Math.random()}`,
    roundId: 'r',
    hole: 1,
    number: 1,
    club,
    lie,
    start: P,
    end: P,
    distance: yardsToMeters(yards),
    manual: false,
    toHole: null,
    plan: null,
    timestamp: 0,
  }
}

describe('estimateDistance', () => {
  it('is the chart with nothing tracked', () => {
    const est = estimateDistance('7i', DEFAULT_PROFILE, [])
    expect(est?.source).toBe('chart')
    expect(est?.distance).toBe(chartDistance('intermediate', '7i'))
  })

  it('moves toward the player with each shot, and mostly there after eight', () => {
    const chart = chartDistance('intermediate', '7i') as number
    const one = estimateDistance('7i', DEFAULT_PROFILE, [shot('7i', 130)])
    expect(one?.source).toBe('blended')
    expect(one?.distance).toBeLessThan(chart)
    expect(one?.distance).toBeGreaterThan(yardsToMeters(130))
    // One shot against CHART_WEIGHT chart votes.
    expect(one?.distance).toBeCloseTo((yardsToMeters(130) + CHART_WEIGHT * chart) / (1 + CHART_WEIGHT), 6)

    const many = estimateDistance('7i', DEFAULT_PROFILE, Array.from({ length: 10 }, () => shot('7i', 130)))
    expect(many?.source).toBe('learned')
    // Ten votes for 130 against four for the chart's 145.
    expect(many?.distance).toBeCloseTo(yardsToMeters((10 * 130 + 4 * 145) / 14), 6)
  })

  it('has no number for the putter', () => {
    expect(estimateDistance('P', DEFAULT_PROFILE, [])).toBeNull()
  })
})

describe('fullSwings', () => {
  it('ignores chips, putts and open shots', () => {
    const open = { ...shot('7i', 140), distance: null }
    const samples = fullSwings([shot('7i', 140), shot('7i', 30), shot('7i', 140, 'green'), open], '7i', DEFAULT_PROFILE)
    expect(samples).toHaveLength(1)
  })
})
