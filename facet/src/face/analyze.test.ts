import { analyzeFront, type FrontAnalysis } from './analyze'
import { MIRROR } from './canonical'
import { BILATERAL_PAIRS, computeFrame, MIDLINE_POINTS } from './frame'
import type { PixelStats } from './pixels'
import type { PointAdjustments } from './points'
import { faceForward, PITCH_BIAS, poseFromMatrix } from './pose'
import { canonicalPoints, syntheticDetection, type SyntheticOptions } from './synthetic'
import type { Sex } from './types'

const pixels: PixelStats = {
  hairline: { point: null, confidence: 0, covered: false },
  brightness: 140,
  sideBalance: 1,
  clipped: 0,
  sharpness: 12,
}

function run(o: SyntheticOptions = {}, adjustments: PointAdjustments = {}, sex: Sex = 'female', px = pixels): FrontAnalysis {
  return analyzeFront({ detection: syntheticDetection(o), pixels: px, adjustments }, { sex })
}
const values = (a: FrontAnalysis) => Object.fromEntries(a.metrics.map((m) => [m.id, m.value]))

describe('canonical mesh', () => {
  it('pairs every off-midline point with exactly one mirror', () => {
    expect(MIRROR.length).toBe(468)
    MIRROR.forEach((j, i) => expect(MIRROR[j]).toBe(i))
    expect(BILATERAL_PAIRS.length * 2 + MIDLINE_POINTS.length).toBe(468)
    // The eye corners are each other's mirrors.
    expect(MIRROR[33]).toBe(263)
    expect(MIRROR[133]).toBe(362)
    expect(MIRROR[61]).toBe(291)
  })
})

describe('head pose', () => {
  it('reads yaw, pitch and roll back from the transform', () => {
    const pose = poseFromMatrix(syntheticDetection({ yaw: 12 }).matrix!)
    expect(pose.yaw).toBeCloseTo(12, 6)
    expect(pose.pitch).toBeCloseTo(0, 6)
    expect(poseFromMatrix(syntheticDetection({ pitch: -7 }).matrix!).pitch).toBeCloseTo(-7, 6)
    expect(poseFromMatrix(syntheticDetection({ roll: 9 }).matrix!).roll).toBeCloseTo(9, 6)
  })

  it('turns a head back to face the camera', () => {
    // A level head reads PITCH_BIAS degrees chin-down, and is left there.
    const level = syntheticDetection({ pitch: -PITCH_BIAS })
    const ref = faceForward(level.landmarks, poseFromMatrix(level.matrix!))
    const turned = syntheticDetection({ yaw: 14, pitch: 9 })
    const back = faceForward(turned.landmarks, poseFromMatrix(turned.matrix!))
    // Same shape up to a translation.
    const dx = back[1].x - ref[1].x
    const dy = back[1].y - ref[1].y
    for (const i of [10, 33, 263, 152, 61, 291, 234, 454]) {
      expect(back[i].x - dx).toBeCloseTo(ref[i].x, 6)
      expect(back[i].y - dy).toBeCloseTo(ref[i].y, 6)
    }
  })

  it('finds the face’s horizontal from the mirrored pairs', () => {
    expect(computeFrame(syntheticDetection().landmarks).angle).toBeCloseTo(0, 9)
    // A positive roll lowers the subject's left (the photo's right): a positive image angle.
    expect((computeFrame(syntheticDetection({ roll: 10 }).landmarks).angle * 180) / Math.PI).toBeCloseTo(10, 6)
  })
})

