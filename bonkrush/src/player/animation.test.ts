import { POSE_FPS, StepClock, choosePose, computePose, createPose, type PoseName } from './animation'

describe('animation', () => {
  it('swings legs and arms in opposition through a run cycle', () => {
    const quarter = computePose('run', 0.25, 0, 0, createPose())
    expect(quarter.legL).toBeGreaterThan(0.5)
    expect(quarter.legR).toBeLessThan(-0.5)
    expect(quarter.armL).toBeLessThan(0)
    const three = computePose('run', 0.75, 0, 0, createPose())
    expect(three.legL).toBeLessThan(-0.5)
    expect(three.legR).toBeGreaterThan(0.5)
  })

  it('crouches and leans back in a slide', () => {
    const p = computePose('slide', 0, 0, 0, createPose())
    expect(p.crouch).toBeLessThan(-0.3)
    expect(p.lean).toBeLessThan(0)
    expect(p.legL).toBeGreaterThan(1)
  })

  it('gives finite numbers for every pose', () => {
    const names: PoseName[] = ['idle', 'run', 'air', 'slide', 'dead']
    for (const name of names) {
      for (const phase of [0, 0.3, 17.9]) {
        const p = computePose(name, phase, 123.4, -5, createPose())
        for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('picks the pose from the movement state', () => {
    expect(choosePose(false, true, true, 0, 10)).toBe('dead')
    expect(choosePose(true, true, true, 0, 10)).toBe('slide')
    expect(choosePose(true, false, false, 0.5, 10)).toBe('air')
    expect(choosePose(true, false, false, 0.05, 10)).toBe('run')
    expect(choosePose(true, true, false, 0, 0)).toBe('idle')
  })

  it('steps at about 12 fps whatever the frame rate', () => {
    for (const fps of [30, 60, 144]) {
      const clock = new StepClock()
      let ticks = 0
      for (let i = 0; i < fps * 2; i++) if (clock.tick(1 / fps)) ticks++
      expect(ticks).toBeGreaterThanOrEqual(POSE_FPS * 2 - 1)
      expect(ticks).toBeLessThanOrEqual(POSE_FPS * 2 + 1)
    }
  })

  it('poses on the very first tick', () => {
    expect(new StepClock().tick(0)).toBe(true)
  })
})
