import * as THREE from 'three'
import { STAGES } from '../data/stages'
import { ColliderGrid } from './colliders'
import { buildPools } from './glow'
import { propSpec } from './propSpecs'
import { FADE_TIME, PropLayer, tilesFor } from './props'
import type { PropGroup, PropInstance } from './scatter'
import { HeightField } from './terrain'

const field = new HeightField(110, 1)

function inst(x: number, z: number, collider?: number, variant = 0): PropInstance {
  return { x, y: 0, z, yaw: 0, leanX: 0, leanZ: 0, sx: 1, sy: 1, sz: 1, scale: 1, variant, collider }
}

/** A pine on the camera's line of sight, a rock beside the path, a low rock under it and a far-away oak. */
function scene() {
  const pines: PropGroup = { kind: 'pine', solid: true, spec: propSpec('pine'), instances: [inst(0, 10, 0)] }
  const rocks: PropGroup = { kind: 'rock', solid: true, spec: propSpec('rock'), instances: [inst(9, 12, 1), inst(0, 4, 2)] }
  const oaks: PropGroup = { kind: 'oak', solid: true, spec: propSpec('oak'), instances: [inst(-60, -60, 3)] }
  const circles = [pines, rocks, oaks].flatMap((g) => g.instances.map((p) => ({ x: p.x, z: p.z, r: g.spec.radius })))
  const grid = new ColliderGrid(circles, field.halfSize)
  const root = new THREE.Group()
  const layer = new PropLayer(root, [pines, rocks, oaks], [], field, STAGES[0].palette, grid)
  return { root, layer }
}

describe('PropLayer see-through', () => {
  const eye = new THREE.Vector3(0, 4.5, 20)
  const player = new THREE.Vector3(0, 1, 0)

  it('fades a solid prop between the camera and the player, over FADE_TIME', () => {
    const { layer } = scene()
    layer.updateOcclusion(FADE_TIME / 2, eye, player)
    expect(layer.fadeOf(0)).toBeCloseTo(0.5, 5)
    layer.updateOcclusion(FADE_TIME, eye, player)
    expect(layer.fadeOf(0)).toBe(1)
    // And it stays put while the view stays blocked.
    for (let k = 0; k < 5; k++) {
      layer.updateOcclusion(1 / 60, eye, player)
      expect(layer.fadeOf(0)).toBe(1)
    }
    // Beside the line, under it, or far away: left alone.
    expect(layer.fadeOf(1)).toBe(0)
    expect(layer.fadeOf(2)).toBe(0)
    expect(layer.fadeOf(3)).toBe(0)
  })

  it('writes the fade into the instance attribute the shader reads', () => {
    const { root, layer } = scene()
    layer.updateOcclusion(1, eye, player)
    const faded = root.children
      .filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh)
      .map((m) => m.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute)
      .filter((a) => Array.from(a.array).some((v) => v === 1))
    expect(faded.length).toBe(1)
    expect(faded[0].version).toBeGreaterThan(0)
  })

  it('eases back in once the view is clear, and with no camera at all', () => {
    const { layer } = scene()
    layer.updateOcclusion(1, eye, player)
    const aside = new THREE.Vector3(20, 4.5, 0)
    layer.updateOcclusion(FADE_TIME / 2, aside, player)
    expect(layer.fadeOf(0)).toBeCloseTo(0.5, 5)
    layer.updateOcclusion(1, aside, player)
    expect(layer.fadeOf(0)).toBe(0)
    layer.updateOcclusion(1, eye, player)
    layer.updateOcclusion(1, null, null)
    expect(layer.fadeOf(0)).toBe(0)
  })

  it('also clears props hugging the lens, which would fill the screen', () => {
    const { layer } = scene()
    // The rock at (9, 12) is 2 m beside the line, just past a camera at (7.8, 14): out of the
    // player's way, but right against the lens.
    layer.updateOcclusion(1, new THREE.Vector3(7.8, 1.2, 14), new THREE.Vector3(-5, 1, -10))
    expect(layer.fadeOf(1)).toBe(1)
    // The same rock as far from the line, but halfway along it, is left alone.
    layer.updateOcclusion(1, new THREE.Vector3(19.47, 1.2, 35.88), new THREE.Vector3(-5, 1, -10))
    expect(layer.fadeOf(1)).toBe(0)
  })

  it('does not change while paused (dt = 0)', () => {
    const { layer } = scene()
    layer.updateOcclusion(0, eye, player)
    expect(layer.fadeOf(0)).toBe(0)
  })
})

