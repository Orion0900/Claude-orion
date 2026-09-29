/**
 * A minimal GameContext for node tests of the loot systems: flat ground,
 * recording stubs for every system they call, and a clock the test advances.
 * Nothing here needs a canvas or WebGL.
 */
import * as THREE from 'three'
import { EventBus } from '../core/events'
import { Rng } from '../core/rng'
import { STAGES } from '../data/stages'
import type {
  DamageOptions,
  Enemy,
  EnemyDef,
  GameContext,
  GameEvents,
  ModalRequest,
  Offer,
  PickupKind,
  RunState,
  SfxId,
  StatBlock,
} from '../game/types'
import { BASE_STATS } from '../progression/stats'

export interface FakeLog {
  xp: number
  healed: number
  sounds: SfxId[]
  toasts: string[]
  banners: string[]
  modals: ModalRequest[]
  applied: Offer[]
  damage: Array<{ enemy: Enemy; amount: number; opts: DamageOptions }>
  spawned: Array<{ kind: PickupKind; pos: THREE.Vector3; value: number }>
  magnets: number
  challenges: Array<{ count: number; center: THREE.Vector3 }>
  bossesSummoned: number
  advances: number
  recomputes: number
  events: Array<keyof GameEvents>
}

export interface FakeContext {
  ctx: GameContext
  log: FakeLog
  run: RunState
  stats: StatBlock
  items: Map<string, number>
  player: { pos: THREE.Vector3; vel: THREE.Vector3; radius: number; alive: boolean }
  /** Enemies the fake enemy system reports inside any query radius. */
  enemies: Enemy[]
  /** Advances game time and runs `update` in fixed steps. */
  step(seconds: number, update: (dt: number) => void, dt?: number): void
}

const TRACKED: Array<keyof GameEvents> = [
  'pickup',
  'chestOpened',
  'shrineUsed',
  'portalOpened',
  'goldChanged',
]

export function fakeEnemy(uid: number, pos = new THREE.Vector3(), id = 'goblin'): Enemy {
  const def = { id, name: id, behavior: 'chaser' } as EnemyDef
  return {
    uid,
    def,
    pos,
    vel: new THREE.Vector3(),
    yaw: 0,
    hp: 100,
    maxHp: 100,
    scale: 1,
    elite: false,
    boss: false,
    alive: true,
    slow: 0,
    burn: 0,
    burnDps: 0,
    burnSource: 'burn',
    freeze: 0,
    hitFlash: 0,
    t: 0,
    state: 0,
  }
}

export interface FakeSpots {
  chests?: THREE.Vector3[]
  shrines?: THREE.Vector3[]
  pots?: THREE.Vector3[]
  altar?: THREE.Vector3
  playerStart?: THREE.Vector3
}

