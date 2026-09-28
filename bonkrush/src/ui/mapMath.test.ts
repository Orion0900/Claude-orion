import {
  arrowAngle,
  clampToCircle,
  hexToRgb,
  markerColor,
  sampleHeights,
  shadeTerrain,
  worldToMap,
} from './mapMath'

const p = { x: 0, y: 0 }

describe('worldToMap', () => {
  it('puts what is ahead of the camera at the top', () => {
    // Yaw 0 looks down -Z.
    worldToMap(0, -10, 0, 1, p)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(-10)
    // And the camera's right (+X at yaw 0) to the right.
    worldToMap(10, 0, 0, 2, p)
    expect(p.x).toBeCloseTo(20)
    expect(p.y).toBeCloseTo(0)
  })

  it('keeps the camera forward on top at any yaw', () => {
    for (const yaw of [0.3, 1.5, -2, Math.PI]) {
      // Forward for this yaw is (-sin, -cos).
      worldToMap(-Math.sin(yaw) * 5, -Math.cos(yaw) * 5, yaw, 1, p)
      expect(p.x).toBeCloseTo(0)
      expect(p.y).toBeCloseTo(-5)
    }
  })

  it('points the arrow up when the player faces the camera direction', () => {
    expect(arrowAngle(1.2, 1.2)).toBe(0)
  })
})

describe('clampToCircle', () => {
  it('leaves points inside alone', () => {
    const q = { x: 3, y: 4 }
    expect(clampToCircle(q, 5)).toBe(false)
    expect(q).toEqual({ x: 3, y: 4 })
  })

  it('pulls points outside onto the rim', () => {
    const q = { x: 6, y: 8 }
    expect(clampToCircle(q, 5)).toBe(true)
    expect(q.x).toBeCloseTo(3)
    expect(q.y).toBeCloseTo(4)
  })
})

describe('colours', () => {
  it('reads long and short hex', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('junk')).toEqual([128, 128, 128])
  })

  it('gives golden shrines their own colour', () => {
    expect(markerColor('shrineCharge', true)).not.toBe(markerColor('shrineCharge', false))
    expect(markerColor('chest')).toBe('#ffd23f')
  })
})

describe('terrain bake', () => {
  it('samples cell centres row by row', () => {
    const calls: Array<[number, number]> = []
    const h = sampleHeights(
      (x, z) => {
        calls.push([x, z])
        return x
      },
      10,
      2,
    )
    expect(calls).toEqual([
      [-5, -5],
      [5, -5],
      [-5, 5],
      [5, 5],
    ])
    expect(Array.from(h)).toEqual([-5, 5, -5, 5])
  })

  it('replaces broken heights with zero', () => {
    expect(Array.from(sampleHeights(() => NaN, 1, 2))).toEqual([0, 0, 0, 0])
  })

  it('shades low ground dark and high ground light on a gentle slope', () => {
    const n = 4
    const heights = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = i * 0.1
    const px = shadeTerrain(heights, n, 10, { low: '#000000', high: '#ffffff', cliff: '#ff0000' })
    expect(px.length).toBe(n * n * 4)
    const lowRed = px[0]
    const highRed = px[(n - 1) * 4]
    expect(highRed).toBeGreaterThan(lowRed)
    expect(px[3]).toBe(255)
  })

  it('paints steep ground with the cliff colour', () => {
    const n = 3
    const heights = new Float32Array([0, 50, 100, 0, 50, 100, 0, 50, 100])
    const px = shadeTerrain(heights, n, 1, { low: '#000000', high: '#000000', cliff: '#00ff00' })
    const mid = 4 * 4
    expect(px[mid + 1]).toBeGreaterThan(100)
    expect(px[mid]).toBe(0)
  })

  it('handles a perfectly flat map without dividing by zero', () => {
    const px = shadeTerrain(new Float32Array(4), 2, 1, { low: '#102030', high: '#ffffff', cliff: '#000000' })
    expect(Array.from(px.slice(0, 4))).toEqual([16, 32, 48, 255])
  })
})
