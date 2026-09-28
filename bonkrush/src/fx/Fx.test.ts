import * as THREE from 'three'
import type { GameContext } from '../game/types'
import { Fx } from './Fx'
import { Particles } from './Particles'
import { Rings } from './Rings'

const WHITE = new THREE.Color(1, 1, 1)

function allFinite(values: ArrayLike<number>, count: number): boolean {
  for (let i = 0; i < count; i++) if (!Number.isFinite(values[i])) return false
  return true
}

describe('Particles', () => {
  it('bursts, falls onto the ground and dies out', () => {
    const scene = new THREE.Scene()
    const particles = new Particles(scene)
    expect(scene.children).toContain(particles.mesh)
    particles.emit(0, 2, 0, 0, WHITE, 30, 8, 0.2)
    expect(particles.count).toBe(30)
    expect(particles.mesh.count).toBe(30)
    for (let i = 0; i < 30; i++) particles.update(1 / 60)
    const m = particles.mesh.instanceMatrix.array
    expect(allFinite(m, particles.count * 16)).toBe(true)
    // Nothing sinks through the floor (y is the 14th element of each matrix).
    for (let i = 0; i < particles.count; i++) expect(m[i * 16 + 13]).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < 120; i++) particles.update(1 / 60)
    expect(particles.count).toBe(0)
    expect(particles.mesh.count).toBe(0)
  })

  it('keeps colours with their particles when the dead are swapped out', () => {
    const particles = new Particles(new THREE.Scene())
    particles.emit(0, 1, 0, 0, new THREE.Color(1, 0, 0), 20, 5, 0.2)
    particles.emit(0, 1, 0, 0, new THREE.Color(0, 0, 1), 20, 5, 0.2)
    const colors = particles.mesh.instanceColor!.array
    for (let step = 0; step < 50 && particles.count > 0; step++) {
      particles.update(1 / 60)
      for (let i = 0; i < particles.count; i++) {
        const red = colors[i * 3] > 0
        const blue = colors[i * 3 + 2] > 0
        expect(red !== blue).toBe(true)
      }
    }
  })

  it('recycles slots when the pool is full', () => {
    const particles = new Particles(new THREE.Scene())
    for (let i = 0; i < 30; i++) particles.emit(0, 1, 0, 0, WHITE, 80, 5, 0.2)
    expect(particles.count).toBe(2000)
    particles.update(1 / 60)
    expect(allFinite(particles.mesh.instanceMatrix.array, particles.count * 16)).toBe(true)
  })

  it('does nothing while paused, clears and leaves the scene on dispose', () => {
    const scene = new THREE.Scene()
    const particles = new Particles(scene)
    particles.emit(0, 1, 0, 0, WHITE, 10, 5, 0.2)
    const before = Array.from(particles.mesh.instanceMatrix.array.slice(0, 160))
    particles.update(0)
    expect(Array.from(particles.mesh.instanceMatrix.array.slice(0, 160))).toEqual(before)
    particles.clear()
    expect(particles.mesh.count).toBe(0)
    particles.dispose()
    expect(scene.children).not.toContain(particles.mesh)
  })
})

describe('Rings', () => {
  it('grows, fades and expires', () => {
    const scene = new THREE.Scene()
    const rings = new Rings(scene)
    rings.spawn(1, 2, 3, new THREE.Quaternion(), 4, WHITE, 0.5)
    const alpha = rings.mesh.geometry.getAttribute('instanceAlpha')
    const first = alpha.getX(0)
    const m = new THREE.Matrix4()
    const scale = new THREE.Vector3()
    rings.mesh.getMatrixAt(0, m)
    scale.setFromMatrixScale(m)
    const startRadius = scale.x
    rings.update(0.25)
    rings.mesh.getMatrixAt(0, m)
    scale.setFromMatrixScale(m)
    expect(scale.x).toBeGreaterThan(startRadius)
    expect(scale.x).toBeLessThanOrEqual(4)
    expect(alpha.getX(0)).toBeLessThan(first)
    rings.update(0.3)
    expect(rings.count).toBe(0)
    rings.dispose()
    expect(scene.children).not.toContain(rings.mesh)
  })

  it('replaces the oldest ring when full', () => {
    const rings = new Rings(new THREE.Scene())
    for (let i = 0; i < 64; i++) rings.spawn(i, 0, 0, new THREE.Quaternion(), 2, WHITE, 1 + i)
    rings.update(0.5)
    rings.spawn(999, 0, 0, new THREE.Quaternion(), 2, WHITE, 1)
    expect(rings.count).toBe(64)
    const m = new THREE.Matrix4()
    rings.mesh.getMatrixAt(0, m)
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBe(999)
  })
})