export function fakeContext(spots: FakeSpots = {}, seed = 1): FakeContext {
  const events = new EventBus<GameEvents>()
  const log: FakeLog = {
    xp: 0,
    healed: 0,
    sounds: [],
    toasts: [],
    banners: [],
    modals: [],
    applied: [],
    damage: [],
    spawned: [],
    magnets: 0,
    challenges: [],
    bossesSummoned: 0,
    advances: 0,
    recomputes: 0,
    events: [],
  }
  for (const type of TRACKED) events.on(type, () => log.events.push(type))

  const run: RunState = {
    seed,
    characterId: 'vix',
    stageIndex: 0,
    stageTime: 0,
    totalTime: 0,
    stageDuration: 600,
    kills: 0,
    gold: 0,
    silver: 0,
    damageDealt: 0,
    damageTaken: 0,
    chestsOpened: 0,
    shrinesUsed: 0,
    bossesKilled: 0,
    elitesKilled: 0,
    bossSpawned: false,
    bossDefeated: false,
    portalOpen: false,
    curse: 0,
    greed: 0,
      stageStartTime: 0,
    chestsPaid: 0,
  }
  const stats: StatBlock = { ...BASE_STATS }
  const items = new Map<string, number>()
  const player = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    radius: 0.4,
    onGround: true,
    sliding: false,
    hp: 100,
    shield: 0,
    alive: true,
    hurt: () => 0,
    heal: (n: number) => {
      log.healed += n
    },
    refresh() {},
    update() {},
    dispose() {},
  }
  const enemies: Enemy[] = []
  let time = 0

  const world = {
    halfSize: 150,
    heightAt: () => 0,
    normalAt: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0),
    collide() {},
    spots: {
      chests: spots.chests ?? [],
      shrines: spots.shrines ?? [],
      pots: spots.pots ?? [],
      altar: spots.altar ?? new THREE.Vector3(0, 0, -120),
      playerStart: spots.playerStart ?? new THREE.Vector3(0, 0, 120),
    },
    update() {},
    dispose() {},
  }

  const noop = () => {}
  const ctx = {
    scene: new THREE.Scene(),
    rng: new Rng(seed),
    events,
    run,
    meta: {},
    settings: {},
    character: {},
    stage: STAGES[0],
    world,
    player,
    progression: {
      stats,
      items,
      addXp: (n: number) => {
        log.xp += n
      },
      rollShrineOffers: (golden = false): Offer[] => [
        { type: 'stat', rarity: golden ? 'legendary' : 'common', label: 'Damage', mods: [{ stat: 'damage', op: 'add', value: 0.08 }] },
        { type: 'stat', rarity: golden ? 'legendary' : 'rare', label: 'Luck', mods: [{ stat: 'luck', op: 'add', value: 0.098 }] },
        { type: 'stat', rarity: 'legendary', label: 'Size', mods: [{ stat: 'size', op: 'add', value: 0.2 }] },
      ],
      rollChestItem: (): Offer => ({ type: 'item', id: 'clover', rarity: 'rare' }),
      applyOffer: (o: Offer) => {
        log.applied.push(o)
      },
      recompute: () => {
        log.recomputes++
      },
    },
    pickups: {
      spawn: (kind: PickupKind, pos: THREE.Vector3, value: number) => {
        log.spawned.push({ kind, pos: pos.clone(), value })
      },
      magnetAll: () => {
        log.magnets++
      },
    },
    enemies: {
      queryRadius: (center: THREE.Vector3, radius: number, out: Enemy[]) => {
        for (const e of enemies) if (e.alive && e.pos.distanceTo(center) <= radius) out.push(e)
        return out
      },
      damage: (enemy: Enemy, amount: number, opts: DamageOptions) => {
        log.damage.push({ enemy, amount, opts })
      },
    },
    spawner: {
      spawnChallenge: (count: number, center: THREE.Vector3) => {
        log.challenges.push({ count, center })
        const foes: Enemy[] = []
        for (let i = 0; i < count; i++) foes.push(fakeEnemy(1000 + i, center.clone()))
        enemies.push(...foes)
        return foes
      },
      summonBoss: () => {
        log.bossesSummoned++
        run.bossSpawned = true
      },
    },
    fx: { burst: noop, ring: noop, shake: noop, flash: noop, number: noop },
    audio: {
      play: (id: SfxId) => {
        log.sounds.push(id)
      },
    },
    ui: {
      toast: (text: string) => {
        log.toasts.push(text)
      },
      banner: (text: string) => {
        log.banners.push(text)
      },
      openModal: (req: ModalRequest) => {
        log.modals.push(req)
        return Promise.resolve()
      },
    },
    addGold(amount: number, raw = false) {
      const delta = amount > 0 && !raw ? amount * stats.goldGain : amount
      run.gold = Math.max(0, run.gold + delta)
      events.emit('goldChanged', { gold: run.gold, delta })
    },
    get time() {
      return time
    },
    advanceStage() {
      log.advances++
    },
  } as unknown as GameContext

  return {
    ctx,
    log,
    run,
    stats,
    items,
    player,
    enemies,
    step(seconds, update, dt = 1 / 60) {
      const steps = Math.round(seconds / dt)
      for (let i = 0; i < steps; i++) {
        time += dt
        update(dt)
      }
    },
  }
}
