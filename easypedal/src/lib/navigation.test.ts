import { describe, expect, it } from 'vitest'
import { destination, type LatLng } from './geo'
import {
  announcementFor,
  bandFor,
  distancePhrase,
  headingBetween,
  instructionFor,
  isInstruction,
  nextStep,
  placeSteps,
  roadLabel,
  turnAngle,
  type RawStep,
} from './navigation'
import { isTurn } from './turns'

const start: LatLng = { lat: 42.3601, lng: -71.0589 }

/** 1 km square loop, a point every 40 m. */
function squareLoop(): LatLng[] {
  const path: LatLng[] = []
  let corner = start
  for (const bearing of [0, 90, 180, 270]) {
    for (let d = 0; d < 250; d += 40) path.push(destination(corner, bearing, d))
    corner = destination(corner, bearing, 250)
  }
  path.push(start)
  return path
}

describe('placeSteps', () => {
  const path = squareLoop()
  const corners = [
    start,
    destination(start, 0, 250),
    destination(destination(start, 0, 250), 90, 250),
    destination(destination(destination(start, 0, 250), 90, 250), 180, 250),
    start,
  ]
  const steps: RawStep[] = [
    { type: 'depart', location: corners[0], name: 'Home Street' },
    { type: 'turn', modifier: 'right', location: corners[1], name: 'North Road' },
    { type: 'turn', modifier: 'right', location: corners[2], name: 'East Lane' },
    { type: 'turn', modifier: 'right', location: corners[3], name: 'South Way' },
    { type: 'arrive', location: corners[4] },
  ]

  it('places each maneuver at its distance along the route', () => {
    const placed = placeSteps(path, steps)
    expect(placed[0].distanceAlong).toBeCloseTo(0, -1)
    expect(placed[1].distanceAlong).toBeCloseTo(250, -1)
    expect(placed[2].distanceAlong).toBeCloseTo(500, -1)
    expect(placed[3].distanceAlong).toBeCloseTo(750, -1)
  })

  it('keeps maneuvers in order', () => {
    const placed = placeSteps(path, steps)
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i].distanceAlong).toBeGreaterThanOrEqual(placed[i - 1].distanceAlong)
    }
  })

  it('does not drag the final maneuver back to the start of a loop', () => {
    // 'arrive' sits exactly on the start point; naively it would measure zero.
    const placed = placeSteps(path, steps)
    expect(placed[4].distanceAlong).toBeGreaterThan(900)
  })

  it('preserves every field it was given', () => {
    const placed = placeSteps(path, steps)
    expect(placed[1].name).toBe('North Road')
    expect(placed[1].modifier).toBe('right')
  })

  it('copes with a degenerate route', () => {
    expect(placeSteps([start], steps)[0].distanceAlong).toBe(0)
  })
})

describe('nextStep', () => {
  const path = squareLoop()
  const steps = placeSteps(path, [
    { type: 'depart', location: start },
    { type: 'turn', modifier: 'right', location: destination(start, 0, 250), name: 'North Road' },
    { type: 'turn', modifier: 'right', location: destination(destination(start, 0, 250), 90, 250), name: 'East Lane' },
    { type: 'arrive', location: start },
  ])

  it('points at the first turn from the start line', () => {
    expect(nextStep(steps, 0)?.name).toBe('North Road')
  })

  it('moves on once a turn is behind you', () => {
    expect(nextStep(steps, 300)?.name).toBe('East Lane')
  })

  it('skips departing, which is not a turn', () => {
    expect(nextStep(steps, 0)?.type).not.toBe('depart')
  })

  it('holds an instruction briefly as you pass it, rather than blinking away', () => {
    expect(nextStep(steps, 252)?.name).toBe('North Road')
  })

  it('returns nothing once every turn is done', () => {
    expect(nextStep(steps, 999)).toBeNull()
  })
})

