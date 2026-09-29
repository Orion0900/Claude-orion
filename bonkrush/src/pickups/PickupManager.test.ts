import * as THREE from 'three'
import { fakeContext, fakeEnemy } from './fakeContext'
import { PickupManager } from './PickupManager'

function setup() {
  const fake = fakeContext()
  const pickups = new PickupManager(fake.ctx)
  const step = (seconds: number) => fake.step(seconds, (dt) => pickups.update(dt))
  return { ...fake, pickups, step }
}

describe('PickupManager', () => {
  it('adds itself to the scene and removes itself on dispose', () => {
    const { ctx, pickups } = setup()
    expect(ctx.scene.children).toHaveLength(1)
    pickups.dispose()
    expect(ctx.scene.children).toHaveLength(0)
  })

  it('collects nearby XP after its pop-out hop and reports it', () => {
    const { pickups, log, step } = setup()
    pickups.spawn('xp', new THREE.Vector3(1.5, 0, 0), 3)
    expect(pickups.count).toBe(1)
    step(1.5)
    expect(pickups.count).toBe(0)
    expect(log.xp).toBe(3)
    expect(log.events).toContain('pickup')
    expect(log.sounds).toContain('xp')
  })

  it('leaves pickups outside the magnet radius alone', () => {
    const { pickups, log, step } = setup()
    pickups.spawn('xp', new THREE.Vector3(20, 0, 0), 1)
    step(3)
    expect(pickups.count).toBe(1)
    expect(log.xp).toBe(0)
  })

  it('reaches further with more pickup range', () => {
    const { pickups, stats, log, step } = setup()
    stats.pickupRange = 4
    pickups.spawn('xp', new THREE.Vector3(10, 0, 0), 1)
    step(3)
    expect(log.xp).toBe(1)
  })

  it('magnetAll pulls xp, gold and silver from anywhere, but not powerups', () => {
    const { pickups, log, run, step } = setup()
    pickups.spawn('xp', new THREE.Vector3(80, 0, 40), 2)
    pickups.spawn('gold', new THREE.Vector3(-90, 0, 10), 5)
    pickups.spawn('silver', new THREE.Vector3(0, 0, 100), 2)
    pickups.spawn('bomb', new THREE.Vector3(60, 0, 0), 1)
    step(0.5)
    pickups.magnetAll()
    step(8)
    expect(log.xp).toBe(2)
    expect(run.gold).toBe(5)
    expect(run.silver).toBe(2)
    expect(pickups.count).toBe(1)
  })

  it('applies goldGain to gold and silverGain to silver', () => {
    const { pickups, run, stats, step } = setup()
    stats.goldGain = 2
    stats.silverGain = 1.5
    pickups.spawn('gold', new THREE.Vector3(1, 0, 1), 3)
    pickups.spawn('silver', new THREE.Vector3(-1, 0, 1), 2)
    step(2)
    expect(run.gold).toBe(6)
    expect(run.silver).toBeCloseTo(3)
  })

  it('heals with health snacks', () => {
    const { pickups, log, step } = setup()
    pickups.spawn('health', new THREE.Vector3(1, 0, 0), 25)
    step(2)
    expect(log.healed).toBe(25)
  })

  it('magnet powerup vacuums the map and toasts', () => {
    const { pickups, log, step } = setup()
    pickups.spawn('xp', new THREE.Vector3(100, 0, 100), 1)
    pickups.spawn('magnet', new THREE.Vector3(1, 0, 0), 1)
    step(8)
    expect(log.toasts).toContain('Magnet!')
    expect(log.xp).toBe(1)
  })

  it('bomb hits every enemy within 10 m for 200 without procs', () => {
    const { pickups, log, enemies, step } = setup()
    const near = fakeEnemy(1, new THREE.Vector3(6, 0, 0))
    const far = fakeEnemy(2, new THREE.Vector3(30, 0, 0))
    enemies.push(near, far)
    pickups.spawn('bomb', new THREE.Vector3(1, 0, 0), 1)
    step(2)
    expect(log.damage).toHaveLength(1)
    expect(log.damage[0].enemy).toBe(near)
    expect(log.damage[0].amount).toBe(200)
    expect(log.damage[0].opts.source).toBe('bomb')
    expect(log.damage[0].opts.noProcs).toBe(true)
    expect(log.sounds).toContain('explode')
  })

  it('merges XP into existing gems past the cap without losing value', () => {
    const { pickups } = setup()
    const at = new THREE.Vector3(60, 0, 60)
    for (let i = 0; i < 1500; i++) pickups.spawn('xp', at, 1)
    expect(pickups.count).toBe(1500)
    for (let i = 0; i < 50; i++) pickups.spawn('xp', at, 2)
    expect(pickups.count).toBe(1500)
  })

  it('keeps every merged point of XP', () => {
    const { pickups, log, step } = setup()
    const at = new THREE.Vector3(60, 0, 60)
    for (let i = 0; i < 1510; i++) pickups.spawn('xp', at, 1)
    step(0.5)
    pickups.magnetAll()
    step(10)
    expect(log.xp).toBe(1510)
    expect(pickups.count).toBe(0)
  })

  it('ignores bad values', () => {
    const { pickups } = setup()
    pickups.spawn('xp', new THREE.Vector3(), NaN)
    pickups.spawn('gold', new THREE.Vector3(), 0)
    pickups.spawn('xp', new THREE.Vector3(NaN, 0, 0), 1)
    expect(pickups.count).toBe(0)
  })

  it('stays put while the player is dead', () => {
    const { pickups, player, log, step } = setup()
    player.alive = false
    pickups.spawn('xp', new THREE.Vector3(1, 0, 0), 1)
    step(2)
    expect(log.xp).toBe(0)
    expect(pickups.count).toBe(1)
  })

  it('clear() empties the map', () => {
    const { pickups } = setup()
    for (let i = 0; i < 10; i++) pickups.spawn('gold', new THREE.Vector3(i * 5, 0, 30), 1)
    pickups.clear()
    expect(pickups.count).toBe(0)
  })

  it('keeps pickups inside the map', () => {
    const { pickups, ctx, step } = setup()
    pickups.spawn('gold', new THREE.Vector3(500, 0, -500), 1)
    step(1)
    const mesh = ctx.scene.getObjectByName('pickup:gold') as THREE.InstancedMesh
    expect(mesh.count).toBe(1)
    const m = new THREE.Matrix4()
    mesh.getMatrixAt(0, m)
    const p = new THREE.Vector3().setFromMatrixPosition(m)
    expect(Math.abs(p.x)).toBeLessThanOrEqual(ctx.world.halfSize)
    expect(Math.abs(p.z)).toBeLessThanOrEqual(ctx.world.halfSize)
    expect(p.y).toBeGreaterThan(0)
  })

  it('draws each gem tier with its own mesh', () => {
    const { pickups, ctx, step } = setup()
    pickups.spawn('xp', new THREE.Vector3(50, 0, 0), 1)
    pickups.spawn('xp', new THREE.Vector3(50, 0, 5), 5)
    pickups.spawn('xp', new THREE.Vector3(50, 0, 10), 25)
    pickups.spawn('xp', new THREE.Vector3(50, 0, 15), 30)
    step(0.1)
    const count = (name: string) => (ctx.scene.getObjectByName(name) as THREE.InstancedMesh).count
    expect(count('pickup:xp0')).toBe(1)
    expect(count('pickup:xp1')).toBe(1)
    expect(count('pickup:xp2')).toBe(2)
    expect(count('pickup:gold')).toBe(0)
  })
})
