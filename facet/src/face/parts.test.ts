import { readExif } from './exif'
import { computeFrame } from './frame'
import { angleAt, fitLine, intersect, reflect, signedDistance } from './geometry'
import { bandOf, scoreValue, weightedMean } from './metrics/scoring'
import { estimateHairline, measurePixels, type Pixels } from './pixels'
import { classifyShape } from './faceShape'
import { syntheticDetection } from './synthetic'

describe('geometry', () => {
  it('measures angles, distances and reflections', () => {
    expect(angleAt({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90)
    expect(angleAt({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 1e-9 })).toBeCloseTo(180, 5)
    expect(signedDistance({ x: 0, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5)
    expect(intersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 2, y: 0 })).toEqual({ x: 1, y: 1 })
    expect(reflect({ x: 3, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ x: -3, y: 1 })
    const line = fitLine([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 4 },
    ])
    expect(Math.abs(line.dir.y / line.dir.x)).toBeCloseTo(2)
  })
})

describe('scoring', () => {
  const r = { lo: 1, hi: 2 }
  it('scores 9–10 inside the range, 10 at its centre', () => {
    expect(scoreValue(1.5, r, 0.5)).toBe(10)
    expect(scoreValue(1, r, 0.5)).toBeCloseTo(9)
    expect(scoreValue(1.9, r, 0.5)).toBeGreaterThan(9)
  })
  it('falls away smoothly and symmetrically outside it, never below 1', () => {
    expect(scoreValue(2.5, r, 0.5)).toBeCloseTo(scoreValue(0.5, r, 0.5))
    expect(scoreValue(2.5, r, 0.5)).toBeLessThan(scoreValue(2.2, r, 0.5))
    expect(scoreValue(100, r, 0.5)).toBeGreaterThanOrEqual(1)
    expect(scoreValue(2.0001, r, 0.5)).toBeCloseTo(9, 3)
  })
  it('bands a miss by how many tolerances it is', () => {
    expect(bandOf(1.5, r, 0.5)).toEqual({ band: 'ideal', dir: 0 })
    expect(bandOf(2.1, r, 0.5)).toEqual({ band: 'near', dir: 1 })
    expect(bandOf(0.4, r, 0.5)).toEqual({ band: 'moderate', dir: -1 })
    expect(bandOf(3.5, r, 0.5)).toEqual({ band: 'notable', dir: 1 })
  })
  it('averages only what is graded', () => {
    expect(weightedMean([{ score: 8, weight: 1 }, { score: 4, weight: 3 }, { weight: 5 }])).toBeCloseTo(5)
    expect(weightedMean([{ weight: 1 }])).toBeNull()
  })
})

describe('face shape', () => {
  it('names the shape whose proportions match', () => {
    expect(classifyShape({ length: 1.38, forehead: 0.92, jaw: 0.78, taper: 0.4 }).shape).toBe('oval')
    expect(classifyShape({ length: 1.6, forehead: 0.93, jaw: 0.86, taper: 0.47 }).shape).toBe('oblong')
    expect(classifyShape({ length: 1.2, forehead: 0.94, jaw: 0.9, taper: 0.53 }).shape).toBe('square')
    expect(classifyShape({ length: 1.34, forehead: 0.99, jaw: 0.7, taper: 0.33 }).shape).toBe('heart')
    const r = classifyShape({ length: 1.3, forehead: 0.9, jaw: 0.8, taper: 0.44 })
    expect(r.runnerUp).not.toBe(r.shape)
    expect(Object.values(r.scores).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
})

/** A photo of the synthetic face: skin, with hair above `hairlineY` and a light wall around. */
function portrait(hairlineY: number | null, fringeTo?: number): { px: Pixels; det: ReturnType<typeof syntheticDetection> } {
  const det = syntheticDetection()
  const { width, height } = det
  const data = new Uint8ClampedArray(width * height * 4)
  const cx = width / 2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const inHead = Math.hypot((x - cx) / 280, (y - 560) / 420) < 1
      let rgb = [236, 238, 240]
      if (inHead) rgb = [214, 168, 146]
      if (inHead && hairlineY !== null && y < hairlineY) rgb = [52, 38, 30]
      if (inHead && fringeTo !== undefined && y < fringeTo) rgb = [52, 38, 30]
      // A little texture so the skin model has a spread.
      const n = ((x * 7 + y * 13) % 9) - 4
      data[i] = rgb[0] + n
      data[i + 1] = rgb[1] + n
      data[i + 2] = rgb[2] + n
      data[i + 3] = 255
    }
  }
  return { px: { width, height, data }, det }
}

describe('hairline', () => {
  it('finds where the forehead skin gives way to hair', () => {
    const { px, det } = portrait(300)
    const h = estimateHairline(px, det.landmarks, computeFrame(det.landmarks))
    expect(h.point).not.toBeNull()
    expect(Math.abs(h.point!.y - 300)).toBeLessThan(4)
    expect(Math.abs(h.point!.x - 500)).toBeLessThan(2)
    expect(h.confidence).toBeGreaterThan(0.5)
  })

  it('reports nothing when the hair never starts (a shaved head)', () => {
    const { px, det } = portrait(null)
    const h = estimateHairline(px, det.landmarks, computeFrame(det.landmarks))
    // The head's edge against the wall is the only change; it's well above.
    expect(h.point === null || h.point.y < 250).toBe(true)
  })

  it('notices a fringe covering the forehead', () => {
    const { px, det } = portrait(300, 380)
    const h = estimateHairline(px, det.landmarks, computeFrame(det.landmarks))
    expect(h.covered).toBe(true)
    expect(h.point).toBeNull()
  })

  it('reads brightness, balance and sharpness from the face', () => {
    const { px, det } = portrait(300)
    const s = measurePixels(px, det.landmarks, computeFrame(det.landmarks))
    expect(s.brightness).toBeGreaterThan(150)
    expect(s.brightness).toBeLessThan(200)
    expect(s.sideBalance).toBeLessThan(1.05)
    expect(s.clipped).toBe(0)
  })
})

/** A minimal JPEG: SOI, an APP1 EXIF segment with a model and focal lengths, EOI. */
function jpegWithExif(): ArrayBuffer {
  const tiff: number[] = []
  const u16 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff)
  const u32 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff)
  // Little-endian header, IFD0 at 8.
  tiff.push(0x49, 0x49)
  u16(42)
  u32(8)
  // IFD0: model (ASCII, 7 bytes at 38), Exif pointer (-> 46).
  u16(2)
  u16(0x0110), u16(2), u32(7), u32(38)
  u16(0x8769), u16(4), u32(1), u32(46)
  u32(0)
  for (const c of 'iPhone\0') tiff.push(c.charCodeAt(0))
  tiff.push(0)
  // Exif IFD at 46: focal length in 35mm (SHORT 26), focal length (RATIONAL at 76).
  u16(2)
  u16(0xa405), u16(3), u32(1), u32(26)
  u16(0x920a), u16(5), u32(1), u32(76)
  u32(0)
  u32(425)
  u32(100)
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const len = app1.length + 2
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xd9]).buffer
}

describe('exif', () => {
  it('reads the camera model and focal lengths', () => {
    expect(readExif(jpegWithExif())).toEqual({ focal35: 26, focal: 4.25, model: 'iPhone' })
  })
  it('ignores files that are not JPEGs', () => {
    expect(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull()
    expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull()
  })
})
