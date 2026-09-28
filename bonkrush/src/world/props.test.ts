import * as THREE from 'three'
import { STAGES } from '../data/stages'
import { ColliderGrid } from './colliders'
import { buildPools } from './glow'
import { propSpec } from './propSpecs'
import { FADE_SLOTS, FADE_TIME, PropLayer, tilesFor } from './props'
import type { PropGroup, PropInstance } from './scatter'
import { HeightField } from './terrain'

const field = new HeightField(110, 1)

function inst(x: number, z: number, collider?: number, variant = 0, yaw = 0): PropInstance {
  return { x, y: 0, z, yaw, leanX: 0, leanZ: 0, sx: 1, sy: 1, sz: 1, scale: 1, variant, collider }
}

/** Colliders are numbered in group order, as `scatterProps` does. */
function layer(groups: PropGroup[]) {
  const circles = groups.flatMap((g) => g.instances.map((p) => ({ x: p.x, z: p.z, r: g.spec.radius })))
  const grid = new ColliderGrid(circles, field.halfSize)
  const root = new THREE.Group()
  return { root, layer: new PropLayer(root, groups, [], field, STAGES[0].palette, grid) }
}

const meshesOf = (root: THREE.Group) => root.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh)
/** The see-through meshes carry the fade; the tiles don't. */
const seeThrough = (root: THREE.Group) => meshesOf(root).filter((m) => m.geometry.getAttribute('aFade'))
const scaleAt = (mesh: THREE.InstancedMesh, i: number) => new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, i * 16).getMaxScaleOnAxis()

/**
 * The camera 4.5 m up at z = 20 looking at the player at the origin: a pine on the view, a rock
 * beside it, a rock the view passes over, a rock just in front of the player hiding the legs, and a
 * far-away oak.
 */
function scene() {
  const pines: PropGroup = { kind: 'pine', solid: true, spec: propSpec('pine'), instances: [inst(0, 10, 0)] }
  const rocks: PropGroup = { kind: 'rock', solid: true, spec: propSpec('rock'), instances: [inst(9, 12, 1), inst(0, 15, 2), inst(0.6, 2, 3)] }
  const oaks: PropGroup = { kind: 'oak', solid: true, spec: propSpec('oak'), instances: [inst(-60, -60, 4)] }
  return layer([pines, rocks, oaks])
}

