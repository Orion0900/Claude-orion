import { describe, expect, it } from 'vitest'
import { destination } from './geo'
import { holeOut, markShot, openShot, setManualDistance, undoLastShot, type Shot } from './shots'

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
