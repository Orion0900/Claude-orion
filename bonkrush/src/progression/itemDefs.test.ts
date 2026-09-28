import type { Rarity } from '../game/types'
import { ITEMS } from './itemDefs'

/** Items whose effect lives in another system and reads the stack count. */
const READ_ELSEWHERE = new Set([
  'key',
  'wrench',
  'anvil',
  'tactical_glasses',
  'scarf',
  'brass_knuckles',
  'beefy_ring',
  'phantom_shroud',
  'big_bonk',
  'stopwatch',
])

describe('ITEMS', () => {
  it('has the 35 design items with unique ids', () => {
    expect(ITEMS).toHaveLength(35)
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(35)
  })

  it('matches the design rarity split and never uses uncommon', () => {
    const count = (r: Rarity) => ITEMS.filter((i) => i.rarity === r).length
    expect(count('common')).toBe(12)
    expect(count('uncommon')).toBe(0)
    expect(count('rare')).toBe(10)
    expect(count('epic')).toBe(5)
    expect(count('legendary')).toBe(8)
  })

  it('gives every item something to do', () => {
    for (const item of ITEMS) {
      const does = (item.mods?.length ?? 0) > 0 || !!item.hooks || READ_ELSEWHERE.has(item.id)
      expect(does, item.id).toBe(true)
      expect(item.description.length, item.id).toBeGreaterThan(5)
      expect(item.icon.length, item.id).toBeGreaterThan(0)
    }
  })
})
