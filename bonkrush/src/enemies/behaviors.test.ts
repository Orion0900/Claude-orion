import {
  CHARGE_APPROACH,
  CHARGE_DASH,
  CHARGE_RECOVER,
  CHARGE_WINDUP,
  CHARGER,
  EXPLODE_ARMED,
  EXPLODER,
  chase,
  flank,
  keepDistance,
  stepCharger,
  stepExploder,
  turnTowards,
  yawTowards,
} from './behaviors'

const steer = () => ({ x: 0, z: 0 })

describe('yaw', () => {
  it('uses the player convention: 0 faces -Z', () => {
    expect(yawTowards(0, -1)).toBeCloseTo(0)
    expect(Math.abs(yawTowards(0, 1))).toBeCloseTo(Math.PI)
    expect(yawTowards(-1, 0)).toBeCloseTo(Math.PI / 2)
  })

  it('turns the short way round and no further than asked', () => {
    expect(turnTowards(3, -3, 10)).toBeCloseTo(3 + (2 * Math.PI - 6))
    expect(turnTowards(0, 1, 0.25)).toBeCloseTo(0.25)
    expect(turnTowards(0, -1, 0.25)).toBeCloseTo(-0.25)
    expect(turnTowards(0.5, 0.5, 0.1)).toBeCloseTo(0.5)
  })
})

describe('steering', () => {
  it('chases at full speed', () => {
    const out = chase(3, 4, 5, 6, 0, steer())
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(6)
    expect(out.x / out.z).toBeCloseTo(0.75)
  })

  it('weaves without losing speed or turning away', () => {
    const out = chase(0, 10, 10, 4, 1, steer())
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(4)
    expect(out.z).toBeGreaterThan(0)
    expect(out.x).not.toBeCloseTo(0)
  })

  it('stands still on top of the target', () => {
    expect(chase(0, 0, 0, 5, 0, steer())).toEqual({ x: 0, z: 0 })
    expect(flank(0, 0, 0, 5, 1, steer())).toEqual({ x: 0, z: 0 })
    expect(keepDistance(0, 0, 0, 12, 5, 1, steer())).toEqual({ x: 0, z: 0 })
  })

  it('flanks from opposite sides by side', () => {
    const a = flank(0, 20, 20, 7, 1, steer())
    const b = flank(0, 20, 20, 7, -1, steer())
    expect(Math.sign(a.x)).toBe(-Math.sign(b.x))
    expect(a.z).toBeGreaterThan(0)
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(7)
  })

  it('flanks straight in when close', () => {
    const out = flank(0, 2, 2, 7, 1, steer())
    expect(out.x).toBeCloseTo(0)
    expect(out.z).toBeCloseTo(7)
  })

  it('keeps its distance', () => {
    expect(keepDistance(0, 30, 30, 12, 3, 1, steer()).z).toBeGreaterThan(0)
    expect(keepDistance(0, 5, 5, 12, 3, 1, steer()).z).toBeLessThan(0)
    const strafe = keepDistance(0, 12, 12, 12, 3, 1, steer())
    expect(Math.abs(strafe.x)).toBeGreaterThan(Math.abs(strafe.z))
  })
})

describe('charger', () => {
  it('approaches, winds up, dashes and recovers', () => {
    const s = { state: CHARGE_APPROACH, t: 0 }
    expect(stepCharger(s, CHARGER.cooldown + 0.01, 30)).toBe(CHARGE_APPROACH)
    expect(stepCharger(s, 0.01, 8)).toBe(CHARGE_WINDUP)
    expect(stepCharger(s, CHARGER.windup / 2, 8)).toBe(CHARGE_WINDUP)
    expect(stepCharger(s, CHARGER.windup, 8)).toBe(CHARGE_DASH)
    expect(stepCharger(s, CHARGER.dashTime + 0.01, 8)).toBe(CHARGE_RECOVER)
    expect(stepCharger(s, CHARGER.recover + 0.01, 8)).toBe(CHARGE_APPROACH)
    expect(s.t).toBe(0)
  })

  it('waits out its cooldown before charging again', () => {
    const s = { state: CHARGE_APPROACH, t: 0 }
    expect(stepCharger(s, 0.1, 2)).toBe(CHARGE_APPROACH)
  })

  it('winds up for 0.7 s', () => {
    expect(CHARGER.windup).toBeCloseTo(0.7)
  })
})

describe('exploder', () => {
  it('arms at 1.5 m and blows after the fuse', () => {
    const s = { state: 0, t: 0 }
    expect(stepExploder(s, 0.1, 5)).toBe(false)
    expect(stepExploder(s, 0.1, EXPLODER.armRange)).toBe(false)
    expect(s.state).toBe(EXPLODE_ARMED)
    expect(stepExploder(s, EXPLODER.fuse / 2, 10)).toBe(false)
    expect(stepExploder(s, EXPLODER.fuse, 10)).toBe(true)
  })

  it('splashes 3 m', () => {
    expect(EXPLODER.radius).toBe(3)
  })
})
