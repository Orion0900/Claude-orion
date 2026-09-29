import { Rng } from './rng'

describe('Rng', () => {
  it('replays the same sequence from the same seed', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  it('stays in range', () => {
    const rng = new Rng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      const n = rng.int(3, 5)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(5)
    }
  })

  it('never picks a zero-weight entry', () => {
    const rng = new Rng(1)
    for (let i = 0; i < 500; i++) {
      expect(rng.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1))).not.toBe('b')
    }
  })

  it('forks into a different stream', () => {
    const rng = new Rng(9)
    const fork = rng.fork(1)
    expect(fork.next()).not.toBe(new Rng(9).next())
  })
})
