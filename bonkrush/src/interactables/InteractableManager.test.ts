import * as THREE from 'three'
import type { Enemy } from '../game/types'
import { fakeContext, fakeEnemy } from '../pickups/fakeContext'
import { InteractableManager } from './InteractableManager'
import { SHRINE_COUNTS } from './rules'

const spots = () => ({
  chests: Array.from({ length: 30 }, (_, i) => new THREE.Vector3(-120 + i * 8, 0, 60)),
  shrines: Array.from({ length: 24 }, (_, i) => new THREE.Vector3(-115 + i * 10, 0, -60)),
  pots: Array.from({ length: 40 }, (_, i) => new THREE.Vector3(-117 + i * 6, 0, 0)),
  altar: new THREE.Vector3(0, 0, -120),
  playerStart: new THREE.Vector3(0, 0, 120),
})

function setup(seed = 1) {
  const fake = fakeContext(spots(), seed)
  fake.player.pos.set(0, 0, 120)
  const things = new InteractableManager(fake.ctx)
  const step = (seconds: number) => fake.step(seconds, (dt) => things.update(dt))
  const find = (kind: string, n = 0) => things.markers.filter((m) => m.kind === kind)[n]
  const standAt = (pos: THREE.Vector3, dx = 1) => {
    fake.player.pos.set(pos.x + dx, pos.y, pos.z)
    step(1 / 60)
  }
  return { ...fake, things, step, find, standAt }
}

const instances = (scene: THREE.Scene, name: string) => (scene.getObjectByName(name) as THREE.InstancedMesh).count

describe('InteractableManager layout', () => {
  it('places 26 chests, the design shrine mix and the altar', () => {
    const { things } = setup()
    const count = (kind: string) => things.markers.filter((m) => m.kind === kind).length
    expect(count('chest')).toBe(26)
    for (const [kind, n] of Object.entries(SHRINE_COUNTS)) expect(count(kind)).toBe(n)
    expect(count('altar')).toBe(1)
    expect(count('portal')).toBe(0)
    expect(things.markers.every((m) => !m.used)).toBe(true)
  })

  it('draws 40 pots, some of them silver', () => {
    const { ctx, step } = setup()
    step(1 / 60)
    expect(instances(ctx.scene, 'pot') + instances(ctx.scene, 'pot:silver')).toBe(40)
  })

  it('shows no prompt far from everything', () => {
    const { things, step } = setup()
    step(0.1)
    expect(things.prompt).toBeNull()
  })

  it('cleans up the scene and its listeners on dispose', () => {
    const { ctx, things } = setup()
    const before = things.markers.length
    things.dispose()
    expect(ctx.scene.children).toHaveLength(0)
    ctx.events.emit('bossKilled', { enemy: fakeEnemy(1) })
    expect(things.markers.length).toBe(before)
  })
})

