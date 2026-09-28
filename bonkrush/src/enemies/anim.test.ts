import type { AnimStyle } from './EnemyModels'
import { ANIM_FPS, emptyPose, poseFor, stepTime } from './anim'

const STYLES: AnimStyle[] = ['walk', 'hop', 'flap', 'float', 'heavy', 'skitter', 'waddle']

describe('poseFor', () => {
  it('steps at the animation frame rate', () => {
    expect(stepTime(1.234)).toBeCloseTo(1.2)
    const a = poseFor('walk', 2.01, 0, 1, emptyPose())
    const b = poseFor('walk', 2.01 + 0.5 / ANIM_FPS, 0, 1, emptyPose())
    expect(b).toEqual(a)
  })

  it('changes between frames while moving', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 10; i++) seen.add(poseFor('hop', i / ANIM_FPS, 0, 1, emptyPose()).bob)
    expect(seen.size).toBeGreaterThan(2)
  })

  it('stays in sane bounds for every style', () => {
    const out = emptyPose()
    for (const style of STYLES) {
      for (let t = 0; t < 3; t += 0.037) {
        for (const motion of [0, 0.5, 1, 2, -1]) {
          poseFor(style, t, 0.3, motion, out)
          for (const v of [out.bob, out.roll, out.pitch, out.sx, out.sy, out.sz]) expect(Number.isFinite(v)).toBe(true)
          expect(out.bob).toBeGreaterThanOrEqual(0)
          expect(out.bob).toBeLessThan(0.3)
          expect(Math.abs(out.roll)).toBeLessThan(0.3)
          expect(out.sy).toBeGreaterThan(0.6)
          expect(out.sy).toBeLessThan(1.4)
        }
      }
    }
  })

  it('settles walkers that stand still', () => {
    const out = poseFor('walk', 1.37, 0, 0, emptyPose())
    expect(out.bob).toBe(0)
    expect(out.roll).toBe(0)
    expect(out.pitch).toBe(0)
  })

  it('keeps fliers flapping even when hovering in place', () => {
    const a = poseFor('flap', 0, 0, 0, emptyPose()).sx
    const b = poseFor('flap', 0.1, 0, 0, emptyPose()).sx
    expect(a).not.toBeCloseTo(b)
  })
})