describe('turnAngle', () => {
  it('swings left negative and right positive', () => {
    expect(turnAngle({ type: 'turn', modifier: 'left' })).toBeLessThan(0)
    expect(turnAngle({ type: 'turn', modifier: 'right' })).toBeGreaterThan(0)
  })

  it('grades slight, normal and sharp', () => {
    const slight = Math.abs(turnAngle({ type: 'turn', modifier: 'slight left' }))
    const normal = Math.abs(turnAngle({ type: 'turn', modifier: 'left' }))
    const sharp = Math.abs(turnAngle({ type: 'turn', modifier: 'sharp left' }))
    expect(slight).toBeLessThan(normal)
    expect(normal).toBeLessThan(sharp)
  })

  it('turns a u-turn right around', () => {
    expect(turnAngle({ type: 'turn', modifier: 'uturn' })).toBe(180)
  })

  it('points straight ahead when there is nothing to do', () => {
    expect(turnAngle({ type: 'continue', modifier: 'straight' })).toBe(0)
    expect(turnAngle({ type: 'arrive' })).toBe(0)
  })
})

describe('instructionFor', () => {
  it('names the road you turn onto', () => {
    expect(instructionFor({ type: 'turn', modifier: 'left', location: start, name: 'Mill Road' })).toBe(
      'Turn left onto Mill Road',
    )
  })

  it('copes with an unnamed road', () => {
    expect(instructionFor({ type: 'turn', modifier: 'right', location: start })).toBe('Turn right')
  })

  it('speaks plainly about slight turns', () => {
    expect(instructionFor({ type: 'turn', modifier: 'slight left', location: start })).toBe('Bear left')
  })

  it('counts roundabout exits when it knows them', () => {
    expect(
      instructionFor({ type: 'roundabout', modifier: 'right', location: start, exit: 2, name: 'Park Way' }),
    ).toBe('At the roundabout, take exit 2 onto Park Way')
  })

  it('handles forks and ends of road', () => {
    expect(instructionFor({ type: 'fork', modifier: 'slight left', location: start })).toBe('Keep left')
    expect(instructionFor({ type: 'end of road', modifier: 'left', location: start, name: 'High St' })).toBe(
      'Turn left at the end onto High St',
    )
  })

  it('opens and closes the ride in plain words', () => {
    expect(instructionFor({ type: 'depart', location: start, name: 'Home St' })).toBe('Set off along Home St')
    expect(instructionFor({ type: 'arrive', location: start })).toContain('arrived')
  })
})

describe('distancePhrase', () => {
  it('uses feet for short distances in miles', () => {
    expect(distancePhrase(60, 'mi')).toBe('200 ft')
  })

  it('keeps using feet up to a fifth of a mile, which "0.1 mi" is too coarse for', () => {
    expect(distancePhrase(200, 'mi')).toBe('660 ft')
  })

  it('switches to miles further out', () => {
    expect(distancePhrase(800, 'mi')).toBe('0.5 mi')
  })

  it('uses metres then kilometres', () => {
    expect(distancePhrase(250, 'km')).toBe('250 m')
    expect(distancePhrase(1600, 'km')).toBe('1.6 km')
  })

  it('never announces a distance of zero', () => {
    expect(distancePhrase(1, 'mi')).toBe('10 ft')
    expect(distancePhrase(1, 'km')).toBe('10 m')
  })
})

describe('announcementFor', () => {
  const step: RawStep = { type: 'turn', modifier: 'left', location: start, name: 'Mill Road' }

  it('leads with the distance', () => {
    expect(announcementFor(step, 200, 'mi')).toBe('In 660 feet, turn left onto Mill Road')
  })

  it('drops the distance at the turn itself', () => {
    expect(announcementFor(step, 10, 'mi')).toBe('Turn left onto Mill Road')
  })

  it('speaks metric units in full', () => {
    expect(announcementFor(step, 300, 'km')).toContain('300 metres')
  })
})

describe('bandFor', () => {
  it('returns the tightest band the distance falls inside', () => {
    expect(bandFor(700)).toBeNull()
    expect(bandFor(590)).toBe(600)
    expect(bandFor(190)).toBe(200)
    expect(bandFor(20)).toBe(40)
  })
})

describe('headingBetween', () => {
  it('reads north, east, south and west', () => {
    expect(headingBetween(start, destination(start, 0, 50))).toBeCloseTo(0, 0)
    expect(headingBetween(start, destination(start, 90, 50))).toBeCloseTo(90, 0)
    expect(headingBetween(start, destination(start, 180, 50))).toBeCloseTo(180, 0)
    expect(headingBetween(start, destination(start, 270, 50))).toBeCloseTo(270, 0)
  })

  it('reports nothing when the movement is just GPS jitter', () => {
    expect(headingBetween(start, destination(start, 45, 1))).toBeNull()
  })
})