describe('chests', () => {
  it('asks for gold when the player is broke', () => {
    const { things, find, standAt, log } = setup()
    standAt(find('chest').pos)
    expect(things.prompt).toEqual({ text: 'Open chest', cost: 25 })
    things.interact()
    expect(log.toasts).toContain('Need 25 gold')
    expect(log.sounds).toContain('uiMove')
    expect(log.events).not.toContain('chestOpened')
    expect(find('chest').used).toBe(false)
  })

  it('charges gold, gives the item, shows the reveal and raises the price', () => {
    const { things, find, standAt, log, run } = setup()
    run.gold = 100
    const chest = find('chest')
    standAt(chest.pos)
    things.interact()
    expect(run.gold).toBe(75)
    expect(chest.used).toBe(true)
    expect(log.applied).toEqual([{ type: 'item', id: 'clover', rarity: 'rare' }])
    expect(log.events).toContain('chestOpened')
    expect(log.modals[0]).toEqual({ kind: 'chest', offer: { type: 'item', id: 'clover', rarity: 'rare' } })
    expect(things.chestCost).toBe(34)
    // An opened chest no longer takes the prompt.
    expect(things.prompt).toBeNull()
  })

  it('opens for free with enough Rusty Keys and keeps the price', () => {
    const { things, find, standAt, log, run, items } = setup()
    items.set('key', 1e7)
    standAt(find('chest').pos)
    things.interact()
    expect(run.gold).toBe(0)
    expect(log.events).toContain('chestOpened')
    expect(things.chestCost).toBe(25)
  })

  it('rolls the key once per chest, so mashing Interact never rerolls it', () => {
    const { things, find, standAt, log, items } = setup()
    items.set('key', 1e-9)
    standAt(find('chest').pos)
    for (let i = 0; i < 50; i++) things.interact()
    expect(log.events).not.toContain('chestOpened')
    items.set('key', 1e7)
    things.interact()
    expect(log.events).not.toContain('chestOpened')
  })

  it('reward chests are free, drop in, and then take the prompt', () => {
    const { things, standAt, step, log, run } = setup()
    const at = new THREE.Vector3(40, 0, 100)
    things.spawnChest(at, true)
    const chest = things.markers[things.markers.length - 1]
    expect(chest.kind).toBe('chest')
    expect(chest.golden).toBe(true)
    standAt(chest.pos)
    step(1)
    expect(things.prompt).toEqual({ text: 'Open chest' })
    things.interact()
    expect(run.gold).toBe(0)
    expect(log.events).toContain('chestOpened')
    expect(things.chestCost).toBe(25)
  })

  it('never stacks reward chests on top of each other', () => {
    const { things } = setup()
    const at = new THREE.Vector3(40, 0, 100)
    for (let i = 0; i < 4; i++) things.spawnChest(at, true)
    const spawned = things.markers.filter((m) => m.kind === 'chest').slice(-4)
    for (let i = 0; i < spawned.length; i++)
      for (let j = i + 1; j < spawned.length; j++)
        expect(spawned[i].pos.distanceTo(spawned[j].pos)).toBeGreaterThan(1.5)
  })

  it('caps the number of chests', () => {
    const { things } = setup()
    for (let i = 0; i < 200; i++) things.spawnChest(new THREE.Vector3((i % 20) * 6 - 60, 0, 100 + Math.floor(i / 20) * 4), false)
    expect(things.markers.filter((m) => m.kind === 'chest').length).toBe(96)
  })
})

