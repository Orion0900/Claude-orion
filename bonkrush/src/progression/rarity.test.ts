import { Rng } from '../core/rng'
import { RARITIES, rarityOdds, rollRarity } from './rarity'

describe('rarity', () => {
  it('odds sum to one', () => {
    for (const luck of [0, 0.5, 2]) {
      const odds = rarityOdds(luck)
      expect(RARITIES.reduce((s, r) => s + odds[r], 0)).toBeCloseTo(1)
    }
  })

  it('luck raises legendary odds and lowers common', () => {
    expect(rarityOdds(1).legendary).toBeGreaterThan(rarityOdds(0).legendary * 2)
    expect(rarityOdds(1).common).toBeLessThan(rarityOdds(0).common)
  })

  it('chest items never roll uncommon', () => {
    const rng = new Rng(3)
    for (let i = 0; i < 2000; i++) expect(rollRarity(rng, 0.5, 'item')).not.toBe('uncommon')
  })

  it('mostly rolls common at zero luck', () => {
    const rng = new Rng(11)
    let common = 0
    for (let i = 0; i < 5000; i++) if (rollRarity(rng, 0) === 'common') common++
    expect(common / 5000).toBeGreaterThan(0.5)
  })
})
