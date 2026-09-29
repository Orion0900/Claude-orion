import { Vector3 } from 'three'
import {
  attractRange,
  COLLECT_RADIUS,
  homingSpeedCap,
  homingStep,
  MAX_HOMING_SPEED,
  nearestIndex,
  PickupChain,
  popScale,
  valueScale,
  xpTier,
} from './attraction'

describe('attractRange', () => {
  it('is 3.5 m at pickupRange 1 and scales linearly', () => {
    expect(attractRange(1)).toBeCloseTo(3.5)
    expect(attractRange(2)).toBeCloseTo(7)
  })

  it('never goes negative or NaN', () => {
    expect(attractRange(-1)).toBe(0)
    expect(attractRange(NaN)).toBe(3.5)
  })
})

describe('homingStep', () => {
  it('accelerates toward the target', () => {
    const pos = new Vector3(10, 0, 0)
    const target = new Vector3(0, 0, 0)
    const speed = homingStep(pos, target, 0, 0.1)
    expect(speed).toBeGreaterThan(0)
    expect(pos.x).toBeLessThan(10)
    expect(pos.x).toBeGreaterThan(0)
    expect(pos.y).toBe(0)
  })

  it('never overshoots, even with a huge step', () => {
    const pos = new Vector3(1, 1, 1)
    const target = new Vector3(0, 0.9, 0)
    homingStep(pos, target, 1000, 1, 1000)
    expect(pos.distanceTo(target)).toBe(0)
  })

  it('caps the speed', () => {
    const pos = new Vector3(1000, 0, 0)
    const target = new Vector3()
    let speed = 0
    for (let i = 0; i < 200; i++) speed = homingStep(pos, target, speed, 1 / 60)
    expect(speed).toBe(MAX_HOMING_SPEED)
  })

  it('reaches collection range from the edge of the magnet within a second', () => {
    const pos = new Vector3(3.5, 0, 0)
    const target = new Vector3()
    let speed = 4
    let t = 0
    while (pos.distanceTo(target) >= COLLECT_RADIUS && t < 5) {
      speed = homingStep(pos, target, speed, 1 / 60)
      t += 1 / 60
    }
    expect(t).toBeLessThan(1)
  })

  it('is safe when already on the target', () => {
    const pos = new Vector3(2, 2, 2)
    homingStep(pos, pos.clone(), 5, 1 / 60)
    expect(Number.isNaN(pos.x)).toBe(false)
  })
})

describe('homingSpeedCap', () => {
  it('stays above a fast player', () => {
    expect(homingSpeedCap(0)).toBe(MAX_HOMING_SPEED)
    expect(homingSpeedCap(40)).toBeGreaterThan(40)
    expect(homingSpeedCap(NaN)).toBe(MAX_HOMING_SPEED)
  })
})

describe('xpTier', () => {
  it('splits blue, green and red at 5 and 25', () => {
    expect(xpTier(1)).toBe(0)
    expect(xpTier(4.9)).toBe(0)
    expect(xpTier(5)).toBe(1)
    expect(xpTier(24)).toBe(1)
    expect(xpTier(25)).toBe(2)
    expect(xpTier(500)).toBe(2)
  })
})

describe('valueScale', () => {
  it('is 1 for single coins and grows slowly, capped', () => {
    expect(valueScale(1)).toBe(1)
    expect(valueScale(0)).toBe(1)
    expect(valueScale(NaN)).toBe(1)
    expect(valueScale(10)).toBeCloseTo(1.45)
    expect(valueScale(1e9)).toBeCloseTo(1.8)
  })
})

describe('popScale', () => {
  it('starts tiny, overshoots, and settles at 1', () => {
    expect(popScale(0)).toBeLessThan(0.05)
    const mid = [0.1, 0.12, 0.14, 0.16].map((a) => popScale(a))
    expect(Math.max(...mid)).toBeGreaterThan(1)
    expect(popScale(0.18)).toBe(1)
    expect(popScale(5)).toBe(1)
  })
})

describe('PickupChain', () => {
  it('raises the pitch for quick chains and resets after a pause', () => {
    const chain = new PickupChain()
    expect(chain.collect(0)).toBe(1)
    const second = chain.collect(0.1)
    expect(second).toBeGreaterThan(1)
    const third = chain.collect(0.2)
    expect(third).toBeGreaterThan(second)
    expect(chain.collect(2)).toBe(1)
  })

  it('throttles sounds collected in the same instant but keeps counting', () => {
    const chain = new PickupChain()
    expect(chain.collect(1)).toBe(1)
    expect(chain.collect(1)).toBe(0)
    expect(chain.collect(1)).toBe(0)
    expect(chain.length).toBe(2)
    expect(chain.collect(1.1)).toBeGreaterThan(1.1)
  })

  it('caps the pitch', () => {
    const chain = new PickupChain()
    let pitch = 0
    for (let i = 0; i < 200; i++) pitch = chain.collect(i * 0.1) || pitch
    expect(pitch).toBeCloseTo(1 + 24 * 0.04)
  })
})

describe('nearestIndex', () => {
  const items = [
    { pos: new Vector3(10, 0, 0), ok: true },
    { pos: new Vector3(1, 50, 1), ok: true },
    { pos: new Vector3(0.5, 0, 0), ok: false },
  ]

  it('finds the nearest accepted item on the ground plane', () => {
    expect(nearestIndex(items, 0, 0, (i) => i.ok)).toBe(1)
    expect(nearestIndex(items, 0, 0, () => true)).toBe(2)
  })

  it('returns -1 when nothing qualifies', () => {
    expect(nearestIndex(items, 0, 0, () => false)).toBe(-1)
    expect(nearestIndex([], 0, 0, () => true)).toBe(-1)
  })
})
