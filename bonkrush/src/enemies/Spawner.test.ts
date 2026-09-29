import * as THREE from 'three'
import { STAGES } from '../data/stages'
import type { Enemy } from '../game/types'
import { ENCIRCLE_RADIUS, GHOST_TIER_TINT, MAX_ENEMIES, SPAWN_RING_MAX, SPAWN_RING_MIN, encircleCeiling, encircleTimes, minibossTimes, waveCeiling } from './director'
import type { EnemyEntity } from './entity'
import { makeHarness } from './testContext'

type Harness = ReturnType<typeof makeHarness>
const alive = (h: Harness, id?: string) => h.enemies.list.filter((e) => e.alive && (!id || e.def.id === id))
const waves = (h: Harness) => h.events.filter((e) => e.type === 'wave').map((e) => e.payload as { defId: string; count: number; encircle: boolean })
/** Fills the map to the low-quality cap (180) with goblins at `dist` metres around the player. */
function fillToCap(h: Harness, dist: number, n = 180): void {
  h.ctx.settings.quality = 'low'
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    h.enemies.spawn('goblin', new THREE.Vector3(Math.cos(a) * dist, 0, Math.sin(a) * dist))
  }
}

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
    // ~1.7 spawns per second over the first 30 s, in clumps of 3–8.
    expect(calls.length).toBeGreaterThan(35)
    expect(calls.length).toBeLessThan(70)
    for (const [, pos] of calls) {
      const d = Math.hypot(pos.x, pos.z)
      expect(d).toBeGreaterThan(SPAWN_RING_MIN - 4)
      expect(d).toBeLessThan(SPAWN_RING_MAX + 4)
    }
  })

  it('opens later stages busier', () => {
    const stage1 = makeHarness()
    const stage3 = makeHarness({ stage: STAGES[2] })
    const calls1 = recordSpawns(stage1)
    const calls3 = recordSpawns(stage3)
    stage1.step(0.05, 600)
    stage3.step(0.05, 600)
    // 4.6/s against 1.6/s at the start.
    expect(calls3.length).toBeGreaterThan(calls1.length * 2.2)
  })

  it('halves the spawn rate while a boss is alive', () => {
    const calm = makeHarness()
    const fight = makeHarness()
    fight.spawner.summonBoss()
    const a = recordSpawns(calm)
    const b = recordSpawns(fight)
    calm.step(0.05, 1200)
    fight.step(0.05, 1200)
    expect(b.length).toBeLessThan(a.length * 0.65)
    expect(b.length).toBeGreaterThan(a.length * 0.35)
  })

  it('keeps every spawn inside the walls, even with the player in a corner', () => {
    const h = makeHarness()
    h.ctx.player.pos.set(95, 0, -95)
    h.ctx.run.stageTime = 240
    const calls = recordSpawns(h)
    h.step(0.05, 400)
    expect(calls.length).toBeGreaterThan(20)
    for (const [, pos] of calls) {
      expect(Math.abs(pos.x)).toBeLessThanOrEqual(94)
      expect(Math.abs(pos.z)).toBeLessThanOrEqual(94)
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

  it('bursts a themed wave every 60 s and tells the HUD', () => {
    const h = makeHarness()
    h.ctx.run.stageTime = 59.9
    h.step(0.02)
    const calls = recordSpawns(h)
    h.step(0.1, 2)
    expect(calls.length).toBeGreaterThanOrEqual(20)
    expect(calls.length).toBeLessThanOrEqual(48)
    const [wave] = waves(h)
    expect(wave.encircle).toBe(false)
    expect(STAGES[0].roster).toContain(wave.defId)
    expect(wave.count).toBeGreaterThanOrEqual(20)
    expect(calls.filter((c) => c[0] === wave.defId).length).toBeGreaterThanOrEqual(wave.count)
  })

  it('still sends the wave when the map is full', () => {
    const h = makeHarness()
    fillToCap(h, 20)
    h.ctx.run.stageTime = 119.95
    h.step(0.1)
    const [wave] = waves(h)
    expect(wave.count).toBeGreaterThanOrEqual(15)
    // Over the cap, but not without bound.
    expect(h.enemies.aliveCount).toBeGreaterThan(180)
    expect(h.enemies.aliveCount).toBeLessThanOrEqual(waveCeiling(180))
  })

  it('warns, then surrounds the player with a ring of the first roster type', () => {
    const h = makeHarness()
    const [first] = encircleTimes(0, h.ctx.run.stageDuration)
    h.ctx.player.pos.set(10, 0, -20)
    h.ctx.run.stageTime = first - 1.2
    h.step(0.1, 3)
    expect(h.ctx.ui.banner).toHaveBeenCalledWith('SURROUNDED!', expect.any(String), expect.any(String))
    expect(h.ctx.fx.ring).toHaveBeenCalled()
    expect(waves(h).filter((w) => w.encircle)).toHaveLength(0)
    const calls = recordSpawns(h)
    h.step(0.1, 10)
    const ring = calls.filter((c) => c[0] === 'sprout')
    expect(ring.length).toBeGreaterThanOrEqual(30)
    const around = ring.filter(([, pos]) => Math.abs(Math.hypot(pos.x - 10, pos.z + 20) - ENCIRCLE_RADIUS) < 0.5)
    expect(around).toHaveLength(30)
    expect(waves(h).filter((w) => w.encircle)).toEqual([{ defId: 'sprout', count: 30, encircle: true }])
  })

  it('surrounds with more on later stages, and ignores the alive cap', () => {
    const h = makeHarness({ stage: STAGES[2] })
    fillToCap(h, 20)
    const [first] = encircleTimes(2, h.ctx.run.stageDuration)
    h.ctx.run.stageTime = first - 0.05
    h.step(0.1)
    expect(waves(h).find((w) => w.encircle)).toEqual({ defId: 'skeleton', count: 50, encircle: true })
    expect(alive(h, 'skeleton').length).toBeGreaterThanOrEqual(50)
    expect(h.enemies.aliveCount).toBeGreaterThanOrEqual(230)
  })

  it('makes room for an encirclement from far-off enemies first', () => {
    const h = makeHarness()
    fillToCap(h, 60)
    const [first] = encircleTimes(0, h.ctx.run.stageDuration)
    h.ctx.run.stageTime = first - 0.05
    h.step(0.1)
    expect(alive(h, 'sprout').length).toBeGreaterThanOrEqual(30)
    expect(h.enemies.aliveCount).toBeLessThanOrEqual(181)
    expect(h.events.filter((e) => e.type === 'enemyKilled')).toHaveLength(0)
  })

  it('drains a set-piece overflow back down to the cap', () => {
    const h = makeHarness()
    fillToCap(h, 20)
    // What a wave left over the cap: some out in the fog, some left far behind (frozen, so they stay there).
    for (let i = 0; i < 40; i++) {
      const e = h.enemies.spawn('goblin', new THREE.Vector3(i < 20 ? 55 : -90, 0, (i % 20) - 10)) as Enemy
      h.enemies.applyFreeze(e, 60)
    }
    expect(h.enemies.aliveCount).toBe(220)
    h.ctx.run.stageTime = 20
    h.step(0.05, 240)
    expect(h.enemies.aliveCount).toBeLessThanOrEqual(180)
    expect(alive(h).filter((e) => Math.hypot(e.pos.x, e.pos.z) > 45)).toHaveLength(0)
    // Shed, not killed: no drops, no kill credit.
    expect(h.events.filter((e) => e.type === 'enemyKilled')).toHaveLength(0)
  })

  it('stops set pieces short of the hard ceiling, so minibosses and challenges still fit', () => {
    const h = makeHarness()
    h.ctx.settings.quality = 'high'
    // A crowd nobody is killing, all close in, so nothing far off can make room.
    for (let i = 0; i < 300; i++) {
      const a = (i / 300) * Math.PI * 2
      h.enemies.spawn('goblin', new THREE.Vector3(Math.cos(a) * 20, 0, Math.sin(a) * 20))
    }
    const rings = encircleTimes(0, h.ctx.run.stageDuration)
    // Every set piece of the first seven minutes, back to back.
    const due = [60, 120, 180, 240, rings[0], 300, 360, rings[1], 420].sort((a, b) => a - b)
    let peak = 0
    for (const t of due) {
      h.ctx.run.stageTime = t - 0.05
      h.step(0.1)
      peak = Math.max(peak, h.enemies.aliveCount - alive(h).filter((e) => e.def.id === 'stone_golem').length)
    }
    // The second ring still forms at the ceiling: the wave stragglers behind it give way.
    const rings2 = waves(h).filter((w) => w.encircle)
    expect(rings2).toHaveLength(2)
    expect(rings2[1].count).toBeGreaterThanOrEqual(20)
    expect(peak).toBeGreaterThan(300)
    expect(peak).toBeLessThanOrEqual(encircleCeiling(300, 30))
    expect(encircleCeiling(300, 30)).toBeLessThanOrEqual(MAX_ENEMIES - 12)
    expect(h.spawner.spawnChallenge(12, new THREE.Vector3(0, 0, 0))).toHaveLength(12)
    // Both minibosses turned up on the way.
    expect((h.ctx.ui.banner as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'MINIBOSS')).toHaveLength(1)
    h.ctx.run.stageTime = minibossTimes(0, h.ctx.run.stageDuration)[1] - 0.05
    h.step(0.1)
    expect((h.ctx.ui.banner as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'MINIBOSS')).toHaveLength(2)
  })

  it('tries a miniboss again rather than losing it when the spawn is refused', () => {
    const h = makeHarness()
    const real = h.enemies.spawn.bind(h.enemies)
    let refusals = 3
    h.enemies.spawn = (id, pos, opts) => (id === 'stone_golem' && refusals-- > 0 ? null : real(id, pos, opts))
    h.ctx.run.stageTime = minibossTimes(0, h.ctx.run.stageDuration)[0] - 0.05
    h.step(0.05, 10)
    expect(alive(h, 'stone_golem')).toHaveLength(1)
    expect((h.ctx.ui.banner as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'MINIBOSS')).toHaveLength(1)
  })

  it("doesn't spring an encirclement the clock jumped past", () => {
    const h = makeHarness()
    h.ctx.run.stageTime = 400
    h.step(0.1)
    expect(waves(h).filter((w) => w.encircle)).toHaveLength(0)
    expect(h.ctx.ui.banner).not.toHaveBeenCalledWith('SURROUNDED!', expect.anything(), expect.anything())
  })

  it('starts the final swarm once and then sends only ghosts', () => {
    const h = makeHarness()
    h.ctx.run.stageTime = h.ctx.run.stageDuration - 0.05
    const calls = recordSpawns(h)
    h.step(0.05, 40)
    expect(h.spawner.finalSwarm).toBe(true)
    expect(h.events.filter((e) => e.type === 'finalSwarm')).toHaveLength(1)
    expect(h.ctx.ui.banner).toHaveBeenCalledWith('FINAL SWARM', 'Summon the boss at the skull altar ☠', '#ff3b3b')
    expect(calls.length).toBeGreaterThan(20)
    expect(calls.every((c) => c[0] === 'ghost')).toBe(true)
    expect(h.spawner.intensity).toBeGreaterThan(0.5)
  })

  it('says how to leave in the swarm banner', () => {
    const banner = (setup: (h: Harness) => void) => {
      const h = makeHarness()
      setup(h)
      h.ctx.run.stageTime = h.ctx.run.stageDuration - 0.01
      h.step(0.05)
      return (h.ctx.ui.banner as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'FINAL SWARM')?.[1]
    }
    expect(banner(() => {})).toBe('Summon the boss at the skull altar ☠')
    expect(banner((h) => h.spawner.summonBoss())).toBe('Defeat the boss to open the portal')
    expect(banner((h) => (h.ctx.run.portalOpen = true))).toBe('Take the portal — or survive')
  })

  it('clears the far-off regulars when the swarm begins', () => {
    const h = makeHarness()
    for (let i = 0; i < 40; i++) h.enemies.spawn('goblin', new THREE.Vector3(60, 0, i - 20))
    const near = h.enemies.spawn('goblin', new THREE.Vector3(8, 0, 0)) as EnemyEntity
    const elite = h.enemies.spawn('goblin', new THREE.Vector3(-60, 0, 0), { elite: true }) as EnemyEntity
    h.ctx.run.stageTime = h.ctx.run.stageDuration - 0.01
    h.step(0.02)
    expect(alive(h, 'goblin').filter((e) => e.pos.x > 40)).toHaveLength(0)
    expect(near.alive).toBe(true)
    expect(elite.alive).toBe(true)
    // Cleared, not killed: no drops, no kill credit.
    expect(h.events.filter((e) => e.type === 'enemyKilled')).toHaveLength(0)
  })

  it('lets ghosts take the old horde\'s place at the cap', () => {
    const h = makeHarness()
    fillToCap(h, 30)
    h.ctx.run.stageTime = h.ctx.run.stageDuration - 0.01
    // A player running laps at 7 m/s with a crowd in tow, too weak to thin it.
    let a = 0
    const run = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        a += (7 / 30) * 0.05
        h.ctx.player.pos.set(Math.cos(a) * 30, 0, Math.sin(a) * 30)
        h.step(0.05)
      }
    }
    run(40)
    // About 12 at once and 14/s after: the swarm arrives at its rate, not as kills free room.
    expect(alive(h, 'ghost').length).toBeGreaterThanOrEqual(30)
    expect(h.enemies.aliveCount).toBeLessThanOrEqual(180)
    run(300)
    expect(alive(h, 'ghost').length).toBeGreaterThan(0.9 * h.enemies.aliveCount)
  })

  it('drains an overflowing horde while the ghosts arrive', () => {
    const h = makeHarness()
    fillToCap(h, 30)
    // An encirclement's worth over the cap, close in, when the clock runs out.
    for (let i = 0; i < 50; i++) h.enemies.spawn('goblin', new THREE.Vector3(Math.cos(i) * 16, 0, Math.sin(i) * 16))
    h.ctx.run.stageTime = h.ctx.run.stageDuration - 0.01
    let a = 0
    for (let i = 0; i < 200; i++) {
      a += (7 / 30) * 0.05
      h.ctx.player.pos.set(Math.cos(a) * 30, 0, Math.sin(a) * 30)
      h.step(0.05)
    }
    expect(h.enemies.aliveCount).toBeLessThanOrEqual(180)
    expect(alive(h, 'ghost').length).toBeGreaterThan(90)
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