describe('shrines', () => {
  it('charge shrines fill while standing in the ring and then offer boons', () => {
    const { things, find, standAt, step, log } = setup()
    const shrine = find('shrineCharge')
    standAt(shrine.pos, 0.5)
    step(1.5)
    expect(things.prompt?.text).toMatch(/^Charging… (49|50)%$/)
    expect(log.modals).toHaveLength(0)
    step(1.6)
    expect(shrine.used).toBe(true)
    expect(log.events).toContain('shrineUsed')
    expect(log.sounds).toContain('shrine')
    expect(log.modals[0].kind).toBe('shrine')
  })

  it('drains when the player steps out', () => {
    const { find, standAt, step, player, log } = setup()
    const shrine = find('shrineCharge')
    standAt(shrine.pos, 0.5)
    step(2)
    player.pos.set(shrine.pos.x, 0, shrine.pos.z + 5.5)
    step(1.5)
    standAt(shrine.pos, 0.5)
    step(1.5)
    expect(log.modals).toHaveLength(0)
    step(1.6)
    expect(log.modals).toHaveLength(1)
  })

  it('charges faster with the Wrench', () => {
    const { find, standAt, step, log, items } = setup()
    items.set('wrench', 5)
    standAt(find('shrineCharge').pos, 0.5)
    step(1.3)
    expect(log.modals).toHaveLength(1)
  })

  it('golden shrines always offer legendary boons', () => {
    let seed = 1
    let game = setup(seed)
    while (!game.things.markers.some((m) => m.kind === 'shrineCharge' && m.golden) && seed < 50) game = setup(++seed)
    const golden = game.things.markers.find((m) => m.kind === 'shrineCharge' && m.golden)!
    expect(golden).toBeDefined()
    game.standAt(golden.pos, 0.5)
    game.step(3.2)
    const modal = game.log.modals[0]
    if (modal.kind !== 'shrine') throw new Error('expected a shrine modal')
    expect(modal.offers.every((o) => o.rarity === 'legendary')).toBe(true)
  })

  it('greed pays 40 raw gold and adds curse', () => {
    const { things, find, standAt, run, stats, log } = setup()
    stats.goldGain = 3
    const shrine = find('shrineGreed')
    standAt(shrine.pos)
    expect(things.prompt?.text).toBe('Greed shrine: +40 gold, +8% difficulty')
    things.interact()
    expect(run.gold).toBe(40)
    expect(run.curse).toBeCloseTo(0.08)
    expect(shrine.used).toBe(true)
    expect(log.events).toContain('shrineUsed')
    things.interact()
    expect(run.gold).toBe(40)
  })

  it('magnet shrine vacuums the map once', () => {
    const { things, find, standAt, log } = setup()
    standAt(find('shrineMagnet').pos)
    expect(things.prompt?.text).toBe('Magnet shrine')
    things.interact()
    things.interact()
    expect(log.magnets).toBe(1)
  })

  it('challenge shrine rewards a free chest once every foe is dead', () => {
    const { things, find, standAt, step, log, enemies } = setup()
    const shrine = find('shrineChallenge')
    standAt(shrine.pos)
    expect(things.prompt?.text).toBe('Challenge shrine')
    const chestsBefore = things.markers.filter((m) => m.kind === 'chest').length
    things.interact()
    expect(log.challenges).toEqual([{ count: 6, center: expect.any(THREE.Vector3) }])
    step(1)
    expect(things.markers.filter((m) => m.kind === 'chest').length).toBe(chestsBefore)
    enemies.forEach((e: Enemy, i) => {
      if (i < enemies.length - 1) e.alive = false
    })
    step(0.1)
    expect(things.markers.filter((m) => m.kind === 'chest').length).toBe(chestsBefore)
    // A pooled enemy object reused for a new enemy counts as dead too.
    ;(enemies[enemies.length - 1] as { uid: number }).uid = 99999
    step(0.1)
    const chests = things.markers.filter((m) => m.kind === 'chest')
    expect(chests.length).toBe(chestsBefore + 1)
    expect(chests[chests.length - 1].golden).toBe(true)
    expect(log.toasts.some((t) => t.startsWith('Challenge complete'))).toBe(true)
  })

  it('challenge shrine stays unused when the horde has no room for it', () => {
    const { things, find, standAt, step, ctx, log } = setup()
    ctx.spawner.spawnChallenge = () => []
    const shrine = find('shrineChallenge')
    const chestsBefore = things.markers.filter((m) => m.kind === 'chest').length
    standAt(shrine.pos)
    things.interact()
    step(0.5)
    expect(shrine.used).toBe(false)
    expect(log.events).not.toContain('shrineUsed')
    expect(things.markers.filter((m) => m.kind === 'chest').length).toBe(chestsBefore)
  })

  it('curse shrines add difficulty and an extra boss chest', () => {
    const { things, find, standAt, run, ctx } = setup()
    standAt(find('shrineCurse', 0).pos)
    things.interact()
    standAt(find('shrineCurse', 1).pos)
    things.interact()
    expect(run.curse).toBeCloseTo(0.3)
    const before = things.markers.filter((m) => m.kind === 'chest').length
    const boss = fakeEnemy(7, new THREE.Vector3(30, 0, 30))
    boss.boss = true
    ctx.events.emit('bossKilled', { enemy: boss })
    const after = things.markers.filter((m) => m.kind === 'chest')
    expect(after.length).toBe(before + 3)
    expect(after.slice(-3).every((c) => c.golden)).toBe(true)
    // The debt is paid: the next boss only drops its own chest.
    ctx.events.emit('bossKilled', { enemy: boss })
    expect(things.markers.filter((m) => m.kind === 'chest').length).toBe(before + 4)
  })

  it('curse chests also pay out on a miniboss', () => {
    const { things, find, standAt, ctx } = setup()
    standAt(find('shrineCurse').pos)
    things.interact()
    const before = things.markers.filter((m) => m.kind === 'chest').length
    ctx.events.emit('enemyKilled', { enemy: fakeEnemy(3, new THREE.Vector3(20, 0, 20), 'stone_golem'), source: 'sword' })
    expect(things.markers.filter((m) => m.kind === 'chest').length).toBe(before + 1)
    ctx.events.emit('enemyKilled', { enemy: fakeEnemy(4, new THREE.Vector3(20, 0, 20), 'stone_golem'), source: 'sword' })
    expect(things.markers.filter((m) => m.kind === 'chest').length).toBe(before + 1)
  })
})