describe('front analysis', () => {
  it('gives the same numbers wherever the face sits, however large, however tilted', () => {
    const base = values(run())
    for (const o of [{ scale: 45 }, { center: { x: 320, y: 480 } }, { roll: 12 }, { roll: -20, scale: 22 }] as SyntheticOptions[]) {
      const v = values(run(o))
      for (const k of Object.keys(base)) expect(v[k]).toBeCloseTo(base[k], 6)
    }
  })

  it('corrects for a turned head, tilted or not', () => {
    const base = values(run())
    for (const o of [{ yaw: 9 }, { yaw: -12, roll: 8 }, { yaw: 6, roll: -15, pitch: 4 }] as SyntheticOptions[]) {
      const v = values(run(o))
      for (const k of Object.keys(base)) expect(v[k]).toBeCloseTo(base[k], 6)
    }
  })

  it('corrects a raised or lowered chin too', () => {
    const base = values(run())
    for (const o of [{ pitch: 12 }, { pitch: -15, yaw: 7 }] as SyntheticOptions[]) {
      const v = values(run(o))
      for (const k of Object.keys(base)) expect(v[k]).toBeCloseTo(base[k], 6)
    }
  })

  it('measures in millimetres from the iris', () => {
    const a = run({ scale: 37 })
    // Canonical units are centimetres: one pixel is 10/37 mm.
    expect(a.mmPerPx).toBeCloseTo(10 / 37, 6)
  })

  it('finds the canonical face perfectly symmetric', () => {
    const a = run({ yaw: 6 })
    // The generated mesh is rounded to 0.01 mm, so "perfect" is within that.
    expect(a.symmetry.asymmetry).toBeLessThan(1e-3)
    expect(a.symmetry.score).toBeCloseTo(100, 2)
    for (const f of a.symmetry.findings) expect(f.level).toBe(0)
  })

  it('scores a lopsided face as less symmetric and says where', () => {
    const lopsided = run({
      edit: (v) => {
        // Raise the subject's left eye and brow by 2.5 mm.
        for (const i of [263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398, 359, 463, 300, 293, 334, 296, 336, 276, 283, 282, 295, 285]) v[i].y += 0.25
      },
    })
    expect(lopsided.symmetry.score).toBeLessThan(100)
    const eyes = lopsided.symmetry.regions.find((r) => r.id === 'eyes')!
    const jaw = lopsided.symmetry.regions.find((r) => r.id === 'jaw')!
    expect(eyes.asymmetry).toBeGreaterThan(jaw.asymmetry)
    const level = lopsided.symmetry.findings.find((f) => f.id === 'eyeLevel')!
    expect(level.side).toBe('left')
    expect(level.unit).toBe('mm')
    expect(level.amount).toBeGreaterThan(1.5)
    expect(level.amount).toBeLessThan(3.5)
  })

  it('reads a steeper canthal tilt when the outer corners rise', () => {
    const flat = run().metrics.find((m) => m.id === 'canthalTilt')!.value
    const lifted = run({
      edit: (v) => {
        for (const i of [33, 130, 263, 359]) v[i].y += 0.15
      },
    }).metrics.find((m) => m.id === 'canthalTilt')!.value
    expect(lifted).toBeGreaterThan(flat + 2)
  })

  it('uses the photo’s hairline for the thirds, and estimates without one', () => {
    const noHairline = run()
    expect(noHairline.hairline).toBe('estimated')
    // Place the hairline so the upper third equals the lower third.
    const det = syntheticDetection()
    const g = { x: (det.landmarks[9].x + det.landmarks[8].x) / 2, y: (det.landmarks[9].y + det.landmarks[8].y) / 2 }
    const sn = det.landmarks[2]
    const me = det.landmarks[152]
    const hairline = { x: g.x, y: g.y - (me.y - sn.y) }
    const withHairline = run({}, {}, 'female', { ...pixels, hairline: { point: hairline, confidence: 0.9, covered: false } })
    expect(withHairline.hairline).toBe('detected')
    const thirds = withHairline.metrics.find((m) => m.id === 'thirds')!
    const upper = parseInt(thirds.details[0].value)
    const lower = parseInt(thirds.details[2].value)
    expect(Math.abs(upper - lower)).toBeLessThanOrEqual(1)
  })

  it('moves a measurement when a point is dragged', () => {
    const det = syntheticDetection()
    const base = run().metrics.find((m) => m.id === 'noseWidth')!.value
    const al = det.landmarks[358]
    const wider = run({}, { alL: { x: al.x + 12, y: al.y } }).metrics.find((m) => m.id === 'noseWidth')!.value
    expect(wider).toBeGreaterThan(base)
  })

  it('compares against the chosen sex’s ideals', () => {
    const f = run({}, {}, 'female').metrics.find((m) => m.id === 'jawCheek')!
    const m = run({}, {}, 'male').metrics.find((m) => m.id === 'jawCheek')!
    expect(f.value).toBeCloseTo(m.value, 9)
    expect(f.ideal).not.toEqual(m.ideal)
  })

  it('gives every graded measurement a score and every measurement a drawing', () => {
    const a = run()
    for (const m of a.metrics) {
      expect(m.overlay.shapes.length).toBeGreaterThan(0)
      expect(m.overlay.box.w).toBeGreaterThan(0)
      if (m.weight > 0) {
        expect(m.score).toBeGreaterThanOrEqual(1)
        expect(m.score).toBeLessThanOrEqual(10)
      }
    }
    expect(a.harmony).toBeGreaterThan(0)
    expect(a.harmony).toBeLessThanOrEqual(100)
  })

  it('flags a smile as undermining the mouth measurements', () => {
    const a = analyzeFront(
      { detection: syntheticDetection({ blendshapes: { mouthSmileLeft: 0.9, mouthSmileRight: 0.85 } }), pixels, adjustments: {} },
      { sex: 'male' },
    )
    expect(a.quality.checks.find((c) => c.id === 'expression')!.status).toBe('bad')
    expect(a.metrics.find((m) => m.id === 'lipRatio')!.caveat).toBeTruthy()
  })

  it('keeps the canonical points in sensible anatomical order', () => {
    const a = run()
    const p = a.display.points
    expect(p.tr.y).toBeLessThan(p.g.y)
    expect(p.g.y).toBeLessThan(p.sn.y)
    expect(p.sn.y).toBeLessThan(p.ls.y)
    expect(p.ls.y).toBeLessThan(p.sto.y)
    expect(p.sto.y).toBeLessThan(p.li.y)
    expect(p.li.y).toBeLessThan(p.me.y)
    expect(p.zyR.x).toBeLessThan(p.exR.x)
    expect(p.exR.x).toBeLessThan(p.enR.x)
    expect(p.enR.x).toBeLessThan(p.enL.x)
    expect(p.enL.x).toBeLessThan(p.exL.x)
    expect(p.exL.x).toBeLessThan(p.zyL.x)
    expect(canonicalPoints().length).toBe(468)
  })
})
