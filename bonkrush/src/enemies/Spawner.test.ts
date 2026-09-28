import * as THREE from 'three'
import { STAGES } from '../data/stages'
import type { Enemy } from '../game/types'
import { GHOST_TIER_TINT, SPAWN_RING_MAX, SPAWN_RING_MIN } from './director'
import type { EnemyEntity } from './entity'
import { makeHarness } from './testContext'

type SpawnCall = [string, THREE.Vector3, { elite?: boolean; boss?: boolean; hpScale?: number } | undefined]

/** Records every spawn the spawner asks for, with a copy of where. */
function recordSpawns(h: ReturnType<typeof makeHarness>): SpawnCall[] {
  const calls: SpawnCall[] = []
  const real = h.enemies.spawn.bind(h.enemies)
  h.enemies.spawn = (id, pos, opts) => {
    calls.push([id, pos.clone(), opts])
    return real(id, pos, opts)
  }
  return calls
}

describe('Spawner', () => {
  it('spawns about as fast as the director says, in clumps on the ring', () => {
    const h = makeHarness()
    const calls = recordSpawns(h)
    h.step(0.05, 600)
    // ~1.1 spawns per second over the first 30 s, in clumps of 3–8.
    expect(calls.length).toBeGreaterThan(20)
    expect(calls.length).toBeLessThan(50)
    for (const [, pos] of calls) {
      const d = Math.hypot(pos.x, pos.z)
      expect(d).toBeGreaterThan(SPAWN_RING_MIN - 4)
      expect(d).toBeLessThan(SPAWN_RING_MAX + 4)
    }
  })

  it('only sends unlocked roster types', () => {
    const h = makeHarness()
    const calls = recordSpawns(h)
    h.step(0.05, 800)
    expect(new Set(calls.map((c) => c[0]))).toEqual(new Set(['sprout']))
  })

  it('brings in newer types as the stage goes on', () => {
    const h = makeHarness()
    h.ctx.run.stageTime = 400
    const calls = recordSpawns(h)
    h.step(0.05, 400)
    // The 3:00 miniboss also turns up, since the clock jumped past it.
    const kinds = new Set(calls.map((c) => c[0]).filter((id) => id !== 'stone_golem'))
    expect(kinds.size).toBeGreaterThanOrEqual(3)
    expect([...kinds].every((k) => STAGES[0].roster.includes(k))).toBe(true)
  })

  it('sends minibosses on schedule, with a banner', () => {
    const h = makeHarness()
    h.ctx.run.stageTime = 179.5
    h.step(0.1, 10)
    expect(h.enemies.list.some((e) => e.alive && e.def.id === 'stone_golem')).toBe(true)
    expect(h.ctx.ui.banner).toHaveBeenCalledWith('MINIBOSS', 'Stone Golem', expect.any(String))
    expect(h.ctx.audio.play).toHaveBeenCalledWith('bossRoar', expect.anything())
  })

  it("doesn't dump skipped set pieces after the boss dies", () => {
    const h = makeHarness()
    h.ctx.run.bossDefeated = true
    h.ctx.run.stageTime = 590
    h.step(0.1, 5)
    expect(h.ctx.ui.banner).not.toHaveBeenCalledWith('MINIBOSS', expect.anything(), expect.anything())
  })

  it('bursts a themed wave every 60 s', () => {
    const h = makeHarness()
    h.ctx.run.stageTime = 59.9
    h.step(0.02)
    const calls = recordSpawns(h)
    h.step(0.1, 2)
    expect(calls.length).toBeGreaterThanOrEqual(20)
    expect(calls.length).toBeLessThanOrEqual(48)
  })

  it('starts the final swarm once and then sends only ghosts', () => {
    const h = makeHarness()
    h.ctx.run.stageTime = h.ctx.run.stageDuration - 0.05
    const calls = recordSpawns(h)
    h.step(0.05, 40)
    expect(h.spawner.finalSwarm).toBe(true)
    expect(h.events.filter((e) => e.type === 'finalSwarm')).toHaveLength(1)
    expect(h.ctx.ui.banner).toHaveBeenCalledWith('FINAL SWARM', 'Find the portal — or survive', '#ff3b3b')
    expect(calls.length).toBeGreaterThan(20)
    expect(calls.every((c) => c[0] === 'ghost')).toBe(true)
    expect(h.spawner.intensity).toBeGreaterThan(0.5)
  })

  it('turns ghosts purple and tougher after three minutes of swarm', () => {
    const h = makeHarness()
    h.ctx.run.stageTime = h.ctx.run.stageDuration + 200
    h.step(0.05, 20)
    const ghost = h.enemies.list.find((e) => e.alive && e.def.id === 'ghost') as EnemyEntity
    expect(ghost).toBeDefined()
    expect([ghost.tintR, ghost.tintG, ghost.tintB]).toEqual([...GHOST_TIER_TINT[1]])
    expect(ghost.maxHp).toBeGreaterThan(60 * 2.5 * 2)
    expect(h.ctx.ui.toast).toHaveBeenCalled()
  })

  it('summons the boss once, in front of the player, with a banner', () => {
    const h = makeHarness()
    h.spawner.summonBoss()
    h.spawner.summonBoss()
    const bosses = h.enemies.list.filter((e) => e.boss)
    expect(bosses).toHaveLength(1)
    expect(bosses[0].def.id).toBe('barkzilla')
    // Player yaw 0 faces -Z.
    expect(bosses[0].pos.z).toBeCloseTo(-14, 0)
    expect(h.ctx.ui.banner).toHaveBeenCalledWith('BOSS', 'Barkzilla', expect.any(String))
    expect(h.ctx.fx.shake).toHaveBeenCalled()
  })

  it('makes the boss tougher the later it is called', () => {
    const early = makeHarness()
    early.spawner.summonBoss()
    const late = makeHarness()
    late.ctx.run.stageTime = 480
    late.spawner.summonBoss()
    expect((late.enemies.boss as Enemy).maxHp).toBeCloseTo((early.enemies.boss as Enemy).maxHp * (1 + 8 * 0.35))
  })

  it('rings a challenge shrine with elites from the roster', () => {
    const h = makeHarness()
    h.ctx.run.stageTime = 200
    const center = new THREE.Vector3(20, 0, 20)
    const foes = h.spawner.spawnChallenge(9, center)
    expect(foes).toHaveLength(9)
    for (const e of foes) {
      expect(e.elite).toBe(true)
      expect(STAGES[0].roster).toContain(e.def.id)
      expect(Math.hypot(e.pos.x - center.x, e.pos.z - center.z)).toBeCloseTo(9, 0)
    }
  })

  it('holds the alive cap by moving far-off enemies instead of adding more', () => {
    const h = makeHarness()
    h.ctx.settings.quality = 'low'
    for (let i = 0; i < 180; i++) h.enemies.spawn('sprout', new THREE.Vector3(100, 0, -60 + i * 0.6))
    h.ctx.run.stageTime = 300
    h.step(0.05, 200)
    // Minibosses are set pieces and ignore the cap; the horde doesn't.
    const normals = h.enemies.list.filter((e) => e.alive && e.def.id !== 'stone_golem').length
    expect(normals).toBeLessThanOrEqual(180)
    const moved = h.enemies.list.filter((e) => e.alive && Math.hypot(e.pos.x, e.pos.z) < 60).length
    expect(moved).toBeGreaterThan(10)
  })

  it('stops spawning once the player is dead', () => {
    const h = makeHarness()
    ;(h.ctx.player as { alive: boolean }).alive = false
    const calls = recordSpawns(h)
    h.step(0.05, 400)
    expect(calls).toHaveLength(0)
  })
})
