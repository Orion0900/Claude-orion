import { describe, expect, it } from 'vitest'
import { buildRideSummary, MIN_DISTANCE_FOR_SPEED, summaryHeadline } from './rideSummary'

describe('buildRideSummary', () => {
  it('measures average speed from distance and time', () => {
    const summary = buildRideSummary({
      distanceCovered: 9000,
      elapsedSeconds: 1800,
      routeDistance: 9000,
      routeGain: 50,
      unit: 'km',
    })
    expect(summary.averageSpeed).toBeCloseTo(18, 5)
    expect(summary.completed).toBe(true)
    expect(summaryHeadline(summary)).toBe('You made it')
  })

  it('withholds a speed for a ride too short to measure', () => {
    const summary = buildRideSummary({
      distanceCovered: MIN_DISTANCE_FOR_SPEED - 1,
      elapsedSeconds: 60,
      routeDistance: 9000,
      routeGain: 50,
      unit: 'km',
    })
    expect(summary.averageSpeed).toBeNull()
    expect(summary.completed).toBe(false)
    expect(summaryHeadline(summary)).toBe('Ride ended early')
  })

  it('apportions climbing to the part actually ridden', () => {
    const summary = buildRideSummary({
      distanceCovered: 4500,
      elapsedSeconds: 900,
      routeDistance: 9000,
      routeGain: 100,
      unit: 'mi',
    })
    expect(summary.gain).toBeCloseTo(50)
  })
})
