import { describe, expect, it } from 'vitest'
import { countTurns, isTurn, simplicityLabel, turnDensity } from './turns'

describe('isTurn', () => {
  it('ignores setting off and finishing', () => {
    expect(isTurn({ type: 'depart', modifier: 'left' })).toBe(false)
    expect(isTurn({ type: 'arrive', modifier: 'right' })).toBe(false)
  })

  it('counts a plain left or right', () => {
    expect(isTurn({ type: 'turn', modifier: 'left' })).toBe(true)
    expect(isTurn({ type: 'turn', modifier: 'right' })).toBe(true)
  })

  it('counts sharp turns and doubling back', () => {
    expect(isTurn({ type: 'turn', modifier: 'sharp left' })).toBe(true)
    expect(isTurn({ type: 'turn', modifier: 'uturn' })).toBe(true)
  })

  it('ignores carrying straight on', () => {
    expect(isTurn({ type: 'continue', modifier: 'straight' })).toBe(false)
    expect(isTurn({ type: 'new name', modifier: 'straight' })).toBe(false)
  })

  it('ignores a gentle bend in the road', () => {
    expect(isTurn({ type: 'turn', modifier: 'slight left' })).toBe(false)
    expect(isTurn({ type: 'new name', modifier: 'slight right' })).toBe(false)
  })

  it('counts junctions that need a decision even when going straight', () => {
    expect(isTurn({ type: 'fork', modifier: 'straight' })).toBe(true)
    expect(isTurn({ type: 'roundabout', modifier: 'straight' })).toBe(true)
    expect(isTurn({ type: 'end of road', modifier: 'straight' })).toBe(true)
  })

  it('does not count a step with no modifier at all', () => {
    expect(isTurn({ type: 'continue' })).toBe(false)
  })
})

describe('countTurns', () => {
  it('counts only the decisions in a realistic step list', () => {
    const steps = [
      { type: 'depart', modifier: 'left' },
      { type: 'turn', modifier: 'right' },
      { type: 'new name', modifier: 'straight' },
      { type: 'continue', modifier: 'slight left' },
      { type: 'turn', modifier: 'left' },
      { type: 'roundabout', modifier: 'straight' },
      { type: 'arrive', modifier: 'right' },
    ]
    expect(countTurns(steps)).toBe(3)
  })

  it('is zero for an empty route', () => {
    expect(countTurns([])).toBe(0)
  })

  it('is zero for a route that never turns', () => {
    expect(countTurns([{ type: 'depart' }, { type: 'continue', modifier: 'straight' }, { type: 'arrive' }])).toBe(0)
  })
})

describe('turnDensity', () => {
  it('normalises turns against distance', () => {
    expect(turnDensity(10, 5000)).toBe(2)
  })

  it('rates a long route with the same turns as simpler', () => {
    expect(turnDensity(10, 10000)).toBeLessThan(turnDensity(10, 5000))
  })

  it('avoids dividing by zero', () => {
    expect(turnDensity(5, 0)).toBe(0)
  })
})

describe('simplicityLabel', () => {
  it('describes a long straight loop as very simple', () => {
    expect(simplicityLabel(4, 8000)).toBe('Very simple')
  })

  it('describes a turn-heavy loop as busy', () => {
    expect(simplicityLabel(60, 8000)).toBe('Busy')
  })

  it('moves through the bands as turns increase', () => {
    const labels = [4, 20, 32, 60].map((t) => simplicityLabel(t, 8000))
    expect(labels).toEqual(['Very simple', 'Simple', 'Moderate', 'Busy'])
  })
})
