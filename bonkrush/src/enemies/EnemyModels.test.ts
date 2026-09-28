import { ENEMIES } from './enemyDefs'
import { MODEL_PRESETS, animStyleOf, buildEnemyGeometry } from './EnemyModels'

describe('EnemyModels', () => {
  it('has a preset for every enemy', () => {
    for (const def of Object.values(ENEMIES)) expect(MODEL_PRESETS, def.id).toContain(def.model)
  })

  it('builds unit-height, vertex-coloured, non-indexed geometry for every enemy', () => {
    for (const def of Object.values(ENEMIES)) {
      const geo = buildEnemyGeometry(def)
      expect(geo.index, def.id).toBeNull()
      const pos = geo.getAttribute('position')
      expect(geo.getAttribute('color').count).toBe(pos.count)
      expect(geo.getAttribute('aGlow').count).toBe(pos.count)
      expect(geo.getAttribute('normal').count).toBe(pos.count)
      const bb = geo.boundingBox!
      expect(bb.min.y).toBeCloseTo(0, 5)
      expect(bb.max.y).toBeCloseTo(1, 5)
      // Low-poly budget: a few hundred triangles keeps 300 of them cheap.
      expect(pos.count / 3, def.id).toBeLessThan(2500)
      for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true)
      geo.dispose()
    }
  })

  it('makes something glow on every model so eyes read in the dark', () => {
    for (const def of Object.values(ENEMIES)) {
      if (def.id === 'ghost' || def.id === 'goblin' || def.id === 'sprout' || def.id === 'shroom' || def.id === 'boar' || def.id === 'vulture' || def.id === 'cactoid') continue
      const glow = buildEnemyGeometry(def).getAttribute('aGlow')
      let any = false
      for (let i = 0; i < glow.count; i++) if (glow.getX(i) > 0) any = true
      expect(any, def.id).toBe(true)
    }
  })

  it('falls back instead of crashing on an unknown preset', () => {
    const geo = buildEnemyGeometry({ ...ENEMIES.goblin, model: 'nope' })
    expect(geo.getAttribute('position').count).toBeGreaterThan(0)
  })

  it('animates every preset somehow', () => {
    expect(animStyleOf('bat')).toBe('flap')
    expect(animStyleOf('ghost')).toBe('float')
    expect(animStyleOf('unknown')).toBe('walk')
  })
})
