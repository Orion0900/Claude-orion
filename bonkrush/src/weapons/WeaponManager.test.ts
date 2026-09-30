/**
 * Drives the real manager and every behavior headlessly against a fake
 * world and enemy list: three.js builds scenes and geometry fine without a
 * canvas, so this catches crashes, NaN transforms and leaks in node.
 */
import * as THREE from 'three'
import { EventBus } from '../core/events'
import { Rng } from '../core/rng'
import { STAGES } from '../data/stages'
import { ENEMIES } from '../enemies/enemyDefs'
import type { DamageOptions, DamageRoll, Enemy, EnemyDef, GameContext, GameEvents, StatBlock, Vec3 } from '../game/types'
import { BASE_STATS } from '../progression/stats'
import { WeaponKit, type Armed } from './kit'
import { WEAPONS } from './weaponDefs'
import { WeaponManager } from './WeaponManager'

const DT = 1 / 60

const ENEMY: EnemyDef = {
  id: 'dummy',
  name: 'Dummy',
  behavior: 'chaser',
  hp: 1e9,
  damage: 1,
  speed: 0,
  radius: 0.5,
  height: 1.2,
  xp: 1,
  gold: { chance: 0, min: 0, max: 0 },
  color: '#ffffff',
  accent: '#000000',
  model: 'dummy',
  weight: 0,
}

interface Hit {
  uid: number
  amount: number
  crit: boolean
  source: string
  kb: THREE.Vector3 | null
}

class FakeEnemies {
  list: Enemy[] = []
  hits: Hit[] = []
  /** Every radius asked of queryRadius, to check the broad phase isn't padded. */
  queried: number[] = []
  slowed = 0
  burned = 0
  frozen = 0
  private nextUid = 1

  constructor(private readonly events: EventBus<GameEvents>) {}

  get aliveCount(): number {
    return this.list.filter((e) => e.alive).length
  }

  readonly boss = null

  add(x: number, z: number, hp = ENEMY.hp, extra: Partial<Enemy> = {}, y = 0): Enemy {
    const e: Enemy = {
      uid: this.nextUid++,
      def: ENEMY,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      yaw: 0,
      hp,
      maxHp: hp,
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
      ...extra,
    }
    this.list.push(e)
    return e
  }

  spawn(): Enemy | null {
    return null
  }

  /** Same rule as EnemyManager: bodies overlapping the circle in XZ, with a height gate of max(radius, 2). */
  queryRadius(center: Vec3, radius: number, out: Enemy[]): Enemy[] {
    this.queried.push(radius)
    out.length = 0
    const vertical = Math.max(radius, 2)
    for (const e of this.list) {
      if (!e.alive) continue
      if (Math.hypot(e.pos.x - center.x, e.pos.z - center.z) > radius + e.def.radius * e.scale) continue
      const top = e.pos.y + e.def.height * e.scale
      const gap = center.y < e.pos.y ? e.pos.y - center.y : center.y > top ? center.y - top : 0
      if (gap <= vertical) out.push(e)
    }
    return out
  }