describe('PropLayer see-through', () => {
  const eye = new THREE.Vector3(0, 4.5, 20)
  const feet = new THREE.Vector3(0, 0, 0)

  it('fades the solid props between the camera and the player, over FADE_TIME', () => {
    const { layer } = scene()
    layer.updateOcclusion(FADE_TIME / 2, eye, feet)
    expect(layer.fadeOf(0)).toBeCloseTo(0.5, 5)
    layer.updateOcclusion(FADE_TIME, eye, feet)
    expect(layer.fadeOf(0)).toBe(1)
    // And it stays put while the view stays blocked.
    for (let k = 0; k < 5; k++) {
      layer.updateOcclusion(1 / 60, eye, feet)
      expect(layer.fadeOf(0)).toBe(1)
    }
    // The low rock just in front of the player hides the legs.
    expect(layer.fadeOf(3)).toBe(1)
    // Beside the view, under it, or far away: left alone.
    expect(layer.fadeOf(1)).toBe(0)
    expect(layer.fadeOf(2)).toBe(0)
    expect(layer.fadeOf(4)).toBe(0)
  })

  it('leaves a tree alone when the view passes under its canopy', () => {
    const oaks: PropGroup = { kind: 'oak', solid: true, spec: propSpec('oak'), instances: [inst(2.2, 5, 0)] }
    const { layer: l } = layer([oaks])
    // A low camera: the view runs from 1.6 m down to the player, under the canopy (which starts at 1.8 m).
    l.updateOcclusion(1, new THREE.Vector3(0, 1.6, 10), feet)
    expect(l.fadeOf(0)).toBe(0)
    // From high up the canopy is in the way.
    l.updateOcclusion(1, new THREE.Vector3(0, 6, 10), feet)
    expect(l.fadeOf(0)).toBe(1)
  })

  it('draws a fading prop from a see-through copy, and puts it back once it has faded in', () => {
    const { root, layer } = scene()
    const copies = seeThrough(root)
    // One per batch of solids (pines, both rock variants in use, oaks), hidden while nothing fades.
    expect(copies.length).toBeGreaterThan(0)
    for (const m of copies) expect(m.visible).toBe(false)
    const pineTile = meshesOf(root).find((m) => !m.geometry.getAttribute('aFade') && m.count === 1 && scaleAt(m, 0) > 0.5)!
    const rest = new THREE.Matrix4().fromArray(pineTile.instanceMatrix.array, 0)

    layer.updateOcclusion(FADE_TIME / 2, eye, feet)
    const shown = copies.filter((m) => m.visible)
    expect(shown.length).toBe(2)
    for (const m of shown) {
      expect(m.count).toBe(1)
      expect((m.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute).array[0]).toBeCloseTo(0.5, 5)
    }
    // The pine's own instance is scaled to nothing while its copy stands in for it.
    const pineCopy = shown.find((m) => new THREE.Matrix4().fromArray(m.instanceMatrix.array, 0).equals(rest))
    expect(pineCopy).toBeDefined()
    expect(scaleAt(pineTile, 0)).toBe(0)

    layer.updateOcclusion(1, new THREE.Vector3(20, 4.5, 0), new THREE.Vector3(0, 0, 40))
    expect(layer.fadeOf(0)).toBe(0)
    for (const m of copies) expect(m.visible).toBe(false)
    expect(new THREE.Matrix4().fromArray(pineTile.instanceMatrix.array, 0).equals(rest)).toBe(true)
  })

  it('keeps the dithering shader off the tiles: a discard would cost every prop its early depth test', () => {
    const { root } = scene()
    const lambert = THREE.ShaderLib.lambert
    for (const m of meshesOf(root)) {
      const shader = { vertexShader: lambert.vertexShader, fragmentShader: lambert.fragmentShader, uniforms: {} }
      const mat = m.material as THREE.Material
      mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer)
      expect(shader.fragmentShader.includes('discard')).toBe(!!m.geometry.getAttribute('aFade'))
    }
  })

  it('fades a crypt and its glowing windows together', () => {
    const crypts: PropGroup = { kind: 'crypt', solid: true, spec: propSpec('crypt'), instances: [inst(0, 10, 0)] }
    const { root, layer: l } = layer([crypts])
    l.updateOcclusion(1, eye, feet)
    const shown = seeThrough(root).filter((m) => m.visible)
    expect(shown.length).toBe(2)
    expect(shown[0].geometry.getAttribute('aFade')).toBe(shown[1].geometry.getAttribute('aFade'))
  })

  it('leaves the rest of a crowd solid once a batch runs out of see-through slots', () => {
    const wall: PropGroup = {
      kind: 'pine',
      solid: true,
      spec: propSpec('pine'),
      instances: Array.from({ length: FADE_SLOTS + 6 }, (_, k) => inst(((k % 6) - 2.5) * 0.4, 5 + Math.floor(k / 6) * 1.5, k)),
    }
    const { root, layer: l } = layer([wall])
    l.updateOcclusion(1, eye, feet)
    const faded = wall.instances.filter((p) => l.fadeOf(p.collider!) === 1).length
    expect(faded).toBe(FADE_SLOTS)
    expect(seeThrough(root)[0].count).toBe(FADE_SLOTS)
  })

  it('eases back in once the view is clear, and with no camera at all', () => {
    const { layer } = scene()
    layer.updateOcclusion(1, eye, feet)
    const aside = new THREE.Vector3(20, 4.5, 0)
    layer.updateOcclusion(FADE_TIME / 2, aside, feet)
    expect(layer.fadeOf(0)).toBeCloseTo(0.5, 5)
    layer.updateOcclusion(1, aside, feet)
    expect(layer.fadeOf(0)).toBe(0)
    layer.updateOcclusion(1, eye, feet)
    layer.updateOcclusion(1, null, null)
    expect(layer.fadeOf(0)).toBe(0)
  })

  it('also clears props in view right in front of the lens, which would fill the screen', () => {
    const { layer } = scene()
    // Looking down -z, the rock at (9, 12) is 1.6 m beside the view and a metre in front of a low camera:
    // right against the lens, so it clears completely rather than dithering over the whole view.
    layer.updateOcclusion(1, new THREE.Vector3(10.6, 1.2, 13), new THREE.Vector3(10.6, 0, -10))
    expect(layer.fadeOf(1)).toBeGreaterThan(1)
    // As far beside the view, but halfway along it, it is left alone.
    layer.updateOcclusion(1, new THREE.Vector3(10.6, 1.2, 24), new THREE.Vector3(10.6, 0, 0))
    expect(layer.fadeOf(1)).toBe(0)
  })

  it('does not change while paused (dt = 0)', () => {
    const { layer } = scene()
    layer.updateOcclusion(0, eye, feet)
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

  it('bounds each tile tightly, draws shadow-only tiles in the shadow pass alone, with no see-through copies for props that cannot fade', () => {
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
      expect(m.geometry.getAttribute('aFade')).toBeUndefined()
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
