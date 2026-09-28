import * as THREE from 'three'
import { EventBus } from '../core/events'
import { Rng } from '../core/rng'
import type { CharacterDef, DamageOptions, Enemy, GameContext, GameEvents, Offer, PlayerApi, RunState } from '../game/types'
import { Progression } from './Progression'
import { xpToNext } from './xp'

// The weapons engineer owns the real list; these tests only need its shape.
vi.mock('../weapons/weaponDefs', () => ({ WEAPONS: [] }))

const character: CharacterDef = {
  id: 'test',
  name: 'Test',
  icon: '*',
  description: '',
  startWeapon: 'sword',
  passive: [{ stat: 'luck', op: 'add', value: 0.15 }],
  passiveText: '',
  colors: { body: '#fff', accent: '#fff', detail: '#fff' },
  model: 'fox',
  unlockCost: 0,
}

function makeCtx() {
  const events = new EventBus<GameEvents>()
  const run = { curse: 0, greed: 0, gold: 0 } as RunState
  /** One tough enemy for homing effects to find, and every hit it takes. */
  const target = { uid: 7, alive: true, pos: new THREE.Vector3(4, 0, 0), scale: 1, def: { radius: 0.5, height: 1 } } as Enemy
  const hits: Array<{ uid: number; opts: DamageOptions }> = []
  const player = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    onGround: true,
    hp: 0,
    healed: 0,
    refreshed: 0,
    heal(n: number) {
      this.healed += n
    },
    refresh() {
      this.refreshed++
    },
  }
  const toasts: string[] = []
  const ctx = {
    scene: new THREE.Scene(),
    rng: new Rng(42),
    events,
    run,
    character,
    time: 0,
    audio: { play() {} },
    ui: { toast: (t: string) => toasts.push(t), banner() {} },
    fx: { number() {}, burst() {}, ring() {}, flash() {}, shake() {} },
    enemies: {
      queryRadius: (_c: unknown, _r: number, out: Enemy[]) => out,
      nearest: () => (target.alive ? target : null),
      damage: (e: Enemy, _n: number, opts: DamageOptions) => hits.push({ uid: e.uid, opts }),
      applyFreeze() {},
      applySlow() {},
    },
    addGold(n: number) {
      run.gold += n
    },
  } as unknown as { -readonly [K in keyof GameContext]: GameContext[K] }
  const progression = new Progression(ctx)
  ctx.progression = progression
  ctx.player = player as unknown as PlayerApi
  return { ctx, progression, player, events, run, toasts, target, hits }
}

