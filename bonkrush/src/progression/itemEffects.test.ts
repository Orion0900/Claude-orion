import * as THREE from 'three'
import { EventBus } from '../core/events'
import { Rng } from '../core/rng'
import type { DamageOptions, Enemy, GameContext, GameEvents } from '../game/types'
import { BASE_STATS } from './stats'
import { ITEM_HOOKS, isBossClass, itemRuntime } from './itemEffects'
import { soulCount } from './itemMath'

function enemy(uid: number, x: number, z: number, extra: Partial<Enemy> = {}): Enemy {
  return {
    uid,
    def: { radius: 0.5, height: 1.2, behavior: 'chaser' },
    pos: new THREE.Vector3(x, 0, z),
    vel: new THREE.Vector3(),
    hp: 100,
    maxHp: 100,
    scale: 1,
    elite: false,
    boss: false,
    alive: true,
    freeze: 0,
    slow: 0,
    ...extra,
  } as unknown as Enemy
}

/** A stage-1 miniboss: neither elite nor boss by its flags. */
function golem(uid: number, x: number, z: number): Enemy {
  return enemy(uid, x, z, { def: { id: 'stone_golem', radius: 1, height: 3, behavior: 'tank' } as Enemy['def'] })
}

/** `onKill` stands in for Progression, which passes every kill's source on to the held items. */
function makeCtx(enemies: Enemy[], onKill?: (e: Enemy, source: string) => void) {
  const hits: Array<{ uid: number; amount: number; opts: DamageOptions }> = []
  const frozen: number[] = []
  const slowed: number[] = []
  const stats = { ...BASE_STATS }
  const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), onGround: true, hp: 0, heal() {} }
  const within = (c: THREE.Vector3, r: number, e: Enemy) => Math.hypot(e.pos.x - c.x, e.pos.z - c.z) <= r
  const ctx = {
    scene: new THREE.Scene(),
    rng: new Rng(3),
    events: new EventBus<GameEvents>(),
    time: 0,
    player,
    progression: { stats, recompute() {} },
    world: { heightAt: () => 0 },
    audio: { play() {} },
    ui: { banner() {} },
    fx: { ring() {}, burst() {}, number() {}, flash() {}, shake() {} },
    pickups: { spawn() {}, magnetAll() {} },
    enemies: {
      queryRadius(c: THREE.Vector3, r: number, out: Enemy[]) {
        out.length = 0
        for (const e of enemies) if (e.alive && within(c, r, e)) out.push(e)
        return out
      },
      nearest(p: THREE.Vector3, max: number, exclude?: ReadonlySet<number>) {
        let best: Enemy | null = null
        let bestD = max
        for (const e of enemies) {
          if (!e.alive || exclude?.has(e.uid)) continue
          const d = p.distanceTo(e.pos)
          if (d <= bestD) {
            best = e
            bestD = d
          }
        }
        return best
      },
      damage(e: Enemy, amount: number, opts: DamageOptions) {
        hits.push({ uid: e.uid, amount, opts })
        e.hp -= amount
        if (e.hp > 0 || !e.alive) return
        e.alive = false
        onKill?.(e, opts.source)
      },
      applyFreeze: (e: Enemy) => frozen.push(e.uid),
      applySlow: (e: Enemy) => slowed.push(e.uid),
      applyBurn() {},
    },
  } as unknown as GameContext
  return { ctx, hits, frozen, slowed, player }
}