describe('PropLayer tiles', () => {
  it('splits big batches into quadrants and small ones not at all; shadow tiles only for big casters', () => {
    expect(tilesFor(500)).toEqual({ view: 1, shadow: 0 })
    expect(tilesFor(3000).view).toBe(1)
    expect(tilesFor(3000).shadow).toBe(4)
    expect(tilesFor(20000)).toEqual({ view: 2, shadow: 4 })
  })

  it('bounds each tile tightly, draws shadow-only tiles in the shadow pass alone, and gives every mesh a fade', () => {
    const spots = [-90, -40, 40, 90]
    const pines: PropGroup = {
      kind: 'pine',
      solid: false,
      spec: propSpec('pine'),
      instances: spots.flatMap((x) => spots.flatMap((z) => Array.from({ length: 12 }, (_, k) => inst(x + k * 0.5, z)))),
    }
    const root = new THREE.Group()
    const shadow = new THREE.Frustum()
    new PropLayer(root, [pines], [], field, STAGES[0].palette, null, shadow)
    const meshes = root.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh)
    const visible = meshes.filter((m) => !m.castShadow)
    const casters = meshes.filter((m) => m.castShadow)
    expect(visible.length).toBe(4)
    expect(casters.length).toBe(16)
    expect(visible.reduce((n, m) => n + m.count, 0)).toBe(pines.instances.length)
    expect(casters.reduce((n, m) => n + m.count, 0)).toBe(pines.instances.length)
    for (const m of meshes) {
      expect(m.boundingBox).not.toBeNull()
      expect(m.boundingBox!.max.x - m.boundingBox!.min.x).toBeLessThan(60)
      const fade = m.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute
      expect(fade.count).toBe(m.count)
    }
    // Shadow tiles only answer to the shadow frustum; everything passes a frustum that holds the whole map.
    const everything = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().makeOrthographic(-500, 500, 500, -500, -500, 500))
    shadow.copy(everything)
    for (const m of casters) {
      expect(m.intersectsFrustum(everything)).toBe(false)
      expect(m.intersectsFrustum(shadow)).toBe(true)
    }
    for (const m of visible) expect(m.intersectsFrustum(everything)).toBe(true)
  })

  it('removes every mesh it made on dispose', () => {
    const { root, layer } = scene()
    expect(root.children.length).toBeGreaterThan(0)
    layer.dispose()
    expect(root.children.length).toBe(0)
  })
})

describe('buildPools', () => {
  it('drapes each pool over the ground, brightest in the middle and gone at the rim, facing up', () => {
    const hill = new HeightField(20, 1)
    for (let j = 0; j < hill.size; j++) for (let i = 0; i < hill.size; i++) hill.heights[j * hill.size + i] = hill.coord(i) * 0.2
    const g = buildPools(
      [
        { x: 2, z: 3, radius: 4, strength: 0.6, color: '#ffc05a' },
        { x: -5, z: 1, radius: 2, strength: 0.3, color: '#ff9d2e' },
      ],
      hill,
    )
    const pos = g.getAttribute('position')
    const col = g.getAttribute('color')
    expect(col.itemSize).toBe(4)
    const perPool = pos.count / 2
    expect(pos.getY(0)).toBeCloseTo(hill.heightAt(2, 3) + 0.05, 5)
    expect(col.getW(0)).toBeCloseTo(0.6)
    expect(col.getW(perPool - 1)).toBe(0)
    for (let v = 0; v < pos.count; v++) expect(pos.getY(v)).toBeCloseTo(hill.heightAt(pos.getX(v), pos.getZ(v)) + 0.05, 5)
    const index = g.getIndex()!
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    for (let t = 0; t < index.count; t += 3) {
      a.fromBufferAttribute(pos, index.getX(t))
      b.fromBufferAttribute(pos, index.getX(t + 1))
      c.fromBufferAttribute(pos, index.getX(t + 2))
      expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0)
    }
    g.dispose()
  })
})
