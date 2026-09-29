import { MINIBOSSES, STAGES, SWARM_ENEMY } from '../data/stages'
import { ENEMIES, tierOf } from './enemyDefs'

describe('ENEMIES', () => {
  it('has every enemy the stages ask for', () => {
    for (const stage of STAGES) {
      for (const id of stage.roster) expect(ENEMIES[id], id).toBeDefined()
      expect(ENEMIES[stage.bossId]).toBeDefined()
    }
    for (const id of MINIBOSSES) expect(ENEMIES[id]).toBeDefined()
    expect(ENEMIES[SWARM_ENEMY]).toBeDefined()
  })

  it('keys each def by its own id', () => {
    for (const [id, def] of Object.entries(ENEMIES)) expect(def.id).toBe(id)
  })

  it('matches the design table', () => {
    expect(ENEMIES.sprout).toMatchObject({ behavior: 'chaser', hp: 8, damage: 6, speed: 4.2, radius: 0.45, xp: 1 })
    expect(ENEMIES.treant).toMatchObject({ behavior: 'tank', hp: 110, damage: 16, speed: 2.4, radius: 1.1, xp: 6 })
    expect(ENEMIES.cactoid).toMatchObject({ behavior: 'exploder', hp: 20, damage: 25, speed: 5.5, xp: 2 })
    expect(ENEMIES.wisp).toMatchObject({ behavior: 'flier', hp: 36, damage: 10, xp: 3 })
    expect(ENEMIES.ghost).toMatchObject({ hp: 60, damage: 18, speed: 7.5, radius: 0.55, xp: 1 })
    expect(ENEMIES.bone_colossus).toMatchObject({ hp: 5000, damage: 40, radius: 1.8, xp: 220 })
    expect(ENEMIES.grave_warden).toMatchObject({ behavior: 'boss', hp: 40000, damage: 55, radius: 2.6, xp: 1500 })
  })

  it('gives ranged enemies their projectiles', () => {
    expect(ENEMIES.shroom.projectile).toMatchObject({ damage: 7, speed: 10, cooldown: 2.5 })
    expect(ENEMIES.scorpion.projectile).toMatchObject({ damage: 10, speed: 14, cooldown: 2 })
    expect(ENEMIES.wisp.projectile).toMatchObject({ damage: 12, speed: 15, cooldown: 1.8 })
    for (const def of Object.values(ENEMIES)) {
      if (def.behavior === 'ranged' || def.behavior === 'boss') expect(def.projectile, def.id).toBeDefined()
    }
  })

  it('drops gold like the economy says', () => {
    expect(ENEMIES.goblin.gold).toEqual({ chance: 0.25, min: 1, max: 2 })
    expect(ENEMIES.stone_golem.gold.min).toBe(40)
    expect(ENEMIES.barkzilla.gold.min).toBe(100)
  })

  it('keeps sane physical numbers', () => {
    for (const def of Object.values(ENEMIES)) {
      expect(def.weight, def.id).toBeGreaterThanOrEqual(0)
      expect(def.weight, def.id).toBeLessThanOrEqual(1)
      expect(def.height, def.id).toBeGreaterThan(def.radius * 0.5)
      if (def.behavior === 'tank') expect(def.weight, def.id).toBeGreaterThanOrEqual(0.8)
      if (def.behavior === 'boss') {
        expect(def.radius).toBeGreaterThanOrEqual(2.4)
        expect(def.radius).toBeLessThanOrEqual(2.6)
      }
    }
  })

  it('knows bosses and minibosses apart', () => {
    expect(tierOf(ENEMIES.barkzilla)).toBe('boss')
    expect(tierOf(ENEMIES.scorpion_king)).toBe('miniboss')
    expect(tierOf(ENEMIES.goblin)).toBe('normal')
    expect(tierOf(ENEMIES.ghost)).toBe('normal')
  })
})