describe('item effects', () => {
  it('souls home in on the nearest enemy and hit it without procs', () => {
    const target = enemy(1, 6, 0)
    const { ctx, hits } = makeCtx([target])
    const rt = itemRuntime(ctx)
    ITEM_HOOKS.soul_reaper.onKill(ctx, enemy(99, 0, 0), 3)
    for (let i = 0; i < 120 && hits.length < 2; i++) rt.update(1 / 30)
    expect(hits).toHaveLength(2)
    for (const h of hits) expect(h.opts).toMatchObject({ source: 'item:soul_reaper', noProcs: true })
    rt.dispose()
  })

  it('kills made by souls release no more souls, so one kill cannot chain through a horde', () => {
    const horde = Array.from({ length: 12 }, (_, i) => enemy(i + 1, 2 + (i % 4) * 2, Math.floor(i / 4) * 2, { hp: 10, maxHp: 10 }))
    const stacks = 3
    let ctx: GameContext | null = null
    const made = makeCtx(horde, (e, source) => ITEM_HOOKS.soul_reaper.onKill(ctx!, e, stacks, source))
    ctx = made.ctx
    const rt = itemRuntime(ctx)
    ITEM_HOOKS.soul_reaper.onKill(ctx, enemy(99, 0, 0), stacks, 'sword')
    for (let i = 0; i < 300; i++) rt.update(1 / 30)
    const soulHits = made.hits.filter((h) => h.opts.source === 'item:soul_reaper')
    expect(soulHits).toHaveLength(soulCount(stacks))
    expect(horde.filter((e) => !e.alive)).toHaveLength(soulCount(stacks))
    rt.dispose()
  })

  it('souls still rise from kills by weapons and other items', () => {
    const target = enemy(1, 6, 0, { hp: 1e6, maxHp: 1e6 })
    const { ctx, hits } = makeCtx([target])
    const rt = itemRuntime(ctx)
    ITEM_HOOKS.soul_reaper.onKill(ctx, enemy(98, 0, 0), 1, 'item:storm_orb')
    ITEM_HOOKS.soul_reaper.onKill(ctx, enemy(99, 0, 0), 1, 'item:soul_reaper')
    for (let i = 0; i < 120; i++) rt.update(1 / 30)
    expect(hits).toHaveLength(1)
    rt.dispose()
  })

  it('toxic clouds tick damage on enemies inside them', () => {
    const inside = enemy(1, 1, 0, { hp: 1e6, maxHp: 1e6 })
    const outside = enemy(2, 20, 0)
    const { ctx, hits } = makeCtx([inside, outside])
    const rt = itemRuntime(ctx)
    ITEM_HOOKS.toxic_barrel.onPlayerDamaged(ctx, 10, 1)
    for (let i = 0; i < 60; i++) rt.update(1 / 30)
    const dealt = hits.filter((h) => h.uid === 1).reduce((s, h) => s + h.amount, 0)
    expect(hits.some((h) => h.uid === 2)).toBe(false)
    // 10 dps for about two seconds.
    expect(dealt).toBeGreaterThan(15)
    expect(dealt).toBeLessThan(25)
    rt.dispose()
  })

  it('cactus spikes hit enemies around the player only', () => {
    const near = enemy(1, 2, 2)
    const far = enemy(2, 30, 0)
    const { ctx, hits } = makeCtx([near, far])
    ITEM_HOOKS.cactus.onPlayerDamaged(ctx, 5, 2)
    expect(hits.map((h) => h.uid)).toEqual([1])
    expect(hits[0].amount).toBe(30)
    expect(hits[0].opts.knockback).toBeDefined()
    itemRuntime(ctx).dispose()
  })

  it('storm orb lightning chains to two more enemies, never the same one twice', () => {
    const list = [enemy(1, 0, 0, { hp: 1e6 }), enemy(2, 3, 0, { hp: 1e6 }), enemy(3, 6, 0, { hp: 1e6 }), enemy(4, 9, 0, { hp: 1e6 })]
    const { ctx, hits } = makeCtx(list)
    itemRuntime(ctx).lightning(list[0], 10, 2)
    expect(hits.map((h) => h.uid)).toEqual([1, 2, 3])
    itemRuntime(ctx).dispose()
  })

  it('the stopwatch freezes nearby enemies, slows bosses and leaves the player at 1 HP', () => {
    const list = [enemy(1, 3, 0), enemy(2, 5, 0, { boss: true }), enemy(3, 80, 0)]
    const { ctx, frozen, slowed, player } = makeCtx(list)
    itemRuntime(ctx).triggerStopwatch()
    expect(player.hp).toBe(1)
    expect(frozen).toEqual([1])
    expect(slowed).toEqual([2])
    itemRuntime(ctx).dispose()
  })

  it('the stopwatch slows minibosses instead of freezing them', () => {
    const { ctx, frozen, slowed } = makeCtx([golem(1, 3, 0), enemy(2, 4, 0, { elite: true })])
    itemRuntime(ctx).triggerStopwatch()
    expect(slowed).toEqual([1])
    expect(frozen).toEqual([2])
    itemRuntime(ctx).dispose()
  })

  it('ice cube slows bosses and minibosses, and freezes the rest', () => {
    const list = [golem(1, 0, 0), enemy(2, 0, 0, { boss: true }), enemy(3, 0, 0, { elite: true })]
    const { ctx, frozen, slowed } = makeCtx(list)
    for (const e of list) for (let i = 0; i < 200; i++) ITEM_HOOKS.ice_cube.onHit(ctx, e, 10, false, 50)
    expect(new Set(slowed)).toEqual(new Set([1, 2]))
    expect(new Set(frozen)).toEqual(new Set([3]))
    itemRuntime(ctx).dispose()
  })

  it('tells bosses and minibosses from normal and elite enemies', () => {
    expect(isBossClass(golem(1, 0, 0))).toBe(true)
    expect(isBossClass(enemy(2, 0, 0, { boss: true }))).toBe(true)
    expect(isBossClass(enemy(3, 0, 0, { def: { behavior: 'boss' } as Enemy['def'] }))).toBe(true)
    expect(isBossClass(enemy(4, 0, 0, { elite: true }))).toBe(false)
    expect(isBossClass(enemy(5, 0, 0))).toBe(false)
  })

  it("reaper's dagger executes elites but never a miniboss", () => {
    const elite = enemy(1, 0, 0, { elite: true, hp: 1e6, maxHp: 1e6 })
    const mini = golem(2, 0, 0)
    const { ctx, hits } = makeCtx([elite, mini])
    for (let i = 0; i < 2000; i++) ITEM_HOOKS.reaper_dagger.onHit(ctx, mini, 10, false, 50)
    expect(hits).toHaveLength(0)
    for (let i = 0; i < 2000 && elite.alive; i++) ITEM_HOOKS.reaper_dagger.onHit(ctx, elite, 10, false, 50)
    expect(hits).toMatchObject([{ uid: 1, opts: { source: 'item:reaper_dagger', noProcs: true } }])
    expect(elite.alive).toBe(false)
    itemRuntime(ctx).dispose()
  })

  it("reaper's dagger never executes a boss", () => {
    const boss = enemy(1, 0, 0, { boss: true })
    const { ctx, hits } = makeCtx([boss])
    for (let i = 0; i < 2000; i++) ITEM_HOOKS.reaper_dagger.onHit(ctx, boss, 10, false, 50)
    expect(hits).toHaveLength(0)
    itemRuntime(ctx).dispose()
  })

  it('builds its effect pools up front, hidden, so a shader prewarm sees them', () => {
    const { ctx } = makeCtx([])
    const rt = itemRuntime(ctx)
    const meshes = ctx.scene.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh)
    expect(meshes).toHaveLength(4)
    for (const m of meshes) expect(m.visible).toBe(false)
    rt.dispose()
    expect(ctx.scene.children).toHaveLength(0)
  })

  it('builds no GPU objects after it is disposed', () => {
    const { ctx } = makeCtx([enemy(1, 3, 0)])
    const rt = itemRuntime(ctx)
    rt.dispose()
    ITEM_HOOKS.soul_reaper.onKill(ctx, enemy(9, 0, 0), 1)
    expect(ctx.scene.children).toHaveLength(0)
  })
})
