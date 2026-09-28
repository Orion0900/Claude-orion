import * as THREE from 'three'
import { STAGES } from '../data/stages'
import type { Enemy, StatBlock } from '../game/types'
import { CHARGE_DASH, CHARGE_WINDUP } from './behaviors'
import { ELITE_HP_MULT, ELITE_SCALE, hpScale } from './director'
import type { EnemyEntity } from './entity'
import { makeHarness } from './testContext'

const at = (x: number, z: number) => new THREE.Vector3(x, 0, z)
const count = (h: ReturnType<typeof makeHarness>, type: string) => h.events.filter((e) => e.type === type).length

describe('EnemyManager', () => {
  it('gives every spawn a new uid, even when it reuses a pooled object', () => {
    const h = makeHarness()
    const seen = new Set<number>()
    const objects = new Set<Enemy>()
    for (let i = 0; i < 30; i++) {
      const e = h.enemies.spawn('goblin', at(20 + i, 0)) as Enemy
      expect(seen.has(e.uid)).toBe(false)
      seen.add(e.uid)
      objects.add(e)
      h.enemies.damage(e, 1e6, { source: 'test' })
    }
    h.step(5)
    let reused = 0
    for (let i = 0; i < 30; i++) {
      const e = h.enemies.spawn('goblin', at(20, i)) as Enemy
      expect(seen.has(e.uid)).toBe(false)
      seen.add(e.uid)
      if (objects.has(e)) reused++
    }
    expect(reused).toBeGreaterThan(0)
  })

  it('does not reuse a dead enemy object right away', () => {
    const h = makeHarness()
    const a = h.enemies.spawn('goblin', at(20, 0)) as Enemy
    h.enemies.damage(a, 1e6, { source: 'test' })
    h.step(0.1)
    const b = h.enemies.spawn('goblin', at(20, 0)) as Enemy
    expect(b).not.toBe(a)
    expect(a.alive).toBe(false)
  })

  it('makes elites bigger, tougher and harder-hitting', () => {
    const h = makeHarness()
    const plain = h.enemies.spawn('goblin', at(30, 0)) as Enemy
    const elite = h.enemies.spawn('goblin', at(-30, 0), { elite: true }) as Enemy
    expect(elite.elite).toBe(true)
    expect(elite.scale).toBe(ELITE_SCALE)
    expect(elite.maxHp).toBeCloseTo(plain.maxHp * ELITE_HP_MULT)
    expect((elite as EnemyEntity).damageScale).toBeCloseTo((plain as EnemyEntity).damageScale * 1.5)
  })

  it('scales HP with stage time, stage and difficulty', () => {
    const h = makeHarness({ stage: STAGES[1] })
    h.ctx.run.stageTime = 300
    ;(h.ctx.progression.stats as StatBlock).difficulty = 0.2
    h.ctx.run.curse = 0.1
    const e = h.enemies.spawn('mummy', at(30, 0)) as Enemy
    expect(e.maxHp).toBeCloseTo(30 * hpScale(300, STAGES[1].enemyScale, 0.3))
  })

  it('announces hits, kills and drops the loot', () => {
    const h = makeHarness()
    const e = h.enemies.spawn('goblin', at(5, 0)) as Enemy
    h.enemies.damage(e, 5, { source: 'sword', crit: true })
    expect(e.hp).toBeCloseTo(e.maxHp - 5)
    expect(e.hitFlash).toBe(0)
    const hit = h.events.find((x) => x.type === 'enemyHit')?.payload as { amount: number; crit: boolean; procs: boolean; source: string }
    expect(hit).toMatchObject({ amount: 5, crit: true, procs: true, source: 'sword' })
    expect(h.ctx.fx.number).toHaveBeenCalledWith(expect.anything(), '5', 'crit')
    h.enemies.damage(e, 100, { source: 'sword' })
    expect(e.alive).toBe(false)
    expect(h.enemies.aliveCount).toBe(0)
    expect(count(h, 'enemyKilled')).toBe(1)
    expect(h.ctx.pickups.spawn).toHaveBeenCalledWith('xp', expect.anything(), 1)
    // Dead is dead.
    h.enemies.damage(e, 100, { source: 'sword' })
    expect(count(h, 'enemyKilled')).toBe(1)
  })

  it('ignores zero and NaN damage', () => {
    const h = makeHarness()
    const e = h.enemies.spawn('goblin', at(5, 0)) as Enemy
    h.enemies.damage(e, NaN, { source: 'x' })
    h.enemies.damage(e, 0, { source: 'x' })
    expect(e.hp).toBe(e.maxHp)
    expect(count(h, 'enemyHit')).toBe(0)
  })

  it('burns every half second without procs', () => {
    const h = makeHarness()
    const e = h.enemies.spawn('treant', at(30, 0)) as Enemy
    h.enemies.applyBurn(e, 4, 2)
    h.step(0.05, 22)
    const burns = h.events.filter((x) => x.type === 'enemyHit').map((x) => x.payload as { source: string; amount: number; procs: boolean })
    expect(burns.length).toBe(2)
    for (const b of burns) expect(b).toMatchObject({ source: 'burn', amount: 2, procs: false })
  })

  it('freezes normals in place but only slows bosses', () => {
    const h = makeHarness()
    const goblin = h.enemies.spawn('goblin', at(10, 0)) as Enemy
    const boss = h.enemies.spawn('barkzilla', at(-20, 0), { boss: true }) as Enemy
    h.enemies.applyFreeze(goblin, 1)
    h.enemies.applyFreeze(boss, 1)
    expect(goblin.freeze).toBe(1)
    expect(boss.freeze).toBe(0)
    expect(boss.slow).toBe(1)
    const x = goblin.pos.x
    h.step(0.05, 10)
    expect(goblin.pos.x).toBe(x)
    h.step(0.05, 20)
    expect(goblin.pos.x).toBeLessThan(x)
  })

  it('tracks the boss for the HUD and announces it', () => {
    const h = makeHarness()
    expect(h.enemies.boss).toBeNull()
    const boss = h.enemies.spawn('barkzilla', at(0, -14), { boss: true }) as Enemy
    expect(h.enemies.boss).toBe(boss)
    expect(count(h, 'bossSpawned')).toBe(1)
    h.enemies.damage(boss, 1e9, { source: 'test' })
    expect(count(h, 'bossKilled')).toBe(1)
    expect(h.enemies.boss).toBeNull()
    // The boss chest is the interactables' job.
    expect(h.ctx.interactables.spawnChest).not.toHaveBeenCalled()
    expect(h.ctx.pickups.spawn).toHaveBeenCalledWith('gold', expect.anything(), expect.any(Number))
  })

  it('always drops a free chest from a miniboss', () => {
    const h = makeHarness()
    const golem = h.enemies.spawn('stone_golem', at(20, 0)) as Enemy
    h.enemies.damage(golem, 1e9, { source: 'test' })
    expect(h.ctx.interactables.spawnChest).toHaveBeenCalledWith(expect.anything(), true)
    const gold = (h.ctx.pickups.spawn as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'gold').reduce((s, c) => s + c[2], 0)
    expect(gold).toBe(40)
  })

  it('finds enemies like a brute-force scan', () => {
    const h = makeHarness()
    const rng = h.ctx.rng
    for (let i = 0; i < 150; i++) h.enemies.spawn(i % 2 ? 'goblin' : 'treant', at(rng.range(-60, 60), rng.range(-60, 60)))
    h.step(0.016)
    const out: Enemy[] = []
    for (let q = 0; q < 30; q++) {
      const c = at(rng.range(-50, 50), rng.range(-50, 50))
      const r = rng.range(1, 15)
      const brute = h.enemies.list.filter((e) => e.alive && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) <= r + e.def.radius * e.scale)
      expect(new Set(h.enemies.queryRadius(c, r, out))).toEqual(new Set(brute))
      const nearest = h.enemies.nearest(c, 200)
      const best = Math.min(...h.enemies.list.filter((e) => e.alive).map((e) => Math.hypot(e.pos.x - c.x, e.pos.z - c.z)))
      expect(Math.hypot(nearest!.pos.x - c.x, nearest!.pos.z - c.z)).toBeCloseTo(best, 4)
    }
  })

  it('skips excluded uids in nearest', () => {
    const h = makeHarness()
    const a = h.enemies.spawn('goblin', at(3, 0)) as Enemy
    const b = h.enemies.spawn('goblin', at(6, 0)) as Enemy
    h.step(0.001)
    expect(h.enemies.nearest(at(0, 0), 20)).toBe(a)
    expect(h.enemies.nearest(at(0, 0), 20, new Set([a.uid]))).toBe(b)
  })

  it('keeps a crowd from collapsing into one blob', () => {
    const h = makeHarness()
    for (let i = 0; i < 40; i++) h.enemies.spawn('goblin', at(30, 0))
    h.step(0.05, 40)
    const live = h.enemies.list.filter((e) => e.alive)
    let overlapping = 0
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) if (live[i].pos.distanceTo(live[j].pos) < 0.3) overlapping++
    expect(overlapping).toBeLessThan(5)
  })

  it('hurts the player on contact and takes thorns back', () => {
    const h = makeHarness()
    ;(h.ctx.progression.stats as StatBlock).thorns = 5
    const e = h.enemies.spawn('goblin', at(0.8, 0)) as Enemy
    h.step(0.02)
    expect(h.hurt).toHaveBeenCalledWith(expect.closeTo(8, 5), 'goblin', expect.anything())
    expect(e.hp).toBeCloseTo(e.maxHp - 5)
    const thorns = h.events.find((x) => x.type === 'enemyHit')?.payload as { source: string; procs: boolean }
    expect(thorns).toMatchObject({ source: 'thorns', procs: false })
  })

  it('sends the player flying when a ghost connects', () => {
    const h = makeHarness()
    h.enemies.spawn('ghost', at(0.9, 0))
    h.step(0.02)
    expect(h.ctx.player.vel.x).toBeLessThan(-10)
    expect(h.ctx.player.vel.y).toBeGreaterThan(0)
  })

  it('lets heavy enemies shrug off knockback', () => {
    const h = makeHarness()
    const light = h.enemies.spawn('sprout', at(30, 0)) as EnemyEntity
    const heavy = h.enemies.spawn('treant', at(-30, 0)) as EnemyEntity
    const kb = new THREE.Vector3(10, 0, 0)
    h.enemies.damage(light, 1, { source: 't', knockback: kb })
    h.enemies.damage(heavy, 1, { source: 't', knockback: kb })
    expect(light.kbX).toBeCloseTo(10 * (1 - light.def.weight))
    expect(heavy.kbX).toBeCloseTo(10 * (1 - heavy.def.weight))
    expect(heavy.kbX).toBeLessThan(light.kbX / 4)
  })

  it('clears everything but the boss unless asked', () => {
    const h = makeHarness()
    for (let i = 0; i < 10; i++) h.enemies.spawn('goblin', at(20, i))
    h.enemies.spawn('stone_golem', at(-20, 0))
    const boss = h.enemies.spawn('barkzilla', at(0, 30), { boss: true }) as Enemy
    h.enemies.clear()
    expect(h.enemies.aliveCount).toBe(1)
    expect(boss.alive).toBe(true)
    expect(count(h, 'enemyKilled')).toBe(0)
    h.enemies.clear(true)
    expect(h.enemies.aliveCount).toBe(0)
  })

  it('shoots at the player from range', () => {
    const h = makeHarness()
    h.enemies.spawn('scorpion', at(0, 12))
    for (let i = 0; i < 200 && !h.hurt.mock.calls.some((c) => c[1] === 'scorpion'); i++) h.step(0.05)
    expect(h.hurt.mock.calls.some((c) => c[1] === 'scorpion')).toBe(true)
  })

  it('lobs spores that land on the player', () => {
    const h = makeHarness()
    h.enemies.spawn('shroom', at(12, 0))
    for (let i = 0; i < 200 && !h.hurt.mock.calls.some((c) => c[1] === 'shroom'); i++) h.step(0.05)
    expect(h.hurt.mock.calls.some((c) => c[1] === 'shroom')).toBe(true)
  })

  it('blows exploders up next to the player without a kill', () => {
    const h = makeHarness({ stage: STAGES[1] })
    h.enemies.spawn('cactoid', at(1.2, 0))
    h.step(0.05, 30)
    expect(h.hurt).toHaveBeenCalledWith(expect.any(Number), 'cactoid', expect.anything())
    expect(h.enemies.aliveCount).toBe(0)
    expect(count(h, 'enemyKilled')).toBe(0)
    expect(h.ctx.fx.ring).toHaveBeenCalled()
  })

  it('winds chargers up before they dash', () => {
    const h = makeHarness()
    const boar = h.enemies.spawn('boar', at(0, 8)) as Enemy
    const states: number[] = []
    for (let i = 0; i < 80; i++) {
      h.step(0.05)
      states.push(boar.state)
    }
    const windup = states.indexOf(CHARGE_WINDUP)
    const dash = states.indexOf(CHARGE_DASH)
    expect(windup).toBeGreaterThanOrEqual(0)
    expect(dash).toBeGreaterThan(windup)
    // 0.7 s of wind-up at 0.05 s a frame.
    expect(dash - windup).toBeGreaterThanOrEqual(13)
  })

  it('walks a miniboss right into the player for contact damage', () => {
    const h = makeHarness()
    h.enemies.spawn('stone_golem', at(0, 7))
    for (let i = 0; i < 150 && !h.hurt.mock.calls.some((c) => c[1] === 'stone_golem'); i++) h.step(0.02)
    expect(h.hurt).toHaveBeenCalledWith(expect.any(Number), 'stone_golem', expect.anything())
  })

  it('telegraphs a miniboss slam for at least 0.8 s before it lands', () => {
    const h = makeHarness()
    const golem = h.enemies.spawn('stone_golem', at(0, 3)) as EnemyEntity
    let windupAt = -1
    let hitAt = -1
    for (let i = 0; i < 200 && hitAt < 0; i++) {
      h.step(0.02)
      if (windupAt < 0 && golem.windup) windupAt = h.ctx.time
      if (h.hurt.mock.calls.some((c) => c[1] === 'stone_golem' && c[0] > 24)) hitAt = h.ctx.time
    }
    expect(windupAt).toBeGreaterThan(0)
    expect(hitAt - windupAt).toBeGreaterThanOrEqual(0.8)
  })

  it('removes every mesh it added on dispose', () => {
    const h = makeHarness()
    const before = h.ctx.scene.children.length
    expect(before).toBeGreaterThan(0)
    h.enemies.spawn('goblin', at(10, 0))
    h.step(0.02)
    h.enemies.dispose()
    expect(h.ctx.scene.children.length).toBe(0)
  })
})
