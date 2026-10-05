import { describe, expect, it } from 'vitest'
import { destination } from './geo'
import { deleteShot, holeOut, markShot, normalizeRound, normalizeShots, openShot, setManualDistance, shotsOnHole, undoLastShot, type Shot } from './shots'

const TEE = { lat: 42.3601, lng: -71.0589 }
const base = { roundId: 'r1', hole: 1, lie: 'tee' as const, toHole: 380, plan: null, now: 1 }

describe('markShot', () => {
  it('opens a shot with no distance yet', () => {
    const shots = markShot([], { ...base, club: 'D', at: TEE })
    expect(shots).toHaveLength(1)
    expect(shots[0].distance).toBeNull()
    expect(openShot(shots, 'r1', 1)?.id).toBe(shots[0].id)
  })

  it('closes the previous shot where the next one is marked', () => {
    const drive = markShot([], { ...base, club: 'D', at: TEE })
    const landing = destination(TEE, 0, 220)
    const next = markShot(drive, { ...base, club: '7i', lie: 'fairway', at: landing })
    expect(next[0].distance).toBeCloseTo(220, 0)
    expect(next[0].end).toEqual(landing)
    expect(next[1].number).toBe(2)
    expect(openShot(next, 'r1', 1)?.id).toBe(next[1].id)
  })

  it('numbers shots per hole and per round', () => {
    let shots = markShot([], { ...base, club: 'D', at: TEE })
    shots = markShot(shots, { ...base, hole: 2, club: 'D', at: TEE })
    shots = markShot(shots, { ...base, roundId: 'r2', club: 'D', at: TEE })
    expect(shots.map((s) => s.number)).toEqual([1, 1, 1])
  })
})

describe('holeOut', () => {
  it('ends the open shot at the cup', () => {
    const cup = destination(TEE, 0, 12)
    const shots = holeOut(markShot([], { ...base, club: 'P', lie: 'green', at: TEE }), 'r1', 1, cup)
    expect(shots[0].distance).toBeCloseTo(12, 0)
    expect(openShot(shots, 'r1', 1)).toBeNull()
  })
})

describe('manual distance', () => {
  it('survives the shot being closed by GPS later', () => {
    let shots = markShot([], { ...base, club: 'D', at: TEE })
    shots = [setManualDistance(shots[0], 240)]
    shots = markShot(shots, { ...base, club: '7i', at: destination(TEE, 0, 100) })
    expect(shots[0].distance).toBe(240)
    expect(shots[0].manual).toBe(true)
  })

  it('goes back to GPS when cleared', () => {
    const closed: Shot = { ...markShot([], { ...base, club: 'D', at: TEE })[0], end: destination(TEE, 0, 200), distance: 240, manual: true }
    expect(setManualDistance(closed, null).distance).toBeCloseTo(200, 0)
  })
})

describe('undoLastShot', () => {
  it('removes the last shot and reopens the one before', () => {
    let shots = markShot([], { ...base, club: 'D', at: TEE })
    shots = markShot(shots, { ...base, club: '7i', at: destination(TEE, 0, 220) })
    shots = undoLastShot(shots, 'r1', 1)
    expect(shots).toHaveLength(1)
    expect(shots[0].end).toBeNull()
    expect(shots[0].distance).toBeNull()
  })
})

describe('deleteShot', () => {
  const second = destination(TEE, 0, 220)
  const third = destination(TEE, 0, 360)
  const playHole = () => {
    let shots = markShot([], { ...base, club: 'D', at: TEE })
    shots = markShot(shots, { ...base, club: '7i', lie: 'fairway', at: second })
    return markShot(shots, { ...base, club: 'P', lie: 'green', at: third })
  }

  it('renumbers the shots after a deleted one, so the next mark is not a duplicate', () => {
    const played = playHole()
    let shots = deleteShot(played, played[1].id)
    expect(shotsOnHole(shots, 'r1', 1).map((s) => s.number)).toEqual([1, 2])
    shots = markShot(shots, { ...base, club: 'P', lie: 'green', at: third })
    expect(shotsOnHole(shots, 'r1', 1).map((s) => s.number)).toEqual([1, 2, 3])
  })

  it('lands the shot before where the deleted one did', () => {
    const shots = playHole()
    const after = deleteShot(shots, shots[1].id)
    expect(after[0].end).toEqual(third)
    expect(after[0].distance).toBeCloseTo(360, 0)
  })

  it('keeps a typed distance on the shot before', () => {
    const shots = playHole()
    shots[0] = setManualDistance(shots[0], 200)
    expect(deleteShot(shots, shots[1].id)[0].distance).toBe(200)
  })

  it('reopens the shot before when the last one is deleted, like undo', () => {
    const shots = playHole()
    expect(deleteShot(shots, shots[2].id)).toEqual(undoLastShot(shots, 'r1', 1))
  })

  it('leaves other holes and unknown ids alone', () => {
    const shots = markShot(playHole(), { ...base, hole: 2, club: 'D', at: TEE })
    const after = deleteShot(shots, shots[0].id)
    expect(after.find((s) => s.hole === 2)?.number).toBe(1)
    expect(deleteShot(shots, 'nope')).toBe(shots)
  })
})

describe('normalizeShots and normalizeRound', () => {
  it('passes a good log through unchanged', () => {
    const shots = markShot([], { ...base, club: 'D', at: TEE })
    expect(normalizeShots(JSON.parse(JSON.stringify(shots)))).toEqual(shots)
  })

  it('drops broken records and fills in fields an old save lacks', () => {
    const shots = normalizeShots([
      null,
      { id: 'a' },
      { id: 'b', roundId: 'r1', hole: 1, number: 1, club: 'D', start: TEE },
      { id: 'c', roundId: 'r1', hole: 1, number: 2, club: 'D', start: { lat: 'x' } },
    ])
    expect(shots).toHaveLength(1)
    expect(shots[0]).toMatchObject({ id: 'b', end: null, distance: null, manual: false, lie: 'fairway', plan: null, toHole: null })
    expect(normalizeShots({ not: 'an array' })).toEqual([])
  })

  it('accepts a round only when it has an id', () => {
    expect(normalizeRound(null)).toBeNull()
    expect(normalizeRound({ courseName: 'x' })).toBeNull()
    expect(normalizeRound({ id: 'r1', courseName: 'Pine', startedAt: 5 })).toEqual({ id: 'r1', courseName: 'Pine', startedAt: 5 })
  })
})