  nearest(pos: Vec3, maxDist: number, exclude?: ReadonlySet<number>): Enemy | null {
    let best: Enemy | null = null
    let bestD = maxDist
    for (const e of this.list) {
      if (!e.alive || exclude?.has(e.uid)) continue
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z)
      if (d <= bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  damage(e: Enemy, amount: number, opts: DamageOptions): void {
    if (!e.alive) return
    expect(Number.isFinite(amount)).toBe(true)
    // Copy: the weapon reuses its options and knockback vector between hits.
    this.hits.push({ uid: e.uid, amount, crit: !!opts.crit, source: opts.source, kb: opts.knockback?.clone() ?? null })
    e.hp -= amount
    this.events.emit('enemyHit', { enemy: e, amount, crit: !!opts.crit, source: opts.source, procs: true })
    if (e.hp <= 0) {
      e.alive = false
      this.events.emit('enemyKilled', { enemy: e, source: opts.source })
    }
  }

  applySlow(): void {
    this.slowed++
  }

  applyBurn(_e: Enemy, dps: number, seconds: number): void {
    expect(dps).toBeGreaterThan(0)
    expect(seconds).toBeGreaterThan(0)
    this.burned++
  }

  applyFreeze(): void {
    this.frozen++
  }

  clear(): void {
    this.list.length = 0
  }

  update(): void {}
  dispose(): void {}
}

interface Harness {
  ctx: GameContext
  scene: THREE.Scene
  enemies: FakeEnemies
  player: { pos: THREE.Vector3; vel: THREE.Vector3; yaw: number; alive: boolean }
  stats: StatBlock
  breakables: number
  sounds: string[]
  tick(frames: number, move?: boolean): void
}

function harness(): Harness {
  const scene = new THREE.Scene()
  const events = new EventBus<GameEvents>()
  const enemies = new FakeEnemies(events)
  const stats: StatBlock = { ...BASE_STATS }
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
    heal() {},
    refresh() {},
    update() {},
    dispose() {},
  }
  let time = 0
  const h: Harness = {
    scene,
    enemies,
    player,
    stats,
    breakables: 0,
    sounds: [],
    ctx: null as unknown as GameContext,
    tick(frames, move = false) {
      for (let i = 0; i < frames; i++) {
        time += DT
        if (move) {
          // Walk a slow circle through the crowd.
          const a = time * 0.8
          player.pos.set(Math.cos(a) * 4, 0, Math.sin(a) * 4)
          player.vel.set(-Math.sin(a) * 3.2, 0, Math.cos(a) * 3.2)
          player.yaw = Math.atan2(-player.vel.x, -player.vel.z)
        }
        h.ctx.weapons.update(DT)
      }
    },
  }
  h.ctx = {
    scene,
    renderer: null as unknown as THREE.WebGLRenderer,
    rng: new Rng(1234),
    events,
    run: {} as GameContext['run'],
    meta: {} as GameContext['meta'],
    settings: { quality: 'medium' } as GameContext['settings'],
    character: {} as GameContext['character'],
    stage: STAGES[0],
    world: {
      halfSize: 100,
      heightAt: (x: number) => Math.sin(x * 0.1) * 0.5,
      normalAt: (_x: number, _z: number, out: Vec3) => out.set(0, 1, 0),
      collide() {},
      spots: {} as GameContext['world']['spots'],
      update() {},
      dispose() {},
    },
    player: player as unknown as GameContext['player'],
    camera: {} as GameContext['camera'],
    input: {} as GameContext['input'],
    enemies: enemies as unknown as GameContext['enemies'],
    spawner: {} as GameContext['spawner'],
    weapons: null as unknown as GameContext['weapons'],
    pickups: {} as GameContext['pickups'],
    interactables: {
      hitBreakables: () => {
        h.breakables++
      },
    } as unknown as GameContext['interactables'],
    progression: { stats, outgoingMultiplier: () => 1 } as unknown as GameContext['progression'],
    fx: {
      burst() {},
      number() {},
      ring() {},
      shake() {},
      flash() {},
      shakeOffset: new THREE.Vector3(),
      update() {},
      clear() {},
      dispose() {},
    },
    audio: {
      play: (id: string) => {
        h.sounds.push(id)
      },
    } as unknown as GameContext['audio'],
    ui: {} as GameContext['ui'],
    addGold() {},
    get time() {
      return time
    },
    advanceStage() {},
  }
  ;(h.ctx as { weapons: GameContext['weapons'] }).weapons = new WeaponManager(h.ctx)
  return h
}

/** A crowd around the origin, near and far, in every direction. */
function crowd(h: Harness): void {
  for (let ring = 1; ring <= 5; ring++) {
    const r = ring * 2.4
    const n = 6 + ring * 3
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring
      h.enemies.add(Math.cos(a) * r, Math.sin(a) * r)
    }
  }
}

function expectFiniteInstances(scene: THREE.Scene): void {
  scene.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) {
      const m = o.instanceMatrix.array
      for (let i = 0; i < o.count * 16; i++) expect(Number.isFinite(m[i])).toBe(true)
    } else if (o instanceof THREE.Mesh) {
      const p = o.geometry.getAttribute('position').array
      for (let i = 0; i < p.length; i++) expect(Number.isFinite(p[i])).toBe(true)
    }
  })
}

