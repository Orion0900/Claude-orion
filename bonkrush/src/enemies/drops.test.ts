import { Rng } from '../core/rng'
import { ENEMIES } from './enemyDefs'
import { emptyDrops, pieceCount, rollDrops } from './drops'

describe('rollDrops', () => {
  it('gives normals 1–2 gold about a quarter of the time', () => {
    const rng = new Rng(1)
    const out = emptyDrops()
    let dropped = 0
    const n = 20000
    for (let i = 0; i < n; i++) {
      rollDrops(rng, ENEMIES.goblin, 'normal', false, out)
      expect(out.xp).toBe(1)
      if (out.gold > 0) {
        dropped++
        expect(out.gold).toBeGreaterThanOrEqual(1)
        expect(out.gold).toBeLessThanOrEqual(2)
      }
      expect(out.chest).toBe(false)
    }
    expect(dropped / n).toBeGreaterThan(0.23)
    expect(dropped / n).toBeLessThan(0.27)
  })

  it('pays elites ten times the XP, 8–15 gold and a chest one time in ten', () => {
    const rng = new Rng(2)
    const out = emptyDrops()
    let chests = 0
    const n = 20000
    for (let i = 0; i < n; i++) {
      rollDrops(rng, ENEMIES.skeleton, 'normal', true, out)
      expect(out.xp).toBe(20)
      expect(out.gold).toBeGreaterThanOrEqual(8)
      expect(out.gold).toBeLessThanOrEqual(15)
      if (out.chest) chests++
    }
    expect(chests / n).toBeGreaterThan(0.085)
    expect(chests / n).toBeLessThan(0.115)
  })

  it('always gives minibosses a chest and 40 gold', () => {
    const out = rollDrops(new Rng(3), ENEMIES.stone_golem, 'miniboss', false, emptyDrops())
    expect(out).toMatchObject({ xp: 60, gold: 40, chest: true, magnet: false, bomb: false, health: false })
  })

  it('gives bosses 100 gold and big XP but leaves the chest to the interactables', () => {
    const out = rollDrops(new Rng(4), ENEMIES.barkzilla, 'boss', false, emptyDrops())
    expect(out).toMatchObject({ xp: 500, gold: 100, chest: false })
  })

  it('drops powerups rarely', () => {
    const rng = new Rng(5)
    const out = emptyDrops()
    let magnets = 0
    let bombs = 0
    let health = 0
    const n = 50000
    for (let i = 0; i < n; i++) {
      rollDrops(rng, ENEMIES.sprout, 'normal', false, out)
      if (out.magnet) magnets++
      if (out.bomb) bombs++
      if (out.health) health++
    }
    expect(magnets / n).toBeGreaterThan(0.002)
    expect(magnets / n).toBeLessThan(0.006)
    expect(bombs / n).toBeGreaterThan(0.0015)
    expect(bombs / n).toBeLessThan(0.0045)
    expect(health / n).toBeGreaterThan(0.007)
    expect(health / n).toBeLessThan(0.013)
  })
})

describe('pieceCount', () => {
  it('splits big rewards into a capped number of pieces', () => {
    expect(pieceCount(0, 25, 12)).toBe(0)
    expect(pieceCount(3, 25, 12)).toBe(1)
    expect(pieceCount(60, 25, 12)).toBe(3)
    expect(pieceCount(1500, 25, 12)).toBe(12)
  })

  it('ignores NaN', () => {
    expect(pieceCount(NaN, 25, 12)).toBe(0)
  })
})
