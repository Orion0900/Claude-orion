import { computeLayout, laneAtPoint, scaleAt, xAt, yAt, zAtY } from './layout'

const none = { top: 0, right: 0, bottom: 0, left: 0 }
const iphonePortrait = computeLayout(390, 844, { top: 47, right: 0, bottom: 34, left: 0 })
const iphoneLandscape = computeLayout(844, 390, { top: 0, right: 47, bottom: 21, left: 47 })

describe('layout', () => {
  it('puts the strike line low and the far end high, in both orientations', () => {
    for (const l of [iphonePortrait, iphoneLandscape]) {
      expect(yAt(l, 0)).toBeCloseTo(l.strikeY)
      expect(yAt(l, 1)).toBeCloseTo(l.farY)
      expect(l.strikeY).toBeGreaterThan(l.height * 0.7)
      expect(l.farY).toBeLessThan(l.height * 0.2)
      expect(l.strikeY).toBeLessThan(l.height - l.insets.bottom)
    }
  })

  it('shrinks the far end and keeps notes growing as they approach', () => {
    const l = iphonePortrait
    expect(scaleAt(l, 1)).toBeCloseTo(0.3)
    expect(scaleAt(l, 0)).toBe(1)
    // Equal slices of time cover more screen the closer they are.
    expect(yAt(l, 0) - yAt(l, 0.1)).toBeGreaterThan(yAt(l, 0.9) - yAt(l, 1))
  })

  it('fits five thumb-sized lanes across a phone held upright', () => {
    expect(iphonePortrait.lane * 5).toBeLessThanOrEqual(390)
    expect(iphonePortrait.lane).toBeGreaterThan(70)
    expect(iphoneLandscape.lane).toBeGreaterThan(80)
  })

  it('maps touches back to lanes through the perspective', () => {
    const l = iphonePortrait
    for (let column = 0; column < 5; column++) {
      for (const z of [0, 0.4, 0.9]) {
        const x = xAt(l, column - 2, z)
        expect(laneAtPoint(l, x, yAt(l, z))).toBe(column)
      }
    }
    // Far outside the highway still means the edge lanes.
    expect(laneAtPoint(l, 0, l.strikeY)).toBe(0)
    expect(laneAtPoint(l, 389, l.strikeY)).toBe(4)
    expect(zAtY(l, yAt(l, 0.37))).toBeCloseTo(0.37)
  })

  it('leaves room beside the highway for the HUD', () => {
    for (const l of [iphonePortrait, iphoneLandscape, computeLayout(1024, 768, none)]) {
      expect(l.hud.width).toBeGreaterThanOrEqual(90)
      expect(l.hud.leftX - l.hud.width / 2).toBeGreaterThanOrEqual(l.insets.left)
      expect(l.hud.rightX + l.hud.width / 2).toBeLessThanOrEqual(l.width - l.insets.right + 1)
      const half = 2.5 * l.lane * scaleAt(l, zAtY(l, l.hud.y))
      expect(l.hud.leftX + l.hud.width / 2).toBeLessThanOrEqual(l.cx - half + 1)
    }
  })
})