describe('WeaponManager', () => {
  it.each(WEAPONS.map((w) => w.id))('%s fires, hits, and cleans up', (id) => {
    const h = harness()
    crowd(h)
    const w = h.ctx.weapons.add(id)
    expect(w).not.toBeNull()
    // Every mesh exists from the moment the weapon is added (so the shader prewarm sees it), hidden while empty.
    const meshes = h.scene.children.length
    for (const o of h.scene.children) if (o instanceof THREE.InstancedMesh) expect(o.visible).toBe(false)
    h.tick(360, true)
    expect(h.scene.children.length).toBe(meshes)

    const mine = h.enemies.hits.filter((x) => x.source === id)
    expect(mine.length).toBeGreaterThan(0)
    expect(w!.dealt).toBeCloseTo(
      mine.reduce((s, x) => s + x.amount, 0),
      3,
    )
    expect(h.breakables).toBeGreaterThan(0)
    expectFiniteInstances(h.scene)

    h.ctx.weapons.dispose()
    expect(h.scene.children.length).toBe(0)
    // Unsubscribed: later hits no longer count.
    const before = w!.dealt
    h.ctx.events.emit('enemyHit', { enemy: h.enemies.list[0], amount: 5, crit: false, source: id, procs: true })
    expect(w!.dealt).toBe(before)
  })

  it('applies the right status effects', () => {
    for (const [id, check] of [
      ['firestaff', (e: FakeEnemies) => e.burned],
      ['flamewalker', (e: FakeEnemies) => e.burned],
      ['frostwalker', (e: FakeEnemies) => e.slowed * e.frozen],
    ] as const) {
      const h = harness()
      crowd(h)
      h.ctx.weapons.add(id)
      h.tick(360, true)
      expect(check(h.enemies)).toBeGreaterThan(0)
      h.ctx.weapons.dispose()
    }
  })

  it('pushes enemies away with the sword and pulls them in with the twister', () => {
    const sword = harness()
    sword.enemies.add(0, -2)
    sword.ctx.weapons.add('sword')
    sword.tick(60)
    const push = sword.enemies.hits.find((x) => x.source === 'sword')
    expect(push?.kb?.z).toBeLessThan(0)

    const twister = harness()
    twister.enemies.add(0, -6)
    twister.ctx.weapons.add('tornado')
    twister.tick(120)
    const pulls = twister.enemies.hits.filter((x) => x.source === 'tornado' && x.kb)
    expect(pulls.length).toBeGreaterThan(0)
    // Some tick lands while the twister is still between the player and the enemy.
    expect(pulls.some((x) => x.kb!.z > 0)).toBe(true)
  })

  it('counts kills per weapon', () => {
    const h = harness()
    for (let i = 0; i < 10; i++) h.enemies.add(Math.cos(i) * 2, Math.sin(i) * 2, 1)
    const w = h.ctx.weapons.add('aura')!
    h.tick(30)
    expect(w.kills).toBeGreaterThan(0)
    expect(w.kills).toBe(h.enemies.list.filter((e) => !e.alive).length)
  })

  it('holds four weapons, no duplicates, no unknown ids', () => {
    const h = harness()
    const added: string[] = []
    h.ctx.events.on('weaponAdded', ({ id }) => added.push(id))
    const a = h.ctx.weapons.add('sword')
    expect(h.ctx.weapons.add('sword')).toBe(a)
    expect(h.ctx.weapons.add('nope')).toBeNull()
    h.ctx.weapons.add('bow')
    h.ctx.weapons.add('aura')
    h.ctx.weapons.add('mines')
    expect(h.ctx.weapons.add('dagger')).toBeNull()
    expect(h.ctx.weapons.owned.map((w) => w.def.id)).toHaveLength(4)
    expect(added).toEqual(['sword', 'bow', 'aura', 'mines'])
    expect(h.ctx.weapons.has('bow')).toBe(true)
    expect(h.ctx.weapons.has('dagger')).toBe(false)
    h.ctx.weapons.dispose()
  })

  it('upgrades add to the weapon and level it up', () => {
    const h = harness()
    const w = h.ctx.weapons.add('firestaff')!
    expect(w.stats).not.toBe(WEAPONS.find((d) => d.id === 'firestaff')!.base)
    h.ctx.weapons.upgrade('firestaff', { damage: 3, cooldown: -0.08 })
    expect(w.level).toBe(2)
    expect(w.stats.damage).toBe(17)
    expect(w.stats.cooldown).toBeCloseTo(1.32)
    h.stats.damage = 2
    h.stats.attackSpeed = 2
    const eff = h.ctx.weapons.effective(w)
    expect(eff.damage).toBe(34)
    expect(eff.cooldown).toBeCloseTo(0.66)
    h.ctx.weapons.dispose()
  })

  it('builds the shared effect pools up front, hidden', () => {
    const h = harness()
    const pools = h.scene.children.filter((o) => o instanceof THREE.InstancedMesh)
    expect(pools).toHaveLength(3)
    for (const o of pools) expect(o.visible).toBe(false)
    h.ctx.weapons.dispose()
    expect(h.scene.children).toHaveLength(0)
  })

  it('rolls crits, overcrits and elite damage', () => {
    const h = harness()
    const w = h.ctx.weapons.add('bow')!
    const plain = h.enemies.add(0, -5)
    const elite = h.enemies.add(0, -6, 100, { elite: true })

    h.stats.critChance = -1
    expect(h.ctx.weapons.rollDamage(w, plain)).toEqual({ amount: 13, crit: false })

    h.stats.critChance = 1
    expect(h.ctx.weapons.rollDamage(w, plain)).toEqual({ amount: 26, crit: true })

    h.stats.critChance = 2
    expect(h.ctx.weapons.rollDamage(w, plain).amount).toBe(52)

    h.stats.critChance = -1
    h.stats.eliteDamage = 1.5
    expect(h.ctx.weapons.rollDamage(w, elite).amount).toBeCloseTo(19.5)
    expect(h.ctx.weapons.rollDamage(w, plain).amount).toBe(13)
    // Minibosses carry neither flag but are elite-class all the same.
    const miniboss = h.enemies.add(0, -7, 100, { def: ENEMIES.scorpion_king })
    expect(h.ctx.weapons.rollDamage(w, miniboss).amount).toBeCloseTo(19.5)
    const boss = h.enemies.add(0, -8, 100, { boss: true })
    expect(h.ctx.weapons.rollDamage(w, boss).amount).toBeCloseTo(19.5)
    h.ctx.weapons.dispose()
  })

  it('folds in the item multiplier', () => {
    const h = harness()
    ;(h.ctx.progression as unknown as { outgoingMultiplier: () => number }).outgoingMultiplier = () => 1.25
    h.stats.critChance = -1
    const w = h.ctx.weapons.add('sword')!
    expect(h.ctx.weapons.rollDamage(w, h.enemies.add(0, -1)).amount).toBe(20)
    h.ctx.weapons.dispose()
  })

  it('stops firing while the player is dead', () => {
    const h = harness()
    crowd(h)
    h.ctx.weapons.add('aura')
    h.player.alive = false
    h.tick(120)
    expect(h.enemies.hits).toHaveLength(0)
    h.ctx.weapons.dispose()
  })

  it('drops everything in flight when the stage is cleared', () => {
    const h = harness()
    crowd(h)
    h.ctx.weapons.add('bow')
    h.ctx.weapons.add('mines')
    h.tick(90)
    h.ctx.events.emit('stageCleared', { stageIndex: 0 })
    h.enemies.clear()
    h.tick(1)
    h.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh && o.count > 0) {
        // Only freshly fired things (this frame) may be out; nothing from before survives.
        expect(o.count).toBeLessThanOrEqual(2)
      }
    })
    h.ctx.weapons.dispose()
  })
})

