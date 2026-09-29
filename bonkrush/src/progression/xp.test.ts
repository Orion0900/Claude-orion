import { gainXp, xpToNext } from './xp'

describe('xpToNext', () => {
  it('matches the design table', () => {
    expect(xpToNext(1)).toBe(14)
    expect(xpToNext(5)).toBe(47)
    expect(xpToNext(10)).toBe(103)
    expect(xpToNext(20)).toBe(268)
  })

  it('always grows', () => {
    for (let l = 1; l < 200; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l))
  })
})

describe('gainXp', () => {
  it('keeps the remainder after a level-up', () => {
    expect(gainXp(1, 10, 6)).toEqual({ level: 2, xp: 2, levelsGained: 1 })
  })

  it('crosses several levels from one big gain', () => {
    const need = xpToNext(1) + xpToNext(2) + xpToNext(3)
    const r = gainXp(1, 0, need + 1)
    expect(r.level).toBe(4)
    expect(r.levelsGained).toBe(3)
    expect(r.xp).toBeCloseTo(1)
  })

  it('ignores junk amounts', () => {
    expect(gainXp(3, 5, NaN)).toEqual({ level: 3, xp: 5, levelsGained: 0 })
    expect(gainXp(3, 5, -20)).toEqual({ level: 3, xp: 5, levelsGained: 0 })
  })
})
