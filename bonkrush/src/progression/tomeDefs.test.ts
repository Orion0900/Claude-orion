import { Rng } from '../core/rng'
import { CHAOS_POOL, CHAOS_TOME, TOMES, rollChaosMod, tomeMaxLevel } from './tomeDefs'

describe('TOMES', () => {
  it('has the 23 design tomes with unique ids', () => {
    expect(TOMES).toHaveLength(23)
    expect(new Set(TOMES.map((t) => t.id)).size).toBe(23)
  })

  it('gives every tome but Chaos a positive step', () => {
    for (const t of TOMES) {
      if (t.id === CHAOS_TOME) {
        expect(t.perLevel).toEqual([])
        continue
      }
      expect(t.perLevel.length).toBeGreaterThan(0)
      for (const m of t.perLevel) expect(m.value).toBeGreaterThan(0)
    }
  })

  it('caps Plenty at 10 and the rest at 99', () => {
    expect(tomeMaxLevel('quantity')).toBe(10)
    expect(tomeMaxLevel('damage')).toBe(99)
  })
})

describe('chaos', () => {
  it('never rolls difficulty or projectiles', () => {
    expect(CHAOS_POOL.some((m) => m.stat === 'difficulty' || m.stat === 'projectiles')).toBe(false)
    const rng = new Rng(4)
    for (let i = 0; i < 500; i++) {
      const m = rollChaosMod(rng)
      expect(m.stat).not.toBe('difficulty')
      expect(m.stat).not.toBe('projectiles')
    }
  })

  it('returns copies, so scaling one never edits a tome', () => {
    const rng = new Rng(9)
    const m = rollChaosMod(rng)
    m.value = 999
    expect(TOMES.flatMap((t) => t.perLevel).some((x) => x.value === 999)).toBe(false)
  })
})
