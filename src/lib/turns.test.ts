import { describe, expect, it } from 'vitest'
import { countDecisions, countTurns, isTurn, simplicityLabel, turnDensity } from './turns'

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
  it('leads with reassurance for a long straight loop', () => {
    expect(simplicityLabel(4, 8000)).toBe('Barely any turns')
  })

  it('is honest about a turn-heavy loop', () => {
    expect(simplicityLabel(60, 8000)).toBe('Plenty of turns')
  })

  it('moves through the bands as turns increase', () => {
    const labels = [4, 12, 24, 60].map((t) => simplicityLabel(t, 8000))
    expect(labels).toEqual(['Barely any turns', 'Easy to follow', 'A few turns', 'Plenty of turns'])
  })

  it('describes a route by how thick the turns are, not how many', () => {
    // The same twelve turns over twice the distance is an easier run to follow.
    expect(simplicityLabel(12, 8000)).not.toBe(simplicityLabel(12, 4000))
  })
})

describe('countDecisions', () => {
  const at = (distanceAlong: number, modifier: string, type = 'turn') => ({ type, modifier, distanceAlong })

  it('counts turns that stand on their own', () => {
    expect(countDecisions([at(0, 'left'), at(400, 'right'), at(900, 'left')])).toBe(3)
  })

  it('treats a kerb-to-kerb jog as one decision', () => {
    // Left then right within a few metres is crossing a street, not two turns.
    expect(countDecisions([at(500, 'left'), at(508, 'right')])).toBe(1)
  })

  it('collapses a whole cluster at one junction', () => {
    expect(countDecisions([at(500, 'left'), at(506, 'right'), at(515, 'left'), at(522, 'right')])).toBe(1)
  })

  it('keeps turns that are genuinely separate', () => {
    expect(countDecisions([at(500, 'left'), at(560, 'right')])).toBe(2)
  })

  it('measures each gap from the last counted turn, so a long zigzag cannot vanish', () => {
    // Turns every 20 m across 60 m of road are not one junction. Measuring from
    // the last counted turn keeps a drifting chain from collapsing to a single
    // decision however long it runs.
    const chain = [at(0, 'left'), at(20, 'right'), at(40, 'left'), at(60, 'right')]
    expect(countDecisions(chain)).toBe(2)

    const longer = Array.from({ length: 20 }, (_, i) => at(i * 20, i % 2 ? 'right' : 'left'))
    expect(countDecisions(longer)).toBeGreaterThan(2)
  })

  it('still ignores maneuvers that were never turns', () => {
    expect(countDecisions([at(0, 'straight', 'continue'), at(400, 'straight', 'new name')])).toBe(0)
  })

  it('counts a roundabout as a decision even carrying straight through', () => {
    expect(countDecisions([at(300, 'straight', 'roundabout')])).toBe(1)
  })

  it('honours a custom merge distance', () => {
    expect(countDecisions([at(0, 'left'), at(50, 'right')], 60)).toBe(1)
    expect(countDecisions([at(0, 'left'), at(50, 'right')], 20)).toBe(2)
  })

  it('is zero for a route with nothing to decide', () => {
    expect(countDecisions([])).toBe(0)
  })

  it('reports fewer turns than the raw count on a jog-heavy route', () => {
    const jogs = [
      at(200, 'left'), at(207, 'right'),
      at(900, 'right'), at(910, 'left'),
      at(1600, 'left'), at(1608, 'right'),
    ]
    expect(countTurns(jogs)).toBe(6)
    expect(countDecisions(jogs)).toBe(3)
  })
})
