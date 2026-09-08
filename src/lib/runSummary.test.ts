import { describe, expect, it } from 'vitest'
import { buildRunSummary, MIN_DISTANCE_FOR_PACE, summaryHeadline } from './runSummary'
import { feetToMeters, milesToMeters } from './units'

const fiveMiles = milesToMeters(5)

describe('buildRunSummary', () => {
  it('measures pace from what actually happened', () => {
    const summary = buildRunSummary({
      distanceCovered: fiveMiles,
      elapsedSeconds: 45 * 60,
      routeDistance: fiveMiles,
      routeGain: feetToMeters(300),
      unit: 'mi',
    })
    expect(summary.paceSecondsPerUnit).toBeCloseTo(540, 0) // 9:00 per mile
  })

  it('measures pace per kilometre when asked in kilometres', () => {
    const summary = buildRunSummary({
      distanceCovered: 10000,
      elapsedSeconds: 50 * 60,
      routeDistance: 10000,
      routeGain: 0,
      unit: 'km',
    })
    expect(summary.paceSecondsPerUnit).toBeCloseTo(300, 0) // 5:00 per km
  })

  it('refuses to report a pace from a few steps', () => {
    const summary = buildRunSummary({
      distanceCovered: MIN_DISTANCE_FOR_PACE - 1,
      elapsedSeconds: 30,
      routeDistance: fiveMiles,
      routeGain: 0,
      unit: 'mi',
    })
    expect(summary.paceSecondsPerUnit).toBeNull()
  })

  it('counts a finished loop as complete', () => {
    const summary = buildRunSummary({
      distanceCovered: fiveMiles,
      elapsedSeconds: 2700,
      routeDistance: fiveMiles,
      routeGain: 100,
      unit: 'mi',
    })
    expect(summary.completed).toBe(true)
    expect(summaryHeadline(summary)).toBe('Run complete')
  })

  it('is honest about stopping halfway', () => {
    const summary = buildRunSummary({
      distanceCovered: fiveMiles / 2,
      elapsedSeconds: 1350,
      routeDistance: fiveMiles,
      routeGain: 100,
      unit: 'mi',
    })
    expect(summary.completed).toBe(false)
    expect(summaryHeadline(summary)).toBe('Run ended early')
  })

  it('claims only the climbing actually done', () => {
    const summary = buildRunSummary({
      distanceCovered: fiveMiles / 2,
      elapsedSeconds: 1350,
      routeDistance: fiveMiles,
      routeGain: 200,
      unit: 'mi',
    })
    expect(summary.gain).toBeCloseTo(100, 0)
  })

  it('never reports more than the whole route', () => {
    const summary = buildRunSummary({
      distanceCovered: fiveMiles * 1.4,
      elapsedSeconds: 3000,
      routeDistance: fiveMiles,
      routeGain: 200,
      unit: 'mi',
    })
    expect(summary.gain).toBeCloseTo(200, 0)
    expect(summary.completed).toBe(true)
  })

  it('copes with a zero-length route', () => {
    const summary = buildRunSummary({
      distanceCovered: 0,
      elapsedSeconds: 0,
      routeDistance: 0,
      routeGain: 0,
      unit: 'mi',
    })
    expect(summary.gain).toBe(0)
    expect(summary.paceSecondsPerUnit).toBeNull()
    expect(summary.completed).toBe(false)
  })
})