describe('Progression', () => {
  it('starts from the character passive', () => {
    const { progression } = makeCtx()
    expect(progression.stats.luck).toBeCloseTo(0.15)
    expect(progression.level).toBe(1)
    expect(progression.xpToNext).toBe(14)
  })

  it('levels up several times from one big XP gain', () => {
    const { progression, events } = makeCtx()
    const levels: number[] = []
    events.on('levelUp', ({ level }) => levels.push(level))
    progression.addXp(xpToNext(1) + xpToNext(2) + 1)
    expect(progression.level).toBe(3)
    expect(progression.pendingLevelUps).toBe(2)
    expect(levels).toEqual([2, 3])
    expect(progression.xp).toBeCloseTo(1)
  })

  it('level-up picks consume a pending level-up; items and boons do not', () => {
    const { progression } = makeCtx()
    progression.addXp(1000)
    const pending = progression.pendingLevelUps
    progression.applyOffer({ type: 'newTome', id: 'damage', rarity: 'legendary' })
    expect(progression.pendingLevelUps).toBe(pending - 1)
    expect(progression.stats.damage).toBeCloseTo(1.16)
    progression.applyOffer({ type: 'item', id: 'oats', rarity: 'common' })
    progression.applyOffer({ type: 'stat', rarity: 'common', mods: [{ stat: 'armor', op: 'add', value: 0.1 }], label: '' })
    expect(progression.pendingLevelUps).toBe(pending - 1)
    expect(progression.stats.maxHp).toBe(125)
    expect(progression.stats.armor).toBeCloseTo(0.1)
  })

  it('stacks items and toasts them', () => {
    const { progression, toasts, events } = makeCtx()
    const added: number[] = []
    events.on('itemAdded', ({ stacks }) => added.push(stacks))
    progression.addItem('protein_shake')
    progression.addItem('protein_shake', 2)
    expect(progression.items.get('protein_shake')).toBe(3)
    expect(progression.stats.damage).toBeCloseTo(1.3)
    expect(added).toEqual([1, 3])
    expect(toasts[0]).toBe('+ Protein Shake')
  })

  it('caps tomes at four slots', () => {
    const { progression } = makeCtx()
    for (const id of ['damage', 'luck', 'armor', 'regen', 'xp']) progression.applyOffer({ type: 'newTome', id, rarity: 'common' })
    expect(progression.tomes.map((t) => t.def.id)).toEqual(['damage', 'luck', 'armor', 'regen'])
  })

  it('skips pay 20% of the level as gold; banishes keep the level-up pending', () => {
    const { progression, run } = makeCtx()
    progression.addXp(xpToNext(1) + xpToNext(2))
    progression.skipLevelUp()
    expect(run.gold).toBe(Math.round(xpToNext(1) * 0.2))
    expect(progression.skips).toBe(2)
    const offer: Offer = { type: 'newTome', id: 'luck', rarity: 'common' }
    expect(progression.banish(offer)).toBe(true)
    expect(progression.pendingLevelUps).toBe(1)
    expect(progression.banishes).toBe(1)
    expect(progression.banish({ type: 'newTome', id: 'armor', rarity: 'common' })).toBe(true)
    expect(progression.banish({ type: 'newTome', id: 'regen', rarity: 'common' })).toBe(false)
    expect(progression.pendingLevelUps).toBe(1)
    for (let i = 0; i < 50; i++) progression.addXp(1000)
    for (let i = 0; i < 30; i++)
      for (const o of progression.rollLevelUpOffers()) expect(o.type === 'newTome' && o.id === 'luck').toBe(false)
  })

  it('rerolls run out', () => {
    const { progression } = makeCtx()
    expect([1, 2, 3, 4].map(() => progression.useReroll())).toEqual([true, true, true, false])
  })

  it('the stopwatch saves you once per stage', () => {
    const { progression, player, events } = makeCtx()
    expect(progression.tryCheatDeath()).toBe(false)
    progression.addItem('stopwatch')
    expect(progression.tryCheatDeath()).toBe(true)
    expect(player.hp).toBe(1)
    expect(progression.tryCheatDeath()).toBe(false)
    events.emit('stageCleared', { stageIndex: 0 })
    expect(progression.tryCheatDeath()).toBe(true)
  })

  it('folds the run curse and greed into difficulty once, on the next update', () => {
    const { progression, run } = makeCtx()
    run.curse = 0.15
    progression.update(0.016)
    expect(progression.stats.difficulty).toBeCloseTo(0.15)
    run.greed = 0.2
    progression.update(0.016)
    expect(progression.stats.difficulty).toBeCloseTo(0.35)
    progression.recompute()
    progression.recompute()
    expect(progression.stats.difficulty).toBeCloseTo(0.35)
    // A new stage lifts the curse; greed stays for the run.
    run.curse = 0
    progression.update(0.016)
    expect(progression.stats.difficulty).toBeCloseTo(0.2)
  })

  it('stops offering tomes, and shrine boons, for stats already at their cap', () => {
    const { progression } = makeCtx()
    progression.addXp(1e6)
    progression.applyOffer({ type: 'newTome', id: 'bloody', rarity: 'common' })
    let blood = 0
    for (let i = 0; i < 60; i++) for (const o of progression.rollLevelUpOffers()) if (o.type === 'tomeUpgrade' && o.id === 'bloody') blood++
    expect(blood).toBeGreaterThan(0)

    progression.addMods([{ stat: 'lifesteal', op: 'add', value: 10 }, { stat: 'evasion', op: 'add', value: 1 }], 'test')
    for (let i = 0; i < 60; i++) {
      for (const o of progression.rollLevelUpOffers()) expect(['bloody', 'evasion']).not.toContain('id' in o ? o.id : '')
      for (const o of progression.rollShrineOffers())
        if (o.type === 'stat') for (const m of o.mods) expect(['lifesteal', 'evasion']).not.toContain(m.stat)
    }
  })

  it('applies conditional damage items to outgoing hits', () => {
    const { progression, player } = makeCtx()
    const enemy = {
      pos: new THREE.Vector3(10, 0, 0),
      hp: 100,
      maxHp: 100,
      scale: 1,
      def: { radius: 0.5 },
    } as unknown as Enemy
    expect(progression.outgoingMultiplier(enemy)).toBe(1)
    progression.addItem('tactical_glasses')
    progression.addItem('scarf')
    expect(progression.outgoingMultiplier(enemy)).toBeCloseTo(1.25)
    player.onGround = false
    expect(progression.outgoingMultiplier(enemy)).toBeCloseTo(1.25 * 1.3)
    enemy.hp = 50
    expect(progression.outgoingMultiplier(enemy)).toBeCloseTo(1.3)
  })

  it('souls rise from weapon kills but not from kills by souls', () => {
    const { progression, events, hits } = makeCtx()
    progression.addItem('soul_reaper')
    const dead = { uid: 3, pos: new THREE.Vector3() } as Enemy
    events.emit('enemyKilled', { enemy: dead, source: 'item:soul_reaper' })
    for (let i = 0; i < 90; i++) progression.update(1 / 30)
    expect(hits).toHaveLength(0)
    events.emit('enemyKilled', { enemy: dead, source: 'sword' })
    for (let i = 0; i < 90; i++) progression.update(1 / 30)
    expect(hits).toMatchObject([{ uid: 7, opts: { source: 'item:soul_reaper', noProcs: true } }])
    progression.dispose()
  })

  it('builds the item effect pools with the run, hidden, and frees them on dispose', () => {
    const { ctx, progression } = makeCtx()
    const pools = ctx.scene.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh)
    expect(pools).toHaveLength(4)
    expect(pools.every((p) => !p.visible)).toBe(true)
    progression.dispose()
    expect(ctx.scene.children).toHaveLength(0)
  })

  it('lifesteal over 1 heals the whole part every hit and rolls the rest', () => {
    const { progression, player, events } = makeCtx()
    progression.addMods([{ stat: 'lifesteal', op: 'add', value: 1.3 }], 'test')
    expect(progression.stats.lifesteal).toBeCloseTo(1.3)
    const enemy = { alive: true } as Enemy
    const n = 2000
    let last = 0
    for (let i = 0; i < n; i++) {
      events.emit('enemyHit', { enemy, amount: 10, crit: false, source: 'sword', procs: true })
      expect([1, 2]).toContain(player.healed - last)
      last = player.healed
    }
    expect(player.healed / n).toBeGreaterThan(1.25)
    expect(player.healed / n).toBeLessThan(1.35)

    progression.addMods([{ stat: 'lifesteal', op: 'add', value: 10 }], 'test')
    expect(progression.stats.lifesteal).toBe(5)
    events.emit('enemyHit', { enemy, amount: 10, crit: false, source: 'sword', procs: true })
    expect(player.healed - last).toBe(5)
  })

  it('lifesteal heals on procced hits only', () => {
    const { progression, player, events } = makeCtx()
    progression.addMods([{ stat: 'lifesteal', op: 'add', value: 1 }], 'test')
    const enemy = { alive: true } as Enemy
    events.emit('enemyHit', { enemy, amount: 10, crit: false, source: 'sword', procs: false })
    expect(player.healed).toBe(0)
    events.emit('enemyHit', { enemy, amount: 10, crit: false, source: 'sword', procs: true })
    expect(player.healed).toBe(1)
  })
})
