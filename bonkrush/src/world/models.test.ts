import type { BufferGeometry } from 'three'
import { STAGES } from '../data/stages'
import { buildCliffRock, buildCloud, buildPropModel, hasPropModel, TUMBLEWEED_RADIUS } from './models'
import { propSpec } from './propSpecs'

function checkGeometry(g: BufferGeometry): void {
  expect(g.index).toBeNull()
  const pos = g.getAttribute('position')
  const col = g.getAttribute('color')
  const nor = g.getAttribute('normal')
  expect(pos.count).toBeGreaterThan(0)
  expect(pos.count % 3).toBe(0)
  expect(col.count).toBe(pos.count)
  expect(nor.count).toBe(pos.count)
  expect(g.getAttribute('uv')).toBeUndefined()
  for (const a of [pos.array, col.array] as Float32Array[]) expect(a.every(Number.isFinite)).toBe(true)
}

describe('prop models', () => {
  const kinds = [...new Set(STAGES.flatMap((s) => s.props.map((p) => p.kind)))]

  it('has a model for every prop kind the stages use', () => {
    for (const kind of kinds) expect(hasPropModel(kind)).toBe(true)
  })

  it('builds every variant as one merged, flat, vertex-coloured geometry', () => {
    for (const kind of kinds) {
      for (let v = 0; v < propSpec(kind).variants; v++) {
        const model = buildPropModel(kind, v)
        checkGeometry(model.body)
        if (model.glow) checkGeometry(model.glow)
        model.body.dispose()
        model.glow?.dispose()
      }
    }
  })

  it('stands models on the ground (the tumbleweed alone is centred)', () => {
    for (const [kind, v] of kinds.flatMap((k) => Array.from({ length: propSpec(k).variants }, (_, i) => [k, i] as const))) {
      const { body } = buildPropModel(kind, v)
      body.computeBoundingBox()
      const box = body.boundingBox!
      if (kind === 'tumbleweed') {
        expect(box.min.y).toBeCloseTo(-TUMBLEWEED_RADIUS, 0)
        expect(box.max.y).toBeCloseTo(TUMBLEWEED_RADIUS, 0)
      } else {
        expect(box.min.y).toBeGreaterThan(-0.05)
        expect(box.min.y).toBeLessThan(0.3)
        expect(box.max.y).toBeGreaterThan(0.2)
      }
      body.dispose()
    }
  })

  it('gives glowing kinds a glow part', () => {
    for (const kind of kinds) {
      const spec = propSpec(kind)
      const model = buildPropModel(kind, 0)
      expect(!!model.glow).toBe(!!spec.glow)
      model.body.dispose()
      model.glow?.dispose()
    }
  })

  it('keeps solid props roughly within their collision radius near the ground', () => {
    for (const stage of STAGES) {
      for (const p of stage.props.filter((q) => q.solid)) {
        for (let variant = 0; variant < propSpec(p.kind).variants; variant++) {
          const { body } = buildPropModel(p.kind, variant)
          const pos = body.getAttribute('position')
          // What's below head height near the ground should not stick far out of the collider.
          let reach = 0
          for (let v = 0; v < pos.count; v++) if (pos.getY(v) < 1) reach = Math.max(reach, Math.hypot(pos.getX(v), pos.getZ(v)))
          expect(reach).toBeLessThan(propSpec(p.kind).radius * 2.2 + 0.2)
          body.dispose()
        }
      }
    }
  })

  it('falls back to a rock for unknown kinds', () => {
    const model = buildPropModel('not-a-prop')
    checkGeometry(model.body)
    model.body.dispose()
  })

  it('builds the wall boulder and the cloud', () => {
    for (const g of [buildCliffRock(), buildCloud()]) {
      checkGeometry(g)
      g.dispose()
    }
  })
})