describe('pots', () => {
  it('break from weapon hits in radius and drop loot', () => {
    const { things, ctx, step, log } = setup(4)
    step(1 / 60)
    const total = () => instances(ctx.scene, 'pot') + instances(ctx.scene, 'pot:silver')
    // Pots sit every 6 m along z = 0 from x = -117.
    for (let i = 0; i < 40; i++) things.hitBreakables(new THREE.Vector3(-117 + i * 6, 0.5, 0), 1)
    step(1 / 60)
    expect(total()).toBe(0)
    const kinds = new Set(log.spawned.map((s) => s.kind))
    expect(kinds.has('gold')).toBe(true)
    expect(log.spawned.every((s) => ['gold', 'xp', 'health', 'silver'].includes(s.kind))).toBe(true)
  })

  it('only break inside the radius', () => {
    const { things, ctx, step } = setup()
    step(1 / 60)
    const total = () => instances(ctx.scene, 'pot') + instances(ctx.scene, 'pot:silver')
    things.hitBreakables(new THREE.Vector3(-117, 0.5, 0), 1)
    step(1 / 60)
    expect(total()).toBe(39)
    things.hitBreakables(new THREE.Vector3(-117, 0.5, 0), 1)
    things.hitBreakables(new THREE.Vector3(-114, 0.5, 0), 1)
    step(1 / 60)
    expect(total()).toBe(39)
  })

  it('break when the player walks into them', () => {
    const { ctx, step, player } = setup()
    step(1 / 60)
    player.pos.set(-111.3, 0, 0)
    step(1 / 60)
    step(1 / 60)
    expect(instances(ctx.scene, 'pot') + instances(ctx.scene, 'pot:silver')).toBe(39)
  })
})

describe('altar and portal', () => {
  it('summons the boss once', () => {
    const { things, find, standAt, log } = setup()
    const altar = find('altar')
    standAt(altar.pos, 2)
    expect(things.prompt?.text).toBe('Summon the boss')
    things.interact()
    things.interact()
    expect(log.bossesSummoned).toBe(1)
    expect(altar.used).toBe(true)
    expect(things.prompt).toBeNull()
  })

  it('drops a free chest where the boss died, clear of the portal', () => {
    const { things, ctx } = setup()
    const boss = fakeEnemy(9, new THREE.Vector3(50, 0, 90))
    boss.boss = true
    ctx.events.emit('bossKilled', { enemy: boss })
    things.openPortal(boss.pos.clone())
    const chest = things.markers.filter((m) => m.kind === 'chest').pop()!
    const portal = things.markers.find((m) => m.kind === 'portal')!
    expect(chest.golden).toBe(true)
    expect(chest.pos.distanceTo(portal.pos)).toBeGreaterThan(3)
  })

  it('opens the portal and advances once when the player walks in', () => {
    const { things, ctx, step, player, log } = setup()
    const at = new THREE.Vector3(10, 0, 110)
    things.openPortal(at)
    things.openPortal(at)
    expect(log.events.filter((e) => e === 'portalOpened')).toHaveLength(1)
    expect(log.banners).toContain('PORTAL OPEN')
    expect(things.markers.filter((m) => m.kind === 'portal')).toHaveLength(1)
    step(1)
    expect(log.advances).toBe(0)
    player.pos.set(10.5, 0, 110)
    step(0.5)
    expect(log.advances).toBe(1)
    step(1)
    things.interact()
    expect(log.advances).toBe(1)
    expect(ctx.scene.getObjectByName('portal')).toBeDefined()
  })

  it('does not swallow a player standing on it when it opens', () => {
    const { things, step, player, log } = setup()
    player.pos.set(10, 0, 110)
    things.openPortal(new THREE.Vector3(10, 0, 110))
    step(2)
    expect(log.advances).toBe(0)
    expect(things.prompt?.text).toBe('Enter the portal')
    things.interact()
    expect(log.advances).toBe(1)
  })

  it('reset() rebuilds a fresh layout', () => {
    const { things, find, standAt, run } = setup()
    run.gold = 100
    standAt(find('chest').pos)
    things.interact()
    things.openPortal(new THREE.Vector3(10, 0, 110))
    things.reset()
    expect(things.markers.some((m) => m.used)).toBe(false)
    expect(things.markers.some((m) => m.kind === 'portal')).toBe(false)
    expect(things.chestCost).toBe(25)
  })
})