describe('WeaponKit queries', () => {
  const noDamage = { rollInto: (_arm: Armed, _e: Enemy, out: DamageRoll) => out }

  function kitHarness(): { h: Harness; kit: WeaponKit } {
    const h = harness()
    return { h, kit: new WeaponKit(h.ctx, noDamage, new Rng(7)) }
  }

  it('is exact at the edge of a body in XZ', () => {
    const { h, kit } = kitHarness()
    const inside = h.enemies.add(1.45, 0)
    h.enemies.add(1.55, 0)
    const out: Enemy[] = []
    // Probe 1 m plus the dummy's 0.5 m body.
    expect(kit.inRadius(new THREE.Vector3(), 1, 2, 3, out)).toBe(1)
    expect(out[0]).toBe(inside)
    kit.dispose()
  })

  it('reaches hovering fliers that a small probe would lose to the height gate', () => {
    const { h, kit } = kitHarness()
    const low = h.enemies.add(0.8, 0, ENEMY.hp, {}, 2.8)
    h.enemies.add(-0.8, 0, ENEMY.hp, {}, 3.3)
    const out: Enemy[] = []
    expect(kit.inRadius(new THREE.Vector3(), 0.5, 2, 3, out)).toBe(1)
    expect(out[0]).toBe(low)
    kit.dispose()

    // The aura's own radius (2.6 m) falls short of a 2.8 m hover too.
    const aura = harness()
    const flier = aura.enemies.add(1.5, 0, ENEMY.hp, {}, 2.8)
    aura.ctx.weapons.add('aura')
    aura.tick(30)
    expect(aura.enemies.hits.some((x) => x.uid === flier.uid)).toBe(true)
    aura.ctx.weapons.dispose()
  })

  it('never drops in the broad phase what the exact test would hit', () => {
    const { h, kit } = kitHarness()
    const rng = new Rng(99)
    const r = (lo: number, hi: number) => lo + rng.next() * (hi - lo)
    for (let i = 0; i < 80; i++) {
      const flier = rng.next() < 0.4
      h.enemies.add(r(-8, 8), r(-8, 8), ENEMY.hp, { scale: r(0.6, 4) }, flier ? r(1.5, 4.5) : r(-0.5, 0.5))
    }
    const gated = h.enemies.queryRadius.bind(h.enemies)
    const all = (_c: Vec3, _r: number, out: Enemy[]) => {
      out.length = 0
      for (const e of h.enemies.list) out.push(e)
      return out
    }
    const uids = (list: Enemy[]) => list.map((e) => e.uid).sort((a, b) => a - b)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const got: Enemy[] = []
    const want: Enemy[] = []
    let hits = 0
    for (let i = 0; i < 400; i++) {
      a.set(r(-6, 6), r(-1, 4), r(-6, 6))
      b.set(a.x + r(-2, 2), a.y + r(-3, 3), a.z + r(-2, 2))
      const size = r(0.05, 2.5)
      const below = r(0, 2.5)
      const above = r(0, 4.5)
      for (const [out, query] of [
        [got, gated],
        [want, all],
      ] as const) {
        h.enemies.queryRadius = query
        const n = i % 2 ? kit.sweep(a, b, size, null, out) : kit.inRadius(a, size, below, above, out)
        if (out === got) hits += n
      }
      expect(uids(got)).toEqual(uids(want))
    }
    expect(hits).toBeGreaterThan(50)
    kit.dispose()
  })

  it('reaches from the middle of a long, steep step to a flier at its far end', () => {
    const { h, kit } = kitHarness()
    const flier = h.enemies.add(0.1, 0, ENEMY.hp, {}, 3)
    const out: Enemy[] = []
    // The middle is 3 m under the flier's feet; the end of the step is within reach of them.
    expect(kit.sweep(new THREE.Vector3(0, -1.5, 0), new THREE.Vector3(0.1, 1.5, 0), 1.2, null, out)).toBe(1)
    expect(out[0]).toBe(flier)
    kit.dispose()
  })

  it('asks for no more than the probe needs', () => {
    const { h, kit } = kitHarness()
    const out: Enemy[] = []
    // An arrow's step: half its length plus its radius, with no fixed pad on top.
    kit.sweep(new THREE.Vector3(5, 1, 0), new THREE.Vector3(5, 1, -0.6), 0.3, null, out)
    expect(h.enemies.queried.at(-1)).toBeCloseTo(0.6, 5)
    kit.inRadius(new THREE.Vector3(), 4, 2, 3, out)
    expect(h.enemies.queried.at(-1)).toBe(4)
    kit.dispose()
  })
})
