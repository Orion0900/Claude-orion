import { describe, expect, it } from 'vitest'
import { cameraFor, groundDistance, HORIZON_FRACTION, PERSPECTIVE_PX, TILT_DEGREES } from './camera'

const VIEWPORTS = [
  { width: 393, height: 852 }, // iPhone 15/16
  { width: 375, height: 667 }, // iPhone SE
  { width: 430, height: 932 }, // Pro Max
  { width: 1280, height: 800 }, // laptop
]

/** Project a point on the tilted ground back onto the screen, the way CSS does. */
function project(across: number, along: number, tilt: number, perspective: number) {
  const t = (tilt * Math.PI) / 180
  const scale = perspective / (perspective + along * Math.sin(t))
  return { x: across * scale, up: along * Math.cos(t) * scale }
}

describe('groundDistance', () => {
  it('is plain distance when flat', () => {
    expect(groundDistance(3, 4, 0, null)).toBe(5)
  })

  it('inverts the CSS perspective projection', () => {
    for (const [across, along] of [
      [0, 300],
      [150, 800],
      [-200, 50],
      [120, -250],
    ]) {
      const { x, up } = project(across, along, TILT_DEGREES, PERSPECTIVE_PX)
      expect(groundDistance(x, up, TILT_DEGREES, PERSPECTIVE_PX)).toBeCloseTo(Math.hypot(across, along), 6)
    }
  })

  it('has no answer at or beyond the horizon', () => {
    const horizon = PERSPECTIVE_PX / Math.tan((TILT_DEGREES * Math.PI) / 180)
    expect(groundDistance(0, horizon + 1, TILT_DEGREES, PERSPECTIVE_PX)).toBe(Infinity)
  })
})

describe('cameraFor', () => {
  for (const viewport of VIEWPORTS) {
    for (const perspective of ['2d', '3d'] as const) {
      it(`covers every visible point at any heading: ${viewport.width}x${viewport.height} ${perspective}`, () => {
        const camera = cameraFor({ ...viewport, puckFraction: 0.62, perspective })
        const puckY = viewport.height * 0.62
        const top = perspective === '3d' ? viewport.height * HORIZON_FRACTION : 0
        // A square turned any way still covers a disc of half its side.
        const radius = camera.rotorSize / 2
        for (let y = top; y <= viewport.height; y += viewport.height / 40) {
          for (let x = 0; x <= viewport.width; x += viewport.width / 20) {
            const reach = groundDistance(x - viewport.width / 2, puckY - y, camera.tilt, camera.perspectivePx)
            expect(reach).toBeLessThanOrEqual(radius)
          }
        }
      })
    }
  }

  it('centres the rotor on the runner', () => {
    const camera = cameraFor({ width: 393, height: 852, puckFraction: 0.62, perspective: '3d' })
    expect(camera.shiftY).toBeCloseTo(852 * 0.12, 6)
  })

  it('stays about the size of the old fixed rotor on a phone', () => {
    // The old rotor was 260% x 260% of a 393x852 screen in 3D, 170% flat.
    const tilted = cameraFor({ width: 393, height: 852, puckFraction: 0.62, perspective: '3d' })
    const flat = cameraFor({ width: 393, height: 852, puckFraction: 0.62, perspective: '2d' })
    expect(tilted.rotorSize ** 2).toBeLessThan(393 * 2.6 * 852 * 2.6 * 1.2)
    expect(flat.rotorSize ** 2).toBeLessThan(tilted.rotorSize ** 2)
    expect(flat.tilt).toBe(0)
    expect(flat.perspectivePx).toBeNull()
  })
})