describe('roadLabel', () => {
  const at = { location: start }

  it('prefers the street name', () => {
    expect(roadLabel({ ...at, type: 'turn', name: 'Mill Road' })).toBe('Mill Road')
  })

  it('adds the road number when the name does not already carry it', () => {
    expect(roadLabel({ ...at, type: 'turn', name: 'London Road', ref: 'A21' })).toBe('London Road (A21)')
  })

  it('does not repeat a number already in the name', () => {
    expect(roadLabel({ ...at, type: 'turn', name: 'A21', ref: 'A21' })).toBe('A21')
  })

  it('falls back to the road number alone', () => {
    expect(roadLabel({ ...at, type: 'turn', ref: 'B2100' })).toBe('B2100')
  })

  it('falls back to where the road is signposted to', () => {
    expect(roadLabel({ ...at, type: 'turn', destinations: 'Town Centre, Station' })).toBe('toward Town Centre')
  })

  it('gives nothing for a genuinely unnamed path', () => {
    expect(roadLabel({ ...at, type: 'turn' })).toBeNull()
  })
})

describe('isInstruction', () => {
  it('announces slight turns, which the turn count deliberately ignores', () => {
    expect(isInstruction({ type: 'turn', modifier: 'slight left' })).toBe(true)
    expect(isTurn({ type: 'turn', modifier: 'slight left' })).toBe(false)
  })

  it('announces ordinary and sharp turns', () => {
    expect(isInstruction({ type: 'turn', modifier: 'left' })).toBe(true)
    expect(isInstruction({ type: 'turn', modifier: 'sharp right' })).toBe(true)
  })

  it('announces forks and roundabouts', () => {
    expect(isInstruction({ type: 'fork', modifier: 'slight right' })).toBe(true)
    expect(isInstruction({ type: 'roundabout', modifier: 'straight' })).toBe(true)
  })

  it('stays quiet when carrying straight on', () => {
    expect(isInstruction({ type: 'continue', modifier: 'straight' })).toBe(false)
    expect(isInstruction({ type: 'new name', modifier: 'straight' })).toBe(false)
  })

  it('stays quiet about setting off and finishing', () => {
    expect(isInstruction({ type: 'depart', modifier: 'left' })).toBe(false)
    expect(isInstruction({ type: 'arrive' })).toBe(false)
  })
})

describe('naming the road in instructions', () => {
  const at = { location: start }

  it('names the street you turn onto', () => {
    expect(instructionFor({ ...at, type: 'turn', modifier: 'left', name: 'Mill Road' })).toBe(
      'Turn left onto Mill Road',
    )
  })

  it('names a road that only has a number', () => {
    expect(instructionFor({ ...at, type: 'turn', modifier: 'right', ref: 'A21' })).toBe('Turn right onto A21')
  })

  it('reads a signposted destination as a phrase, not as a street', () => {
    expect(instructionFor({ ...at, type: 'turn', modifier: 'left', destinations: 'Town Centre' })).toBe(
      'Turn left toward Town Centre',
    )
  })

  it('names the road on a slight turn too', () => {
    expect(instructionFor({ ...at, type: 'turn', modifier: 'slight left', name: 'Oak Avenue' })).toBe(
      'Bear left onto Oak Avenue',
    )
  })

  it('still works where the path genuinely has no name', () => {
    expect(instructionFor({ ...at, type: 'turn', modifier: 'left' })).toBe('Turn left')
  })

  it('surfaces a slight turn as the next instruction', () => {
    const path = squareLoop()
    const steps = placeSteps(path, [
      { type: 'depart', location: start },
      { type: 'turn', modifier: 'slight left', location: destination(start, 0, 120), name: 'Oak Avenue' },
      { type: 'turn', modifier: 'right', location: destination(start, 0, 240), name: 'Mill Road' },
      { type: 'arrive', location: start },
    ])
    expect(nextStep(steps, 0)?.name).toBe('Oak Avenue')
  })

  it('says a name aloud using the engine pronunciation when given', () => {
    const spoken = announcementFor(
      { ...at, type: 'turn', modifier: 'left', name: 'Beaulieu Road', pronunciation: 'Byoo-lee Road' },
      200,
      'mi',
    )
    expect(spoken).toContain('Byoo-lee Road')
  })
})
