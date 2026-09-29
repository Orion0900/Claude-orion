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
    let bobMin = Infinity
    let bobMax = -Infinity
    let rollMax = 0
    let syMin = Infinity
    let syMax = -Infinity
    let finite = true
    for (const style of STYLES) {
      for (let t = 0; t < 3; t += 0.037) {
        for (const motion of [0, 0.5, 1, 2, -1]) {
          poseFor(style, t, 0.3, motion, out)
          finite &&= [out.bob, out.roll, out.pitch, out.sx, out.sy, out.sz].every(Number.isFinite)
          bobMin = Math.min(bobMin, out.bob)
          bobMax = Math.max(bobMax, out.bob)
          rollMax = Math.max(rollMax, Math.abs(out.roll))
          syMin = Math.min(syMin, out.sy)
          syMax = Math.max(syMax, out.sy)
        }
      }
    }
    expect(finite).toBe(true)
    expect(bobMin).toBeGreaterThanOrEqual(0)
    expect(bobMax).toBeLessThan(0.3)
    expect(rollMax).toBeLessThan(0.3)
    expect(syMin).toBeGreaterThan(0.6)
    expect(syMax).toBeLessThan(1.4)
  })

  it('settles walkers that stand still', () => {
    const out = poseFor('walk', 1.37, 0, 0, emptyPose())
    expect(out.bob).toBeCloseTo(0)
    expect(out.roll).toBeCloseTo(0)
    expect(out.pitch).toBeCloseTo(0)
  })

  it('keeps fliers flapping even when hovering in place', () => {
    const a = poseFor('flap', 0, 0, 0, emptyPose()).sx
    const b = poseFor('flap', 0.1, 0, 0, emptyPose()).sx
    expect(a).not.toBeCloseTo(b)
  })
})
