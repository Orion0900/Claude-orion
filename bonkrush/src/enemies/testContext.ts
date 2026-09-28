/**
 * Test-only: a GameContext with a flat world, a stationary player and
 * recording fakes for everything the enemy systems talk to. Lets the real
 * EnemyManager and Spawner run in node without a renderer.
 */
import * as THREE from 'three'
import { vi } from 'vitest'
import { EventBus } from '../core/events'
import { Rng } from '../core/rng'
import { STAGES } from '../data/stages'
import { DEFAULT_SETTINGS, defaultSave } from '../game/save'
import type { GameContext, GameEvents, RunState, StageDef } from '../game/types'
import { BASE_STATS } from '../progression/stats'
import { EnemyManager } from './EnemyManager'
import { Spawner } from './Spawner'

export interface TestHarness {
  ctx: GameContext
  enemies: EnemyManager
  spawner: Spawner
  events: Array<{ type: keyof GameEvents; payload: unknown }>
  hurt: ReturnType<typeof vi.fn>
  /** Advances game time, running the spawner then the enemies like Game does. */
  step(dt: number, frames?: number): void
}

export function makeHarness(opts: { stage?: StageDef; seed?: number; halfSize?: number } = {}): TestHarness {
  const stage = opts.stage ?? STAGES[0]
  const halfSize = opts.halfSize ?? 120
  const events = new EventBus<GameEvents>()
  const log: TestHarness['events'] = []
  const types: Array<keyof GameEvents> = ['enemyHit', 'enemyKilled', 'bossSpawned', 'bossKilled', 'finalSwarm', 'wave']
  for (const type of types) events.on(type, (payload) => log.push({ type, payload }))

  const run: RunState = {
    seed: 1, characterId: 'vix', stageIndex: stage.index, stageTime: 0, totalTime: 0, stageDuration: stage.duration,
    kills: 0, gold: 0, silver: 0, damageDealt: 0, damageTaken: 0, chestsOpened: 0, shrinesUsed: 0,
    bossesKilled: 0, elitesKilled: 0, bossSpawned: false, bossDefeated: false, portalOpen: false, curse: 0,
    greed: 0, chestsPaid: 0,
  }
  events.on('bossSpawned', () => (run.bossSpawned = true))

  const hurt = vi.fn((amount: number) => amount)
  const player = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, radius: 0.4, onGround: true, sliding: false,
    hp: 100, shield: 0, alive: true, hurt, heal: vi.fn(), refresh: vi.fn(), update: vi.fn(), dispose: vi.fn(),
  }
  const world = {
    halfSize,
    heightAt: () => 0,
    normalAt: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0),
    collide: (pos: THREE.Vector3) => {
      pos.x = Math.max(-halfSize, Math.min(halfSize, pos.x))
      pos.z = Math.max(-halfSize, Math.min(halfSize, pos.z))
    },
    spots: { chests: [], shrines: [], pots: [], altar: new THREE.Vector3(10, 0, 10), playerStart: new THREE.Vector3() },
    update: vi.fn(),
    dispose: vi.fn(),
  }
  const noop = () => undefined
  const clock = { time: 0 }
  const ctx = {
    scene: new THREE.Scene(),
    renderer: null,
    rng: new Rng(opts.seed ?? 1),
    events,
    run,
    meta: defaultSave(),
    settings: { ...DEFAULT_SETTINGS },
    character: null,
    stage,
    world,
    player,
    fx: { burst: vi.fn(), number: vi.fn(), ring: vi.fn(), shake: vi.fn(), flash: vi.fn(), shakeOffset: new THREE.Vector3(), update: noop, clear: noop, dispose: noop },
    audio: { play: vi.fn(), unlock: noop, setIntensity: noop, startMusic: noop, stopMusic: noop, setVolumes: noop, update: noop },
    ui: { banner: vi.fn(), toast: vi.fn() },
    pickups: { spawn: vi.fn(), magnetAll: noop, count: 0, clear: noop, update: noop, dispose: noop },
    interactables: { spawnChest: vi.fn() },
    progression: { stats: { ...BASE_STATS } },
    get time() {
      return clock.time
    },
    addGold: noop,
    advanceStage: noop,
  } as unknown as GameContext

  const enemies = new EnemyManager(ctx)
  ctx.enemies = enemies
  const spawner = new Spawner(ctx)
  ctx.spawner = spawner

  return {
    ctx,
    enemies,
    spawner,
    events: log,
    hurt,
    step(dt: number, frames = 1) {
      for (let i = 0; i < frames; i++) {
        clock.time += dt
        run.stageTime += dt
        run.totalTime += dt
        spawner.update(dt)
        enemies.update(dt)
      }
    },
  }
}