describe('Fx', () => {
  function makeCtx(settings: Partial<GameContext['settings']> = {}) {
    const scene = new THREE.Scene()
    const world = {
      heightAt: () => 1,
      normalAt: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0),
    }
    const ctx = {
      scene,
      renderer: { domElement: {} },
      world,
      settings: { showDamageNumbers: true, screenShake: true, quality: 'medium', ...settings },
    } as unknown as GameContext
    return { ctx, scene }
  }

  it('works without a DOM and tolerates junk input', () => {
    const { ctx } = makeCtx()
    const fx = new Fx(ctx, {} as HTMLElement)
    const pos = new THREE.Vector3(0, 2, 0)
    expect(() => {
      fx.burst(pos, '#ff0000', 12)
      fx.burst(pos, 'not a colour', Number.NaN)
      fx.burst(new THREE.Vector3(Number.NaN, 0, 0), '#fff', 5)
      fx.burst(pos, '#fff', 5, Infinity, -1)
      fx.ring(pos, 3, '#00ff00')
      fx.ring(pos, Infinity, '#00ff00')
      fx.number(pos, '12', 'damage')
      fx.flash('#ff0000', 1)
      fx.shake(Number.NaN)
      fx.update(1 / 60)
      fx.update(0)
      fx.clear()
      fx.dispose()
      fx.burst(pos, '#fff', 5)
      fx.update(1 / 60)
    }).not.toThrow()
  })

  it('shakes with trauma, settles, and stays still when shake is off', () => {
    const { ctx } = makeCtx()
    const fx = new Fx(ctx, {} as HTMLElement)
    fx.shake(1)
    fx.update(1 / 60)
    expect(fx.shakeOffset.length()).toBeGreaterThan(0)
    expect(fx.shakeOffset.length()).toBeLessThan(1.1)
    const held = fx.shakeOffset.clone()
    fx.update(0)
    expect(fx.shakeOffset.equals(held)).toBe(true)
    for (let i = 0; i < 90; i++) fx.update(1 / 60)
    expect(fx.shakeOffset.length()).toBe(0)

    const off = makeCtx({ screenShake: false })
    const still = new Fx(off.ctx, {} as HTMLElement)
    still.shake(1)
    still.update(1 / 60)
    expect(still.shakeOffset.length()).toBe(0)
  })

  it('halves bursts on low quality', () => {
    const count = (quality: 'low' | 'high') => {
      const { ctx, scene } = makeCtx({ quality })
      const fx = new Fx(ctx, {} as HTMLElement)
      fx.burst(new THREE.Vector3(0, 2, 0), '#fff', 20)
      const mesh = scene.getObjectByName('fx-particles') as THREE.InstancedMesh
      return mesh.count
    }
    expect(count('high')).toBe(20)
    expect(count('low')).toBe(10)
  })

  it('lays rings on the ground and removes its meshes on dispose', () => {
    const { ctx, scene } = makeCtx()
    const fx = new Fx(ctx, {} as HTMLElement)
    fx.ring(new THREE.Vector3(3, 40, 3), 2, '#fff')
    const rings = scene.getObjectByName('fx-rings') as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    rings.getMatrixAt(0, m)
    const y = new THREE.Vector3().setFromMatrixPosition(m).y
    expect(y).toBeGreaterThan(1)
    expect(y).toBeLessThan(1.5)
    fx.dispose()
    expect(scene.getObjectByName('fx-rings')).toBeUndefined()
    expect(scene.getObjectByName('fx-particles')).toBeUndefined()
  })
})
