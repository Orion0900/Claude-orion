import * as THREE from 'three'
import { blocksSight, lensInside, measureProfile, placedReach, sightMargin, type PlacedProfile, type Sightline } from './occlusion'

/** A cone of radius 1 standing 2 m tall on y = 0, a slab 2 m wide (x), 0.2 m thick (z) and 1 m tall, and a 3 m pillar of radius 1. */
const cone = new THREE.ConeGeometry(1, 2, 16).translate(0, 1, 0).toNonIndexed()
const slab = new THREE.BoxGeometry(2, 1, 0.2).translate(0, 0.5, 0)
const pillar = new THREE.CylinderGeometry(1, 1, 3, 16).translate(0, 1.5, 0)

function placed(geo: THREE.BufferGeometry, x: number, z: number, extra: Partial<PlacedProfile> = {}): PlacedProfile {
  return { profile: measureProfile(geo, 8), x, y: 0, z, sx: 1, sy: 1, sz: 1, cos: 1, sin: 0, lean: 0, ...extra }
}

/** Eye 3 m up at z = 20, the player's body from 0.3 to 1.7 m at the origin: the view's floor drops 2.7 m over 20 m. */
const view: Sightline = { ex: 0, ey: 3, ez: 20, px: 0, pz: 0, low: 0.3, high: 1.7 }
const blocks = (p: PlacedProfile, s = view) => blocksSight(p, s, 0.3, 0, 2.5)

describe('measureProfile', () => {
  it('finds a cone narrowing band by band, its widest at each band floor', () => {
    const p = measureProfile(cone, 8)
    expect(p.top).toBeCloseTo(2, 6)
    for (let b = 0; b < 8; b++) {
      // The circle through the cone's 16 corners at the band's floor.
      expect(p.radii[b]).toBeCloseTo(1 - b / 8, 2)
      expect(p.boxes[b * 4 + 1]).toBeLessThanOrEqual(p.radii[b] + 1e-6)
    }
  })

  it('boxes a slab tightly along its own axes, where its circle is far looser', () => {
    const p = measureProfile(slab, 4)
    for (let b = 0; b < 4; b++) {
      expect(Array.from(p.boxes.slice(b * 4, b * 4 + 4))).toEqual([-1, 1, -0.1, 0.1].map((v) => expect.closeTo(v, 6)))
      expect(p.radii[b]).toBeCloseTo(Math.hypot(1, 0.1), 6)
    }
  })

  it('leaves the bands of a gap between two parts empty', () => {
    const floating = new THREE.BoxGeometry(1, 1, 1).translate(0, 3.5, 0)
    const p = measureProfile(floating, 8)
    expect(Array.from(p.radii.slice(0, 5))).toEqual([0, 0, 0, 0, 0])
    expect(p.radii[7]).toBeGreaterThan(0.7)
  })
})

describe('blocksSight', () => {
  it('catches a prop on the view, and one hiding only the legs', () => {
    expect(blocks(placed(cone, 0, 8))).toBe(true)
    // Just in front of the player the view is low: a 2 m cone there hides the lower body.
    expect(blocks(placed(cone, 0.9, 1.5))).toBe(true)
  })

  it('passes over a low prop nearer the camera, and beside a prop off the view', () => {
    // A quarter of the way along, the floor of the view is 2.3 m up; the cone is 2 m tall.
    expect(blocks(placed(cone, 0, 15))).toBe(false)
    expect(blocks(placed(cone, 1.5, 8))).toBe(false)
    expect(blocks(placed(cone, 1.3, 1.5))).toBe(false)
  })

  it('ignores props behind the player, even ones reaching back toward the body', () => {
    expect(blocks(placed(cone, 0, -2))).toBe(false)
    expect(blocks(placed(cone, 0, -1.4))).toBe(false)
  })

  it('turns the box with the prop: a slab edge-on beside the view stays clear, face-on it blocks', () => {
    // The slab's middle is 0.7 m off the view; edge-on, its face is 0.6 m clear.
    expect(blocks(placed(slab, 0.7, 2, { cos: 0, sin: 1 }))).toBe(false)
    expect(blocks(placed(slab, 0.7, 2))).toBe(true)
    // Its circle alone would have caught it either way.
    expect(placedReach(placed(slab, 0.7, 2)) + 0.3).toBeGreaterThan(0.7)
  })

  it('scales and leans with the prop', () => {
    expect(blocks(placed(cone, 1.3, 1.5, { sx: 1.5, sz: 1.5 }))).toBe(true)
    expect(blocks(placed(cone, 1.3, 1.5, { lean: 0.5 }))).toBe(true)
    // Squashed to 1 m tall, the cone on the view no longer reaches up into it.
    expect(blocks(placed(cone, 0, 8, { sy: 0.5 }))).toBe(false)
  })

  it('keeps clear whatever is in view right in front of the lens', () => {
    const low: Sightline = { ...view, ey: 1.2 }
    const nearLens = placed(pillar, 1.8, 18.8)
    expect(blocksSight(nearLens, low, 0.3, 0, 2.5)).toBe(false)
    expect(blocksSight(nearLens, low, 0.3, 1, 2.5)).toBe(true)
    // The same offset halfway along is left alone.
    expect(blocksSight(placed(pillar, 1.8, 10), low, 0.3, 1, 2.5)).toBe(false)
  })

  it('catches a camera inside a canopy', () => {
    expect(blocks(placed(cone, 0.2, 20), { ...view, ey: 1 })).toBe(true)
  })
})

describe('sightMargin', () => {
  it('opens into a cone past the lens and closes back to the margin', () => {
    expect(sightMargin(0, 0.3, 1, 2.5)).toBe(0.3)
    expect(sightMargin(1.25, 0.3, 1, 2.5)).toBeCloseTo(0.3 + 0.625, 9)
    expect(sightMargin(2.5, 0.3, 1, 2.5)).toBe(0.3)
    expect(sightMargin(6, 0.3, 1, 2.5)).toBe(0.3)
  })
})

describe('lensInside', () => {
  it('flags a prop the camera sits in or brushes against, and nothing further off', () => {
    // The eye is 3 m up at z = 20: a 3 m pillar there has the lens inside it.
    expect(lensInside(placed(pillar, 0, 20), view, 1.5)).toBe(true)
    // Within 1.5 m of its side, still too close to dither.
    expect(lensInside(placed(pillar, 2.2, 20), view, 1.5)).toBe(true)
    expect(lensInside(placed(pillar, 0, 15), view, 1.5)).toBe(false)
    // A low slab under the lens is well below it.
    expect(lensInside(placed(slab, 0, 20), view, 1.5)).toBe(false)
  })
})
