import { dist, interpolateAtX, lerp, mid, toDeg } from '../geometry'
import { BROW_LEFT, BROW_RIGHT, EYE_LEFT, EYE_RIGHT, LM } from '../indices'
import type { FrontPoints } from '../points'
import type { Sex, Vec2 } from '../types'
import { FRONT_SPECS, idealRange, type FrontMetricId, type MetricSpec } from './ideals'
import { bandOf, scoreValue } from './scoring'
import type { Box, MetricResult, Overlay, Shape } from './types'

/** Landmarks and key points in one upright space. */
export interface Space {
  lm: (i: number) => Vec2
  p: FrontPoints
}

export type HairlineState = 'detected' | 'adjusted' | 'estimated' | 'hidden'

export interface FrontContext {
  /** Where measurements are taken: the face turned to look straight on. */
  M: Space
  /** Where drawings go: the photo itself, turned upright. */
  D: Space
  sex: Sex
  /** Millimetres per pixel in the measuring space, when the iris gives a scale. */
  mm: number | null
  hairline: HairlineState
}

const f2 = (n: number) => n.toFixed(2)
const signedDeg = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}°`
const pct = (n: number) => `${Math.round(n * 100)}`

function box(points: Vec2[], padX: number, padY = padX): Box {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs) - padX
  const y = Math.min(...ys) - padY
  return { x, y, w: Math.max(...xs) + padX - x, h: Math.max(...ys) + padY - y }
}

const hline = (y: number, x0: number, x1: number, extra: Partial<Shape & { t: 'line' }> = {}): Shape => ({
  t: 'line',
  a: { x: x0, y },
  b: { x: x1, y },
  ...extra,
})
const vline = (x: number, y0: number, y1: number, extra: Partial<Shape & { t: 'line' }> = {}): Shape => ({
  t: 'line',
  a: { x, y: y0 },
  b: { x, y: y1 },
  ...extra,
})

function mmText(ctx: FrontContext, px: number): string | null {
  return ctx.mm ? `≈ ${Math.round(px * ctx.mm)} mm` : null
}

function graded(
  id: FrontMetricId,
  ctx: FrontContext,
  value: number,
  display: string,
  overlay: Overlay,
  details: { label: string; value: string }[] = [],
  format: (n: number) => string = f2,
  key?: string,
): MetricResult {
  const spec: MetricSpec = FRONT_SPECS[id]
  const ideal = idealRange(spec, ctx.sex)
  const base = {
    id,
    group: spec.group,
    value,
    display,
    gauge: { lo: spec.gauge[0], hi: spec.gauge[1] },
    details,
    overlay,
    weight: spec.weight,
  }
  if (!ideal || spec.sigma === undefined) return { ...base, key: key ?? 'value', weight: 0 }
  const { band, dir } = bandOf(value, ideal, spec.sigma)
  return {
    ...base,
    ideal,
    idealDisplay: `${format(ideal.lo)} – ${format(ideal.hi)}`,
    score: scoreValue(value, ideal, spec.sigma),
    band,
    dir,
    key: key ?? (dir === 0 ? 'ideal' : dir < 0 ? 'low' : 'high'),
  }
}

/** Face width in the display space, for sizing drawings. */
const widthOf = (s: Space) => dist(s.p.zyR, s.p.zyL)

export function thirds(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const upper = p.g.y - p.tr.y
  const middle = p.sn.y - p.g.y
  const lower = p.me.y - p.sn.y
  const known = ctx.hairline === 'detected' || ctx.hairline === 'adjusted'
  let shares: number[]
  let value: number
  let display: string
  if (known) {
    const total = upper + middle + lower
    shares = [upper / total, middle / total, lower / total]
    value = Math.max(...shares.map((s) => Math.abs(s - 1 / 3))) * 100
    display = shares.map(pct).join(' · ') + '%'
  } else {
    // Without a hairline only the middle and lower thirds can be compared.
    const total = middle + lower
    shares = [NaN, middle / total, lower / total]
    value = Math.abs(middle / total - 0.5) * (200 / 3)
    display = `— · ${pct((middle / total) * (2 / 3))} · ${pct((lower / total) * (2 / 3))}%`
  }
  const names = ['upper', 'middle', 'lower']
  let worst = known ? 0 : 1
  for (let i = worst; i < 3; i++) {
    if (Math.abs(shares[i] - 1 / 3) > Math.abs(shares[worst] - 1 / 3)) worst = i
  }
  const key = value <= 3 ? 'balanced' : `${names[worst]}-${shares[worst] > 1 / 3 ? 'long' : 'short'}`

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const x0 = D.zyR.x - 0.05 * W
  const x1 = D.zyL.x + 0.05 * W
  const ys = [D.tr.y, D.g.y, D.sn.y, D.me.y]
  const shapes: Shape[] = ys.map((y, i) => hline(y, x0, x1, { tone: i === 0 && !known ? 'muted' : 'accent', dash: i === 0 && !known }))
  for (let i = 0; i < 3; i++) {
    const text = i === 0 && !known ? 'hairline?' : `${pct(i === 0 ? shares[0] : known ? shares[i] : shares[i] * (2 / 3))}%`
    shapes.push({ t: 'span', a: { x: x1 + 0.08 * W, y: ys[i] }, b: { x: x1 + 0.08 * W, y: ys[i + 1] }, text, side: -1, tone: i === worst ? 'warn' : 'white' })
  }
  const details = [
    { label: 'Upper (hairline to brow)', value: known ? `${pct(shares[0])}%` : 'hairline not found' },
    { label: 'Middle (brow to nose base)', value: `${pct(known ? shares[1] : shares[1] * (2 / 3))}%` },
    { label: 'Lower (nose base to chin)', value: `${pct(known ? shares[2] : shares[2] * (2 / 3))}%` },
  ]
  const mmUpper = mmText(ctx, upper)
  if (ctx.mm && known && mmUpper) details.push({ label: 'Thirds in mm', value: [upper, middle, lower].map((d) => Math.round(d * ctx.mm!)).join(' · ') })
  return graded(
    'thirds',
    ctx,
    value,
    display,
    { box: box([{ x: x0, y: D.tr.y }, { x: x1 + 0.12 * W, y: D.me.y }], 0.06 * W), shapes },
    details,
    (n) => `${n.toFixed(0)} pts`,
    key,
  )
}

/**
 * The classical fifths run ear to ear, five equal eye-widths. Measured
 * between the cheekbones, as a photo allows, the outer two come out narrower
 * even on a perfectly proportioned face, so each fifth is held to its share
 * of such a face rather than to a flat 20%.
 */
export const FIFTH_TARGETS = [0.175, 0.215, 0.22, 0.215, 0.175]

export function fifths(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const xs = [p.zyR.x, p.exR.x, p.enR.x, p.enL.x, p.exL.x, p.zyL.x]
  const total = xs[5] - xs[0]
  const shares = [0, 1, 2, 3, 4].map((i) => (xs[i + 1] - xs[i]) / total)
  const value = Math.max(...shares.map((s, i) => Math.abs(s - FIFTH_TARGETS[i]))) * 100
  const eyes = (shares[1] + shares[3]) / 2
  const outer = (shares[0] + shares[4]) / 2
  const middle = shares[2]
  // Name the fifth that strays furthest.
  const parts = [
    { name: 'outer', dev: outer - FIFTH_TARGETS[0] },
    { name: 'eyes', dev: eyes - FIFTH_TARGETS[1] },
    { name: 'middle', dev: middle - FIFTH_TARGETS[2] },
  ].sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev))
  const key = value <= 2.5 ? 'balanced' : `${parts[0].name}-${parts[0].dev > 0 ? 'wide' : 'narrow'}`

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const dxs = [D.zyR.x, D.exR.x, D.enR.x, D.enL.x, D.exL.x, D.zyL.x]
  const eyeY = (D.exR.y + D.exL.y + D.enR.y + D.enL.y) / 4
  const shapes: Shape[] = dxs.map((x) => vline(x, eyeY - 0.16 * W, eyeY + 0.16 * W, { tone: 'accent' }))
  for (let i = 0; i < 5; i++) {
    shapes.push({
      t: 'span',
      a: { x: dxs[i], y: eyeY + 0.2 * W },
      b: { x: dxs[i + 1], y: eyeY + 0.2 * W },
      text: `${pct(shares[i])}%`,
      side: 1,
      tone: Math.abs(shares[i] - FIFTH_TARGETS[i]) * 100 > 2.5 ? 'warn' : 'white',
    })
  }
  return graded(
    'fifths',
    ctx,
    value,
    shares.map(pct).join(' · ') + '%',
    { box: box([{ x: dxs[0], y: eyeY - 0.2 * W }, { x: dxs[5], y: eyeY + 0.34 * W }], 0.06 * W), shapes },
    [
      { label: 'Outer fifths (cheek to eye)', value: `${pct(shares[0])}% · ${pct(shares[4])}%` },
      { label: 'Eye widths', value: `${pct(shares[1])}% · ${pct(shares[3])}%` },
      { label: 'Between the eyes', value: `${pct(shares[2])}%` },
    ],
    (n) => `${n.toFixed(1)} pts`,
    key,
  )
}

export function fwhr(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const width = p.zyL.x - p.zyR.x
  const height = p.ls.y - p.g.y
  const value = width / height

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const cheekY = (D.zyR.y + D.zyL.y) / 2
  const shapes: Shape[] = [
    hline(D.g.y, D.zyR.x, D.zyL.x, { tone: 'muted', dash: true }),
    hline(D.ls.y, D.zyR.x, D.zyL.x, { tone: 'muted', dash: true }),
    { t: 'poly', pts: [{ x: D.zyR.x, y: D.g.y }, { x: D.zyL.x, y: D.g.y }, { x: D.zyL.x, y: D.ls.y }, { x: D.zyR.x, y: D.ls.y }], closed: true, tone: 'accent', fill: true },
    { t: 'span', a: { x: D.zyR.x, y: cheekY }, b: { x: D.zyL.x, y: cheekY }, text: 'width', side: -1, tone: 'white' },
    { t: 'span', a: { x: D.zyL.x + 0.06 * W, y: D.g.y }, b: { x: D.zyL.x + 0.06 * W, y: D.ls.y }, text: 'height', side: 1, tone: 'white' },
  ]
  const details = [{ label: 'Cheekbone width', value: mmText(ctx, width) ?? `${Math.round(width)} px` }]
  const h = mmText(ctx, height)
  if (h) details.push({ label: 'Brow-to-lip height', value: h })
  return graded('fwhr', ctx, value, f2(value), { box: box([{ x: D.zyR.x, y: D.g.y }, { x: D.zyL.x + 0.3 * W, y: D.ls.y }], 0.08 * W), shapes }, details)
}

export function midface(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const ipd = dist(p.pR, p.pL)
  const height = p.sto.y - (p.pR.y + p.pL.y) / 2
  const value = ipd / height

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const py = (D.pR.y + D.pL.y) / 2
  const shapes: Shape[] = [
    { t: 'poly', pts: [{ x: D.pR.x, y: py }, { x: D.pL.x, y: py }, { x: D.pL.x, y: D.sto.y }, { x: D.pR.x, y: D.sto.y }], closed: true, tone: 'accent', fill: true },
    { t: 'span', a: { x: D.pR.x, y: py - 0.05 * W }, b: { x: D.pL.x, y: py - 0.05 * W }, text: 'pupils', side: -1, tone: 'white' },
    { t: 'span', a: { x: D.pL.x + 0.07 * W, y: py }, b: { x: D.pL.x + 0.07 * W, y: D.sto.y }, text: 'height', side: 1, tone: 'white' },
    { t: 'dot', p: D.pR, tone: 'accent' },
    { t: 'dot', p: D.pL, tone: 'accent' },
  ]
  const details = [{ label: 'Pupil distance', value: mmText(ctx, ipd) ?? `${Math.round(ipd)} px` }]
  const h = mmText(ctx, height)
  if (h) details.push({ label: 'Pupils to lip line', value: h })
  return graded('midface', ctx, value, f2(value), { box: box([{ x: D.pR.x, y: py }, { x: D.pL.x + 0.3 * W, y: D.sto.y }], 0.14 * W), shapes }, details)
}

export function faceIndex(ctx: FrontContext): MetricResult {
  const { p, lm } = ctx.M
  const n = lm(LM.nasion)
  const width = p.zyL.x - p.zyR.x
  const value = (p.me.y - n.y) / width
  const lengthRatio = (p.me.y - p.tr.y) / width
  const key = value < 0.78 ? 'broad' : value < 0.86 ? 'medium' : value < 0.93 ? 'long' : 'very-long'

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const dn = ctx.D.lm(LM.nasion)
  const cheekY = (D.zyR.y + D.zyL.y) / 2
  const shapes: Shape[] = [
    { t: 'span', a: { x: D.zyR.x, y: cheekY }, b: { x: D.zyL.x, y: cheekY }, text: 'width', side: -1, tone: 'white' },
    { t: 'span', a: { x: D.zyL.x + 0.08 * W, y: dn.y }, b: { x: D.zyL.x + 0.08 * W, y: D.me.y }, text: 'height', side: 1, tone: 'accent' },
    hline(dn.y, dn.x - 0.1 * W, D.zyL.x + 0.1 * W, { tone: 'muted', dash: true }),
    hline(D.me.y, D.me.x - 0.1 * W, D.zyL.x + 0.1 * W, { tone: 'muted', dash: true }),
  ]
  const details = [
    { label: 'Morphological facial index', value: `${Math.round(value * 100)}` },
    { label: 'Face length ÷ width (from hairline)', value: ctx.hairline === 'detected' || ctx.hairline === 'adjusted' ? f2(lengthRatio) : '—' },
  ]
  return graded('faceIndex', ctx, value, `${Math.round(value * 100)}`, { box: box([{ x: D.zyR.x, y: dn.y }, { x: D.zyL.x + 0.3 * W, y: D.me.y }], 0.08 * W), shapes }, details, f2, key)
}

export function jawCheek(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const cheek = p.zyL.x - p.zyR.x
  const jaw = p.goL.x - p.goR.x
  const value = jaw / cheek

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const cheekY = (D.zyR.y + D.zyL.y) / 2
  const jawY = (D.goR.y + D.goL.y) / 2
  const shapes: Shape[] = [
    { t: 'span', a: { x: D.zyR.x, y: cheekY }, b: { x: D.zyL.x, y: cheekY }, text: 'cheekbones', side: -1, tone: 'white' },
    { t: 'span', a: { x: D.goR.x, y: jawY }, b: { x: D.goL.x, y: jawY }, text: 'jaw', side: 1, tone: 'accent' },
    { t: 'poly', pts: [D.zyR, D.goR, D.me, D.goL, D.zyL], tone: 'accent', dash: true },
    { t: 'dot', p: D.goR, tone: 'accent' },
    { t: 'dot', p: D.goL, tone: 'accent' },
  ]
  const details = [
    { label: 'Jaw width', value: mmText(ctx, jaw) ?? `${Math.round(jaw)} px` },
    { label: 'Cheekbone width', value: mmText(ctx, cheek) ?? `${Math.round(cheek)} px` },
  ]
  return graded('jawCheek', ctx, value, f2(value), { box: box([D.zyR, D.zyL, D.goR, D.goL, D.me], 0.08 * W), shapes }, details)
}

/** Tilt of each eye's corner-to-corner line: positive when the outer corner is higher. */
export function canthalAngles(p: FrontPoints): { right: number; left: number } {
  return {
    right: toDeg(Math.atan2(p.enR.y - p.exR.y, p.enR.x - p.exR.x)),
    left: toDeg(Math.atan2(p.enL.y - p.exL.y, p.exL.x - p.enL.x)),
  }
}

export function canthalTilt(ctx: FrontContext): MetricResult {
  const { right, left } = canthalAngles(ctx.M.p)
  const value = (right + left) / 2

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const shapes: Shape[] = []
  for (const [en, ex, deg] of [
    [D.enR, D.exR, right],
    [D.enL, D.exL, left],
  ] as const) {
    const reach = dist(en, ex) * 1.25
    const dir = Math.sign(ex.x - en.x)
    const flat = { x: en.x + dir * reach, y: en.y }
    const along = lerp(en, ex, 1.25)
    shapes.push(
      { t: 'line', a: en, b: flat, tone: 'muted', dash: true },
      { t: 'line', a: en, b: along, tone: 'accent', w: 1.5 },
      { t: 'arc', c: en, a: flat, b: along, r: reach * 0.7, tone: 'accent' },
      { t: 'label', p: { x: en.x + dir * reach * 0.55, y: en.y + 0.07 * W }, text: signedDeg(deg), tone: 'white', anchor: 'middle' },
      { t: 'dot', p: en, tone: 'accent' },
      { t: 'dot', p: ex, tone: 'accent' },
    )
  }
  return graded(
    'canthalTilt',
    ctx,
    value,
    signedDeg(value),
    { box: box([D.exR, D.exL, D.enR, D.enL], 0.12 * W, 0.12 * W), shapes },
    [
      { label: 'Right eye', value: signedDeg(right) },
      { label: 'Left eye', value: signedDeg(left) },
    ],
    (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}°`,
  )
}

export function eyeSpacing(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const inter = dist(p.enR, p.enL)
  const wR = dist(p.exR, p.enR)
  const wL = dist(p.exL, p.enL)
  const value = inter / ((wR + wL) / 2)

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const y = Math.max(D.exR.y, D.enR.y, D.enL.y, D.exL.y) + 0.07 * W
  const shapes: Shape[] = [
    { t: 'span', a: { x: D.exR.x, y }, b: { x: D.enR.x, y }, text: 'eye', side: 1, tone: 'white' },
    { t: 'span', a: { x: D.enR.x, y }, b: { x: D.enL.x, y }, text: 'between', side: 1, tone: 'accent' },
    { t: 'span', a: { x: D.enL.x, y }, b: { x: D.exL.x, y }, text: 'eye', side: 1, tone: 'white' },
    ...[D.exR, D.enR, D.enL, D.exL].map((q): Shape => ({ t: 'line', a: q, b: { x: q.x, y }, tone: 'muted', dash: true })),
    ...[D.exR, D.enR, D.enL, D.exL].map((q): Shape => ({ t: 'dot', p: q, tone: 'accent' })),
  ]
  const details = [
    { label: 'Between the eyes', value: mmText(ctx, inter) ?? f2(inter / wR) },
    { label: 'Eye widths (right · left)', value: ctx.mm ? `${Math.round(wR * ctx.mm)} · ${Math.round(wL * ctx.mm)} mm` : `${Math.round(wR)} · ${Math.round(wL)} px` },
  ]
  return graded('eyeSpacing', ctx, value, f2(value), { box: box([D.exR, D.exL, { x: D.exR.x, y: y + 0.08 * W }], 0.08 * W, 0.1 * W), shapes }, details)
}

export function eyeSeparation(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const ipd = dist(p.pR, p.pL)
  const width = p.zyL.x - p.zyR.x
  const value = ipd / width

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const py = (D.pR.y + D.pL.y) / 2
  const cheekY = Math.max(py + 0.12 * W, (D.zyR.y + D.zyL.y) / 2)
  const shapes: Shape[] = [
    { t: 'span', a: { x: D.pR.x, y: py - 0.06 * W }, b: { x: D.pL.x, y: py - 0.06 * W }, text: 'pupils', side: -1, tone: 'accent' },
    { t: 'span', a: { x: D.zyR.x, y: cheekY }, b: { x: D.zyL.x, y: cheekY }, text: 'face width', side: 1, tone: 'white' },
    { t: 'dot', p: D.pR, tone: 'accent' },
    { t: 'dot', p: D.pL, tone: 'accent' },
  ]
  const details = [{ label: 'Pupil distance', value: mmText(ctx, ipd) ?? `${Math.round(ipd)} px` }]
  return graded('eyeSeparation', ctx, value, `${(value * 100).toFixed(1)}%`, { box: box([D.zyR, D.zyL, { x: D.pR.x, y: py - 0.12 * W }, { x: D.pR.x, y: cheekY + 0.08 * W }], 0.06 * W), shapes }, details, (n) => `${(n * 100).toFixed(0)}%`)
}

export function eyeShape(ctx: FrontContext): MetricResult {
  const { p, lm } = ctx.M
  const ratio = (top: number, bottom: number, ex: Vec2, en: Vec2) => dist(lm(top), lm(bottom)) / dist(ex, en)
  const right = ratio(EYE_RIGHT.top, EYE_RIGHT.bottom, p.exR, p.enR)
  const left = ratio(EYE_LEFT.top, EYE_LEFT.bottom, p.exL, p.enL)
  const value = (right + left) / 2
  const key = value < 0.27 ? 'narrow' : value < 0.34 ? 'almond' : value < 0.4 ? 'open' : 'round'

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const outline = (e: typeof EYE_RIGHT) => [...e.upper, ...[...e.lower].reverse().slice(1, -1)].map(ctx.D.lm)
  const shapes: Shape[] = [
    { t: 'poly', pts: outline(EYE_RIGHT), closed: true, tone: 'accent' },
    { t: 'poly', pts: outline(EYE_LEFT), closed: true, tone: 'accent' },
    { t: 'line', a: ctx.D.lm(EYE_RIGHT.top), b: ctx.D.lm(EYE_RIGHT.bottom), tone: 'white' },
    { t: 'line', a: ctx.D.lm(EYE_LEFT.top), b: ctx.D.lm(EYE_LEFT.bottom), tone: 'white' },
    { t: 'line', a: D.exR, b: D.enR, tone: 'muted', dash: true },
    { t: 'line', a: D.exL, b: D.enL, tone: 'muted', dash: true },
  ]
  return graded(
    'eyeShape',
    ctx,
    value,
    f2(value),
    { box: box([D.exR, D.exL, D.enR, D.enL], 0.1 * W, 0.1 * W), shapes },
    [
      { label: 'Right eye height ÷ width', value: f2(right) },
      { label: 'Left eye height ÷ width', value: f2(left) },
    ],
    f2,
    key,
  )
}

function browGeometry(s: Space, brow: typeof BROW_RIGHT) {
  const upper = brow.upper.map(s.lm)
  const lower = brow.lower.map(s.lm)
  const head = mid(upper[0], lower[0])
  const tail = mid(upper[upper.length - 1], lower[lower.length - 1])
  const peak = upper.reduce((a, b) => (b.y < a.y ? b : a))
  return { upper, lower, head, tail, peak }
}

export function browPosition(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const ipd = dist(p.pR, p.pL)
  const height = (pupil: Vec2, brow: typeof BROW_RIGHT) => pupil.y - interpolateAtX(browGeometry(ctx.M, brow).lower, pupil.x)
  const right = height(p.pR, BROW_RIGHT) / ipd
  const left = height(p.pL, BROW_LEFT) / ipd
  const value = (right + left) / 2
  const low = ctx.sex === 'male' ? 0.22 : 0.25
  const high = ctx.sex === 'male' ? 0.3 : 0.33
  const key = value < low ? 'low' : value > high ? 'high' : 'medium'

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const shapes: Shape[] = []
  for (const [pupil, brow] of [
    [D.pR, BROW_RIGHT],
    [D.pL, BROW_LEFT],
  ] as const) {
    const g = browGeometry(ctx.D, brow)
    const by = interpolateAtX(g.lower, pupil.x)
    shapes.push(
      { t: 'poly', pts: [...g.upper, ...[...g.lower].reverse()], closed: true, tone: 'accent' },
      { t: 'span', a: { x: pupil.x, y: pupil.y }, b: { x: pupil.x, y: by }, tone: 'white', side: 1 },
      { t: 'dot', p: pupil, tone: 'accent' },
    )
  }
  const mmR = mmText(ctx, right * ipd)
  return graded(
    'browPosition',
    ctx,
    value,
    f2(value),
    { box: box([D.pR, D.pL, ...browGeometry(ctx.D, BROW_RIGHT).upper, ...browGeometry(ctx.D, BROW_LEFT).upper], 0.12 * W, 0.08 * W), shapes },
    [
      { label: 'Pupil to brow ÷ pupil distance', value: `${f2(right)} · ${f2(left)}` },
      ...(mmR && ctx.mm ? [{ label: 'Pupil to brow', value: `${Math.round(right * ipd * ctx.mm)} · ${Math.round(left * ipd * ctx.mm)} mm` }] : []),
    ],
    f2,
    key,
  )
}

export function browTilt(ctx: FrontContext): MetricResult {
  // Along the lower edge, which is crisp; the upper edge fades into the brow hair.
  const tilt = (s: Space, brow: typeof BROW_RIGHT, side: 1 | -1) => {
    const head = s.lm(brow.lower[0])
    const tail = s.lm(brow.lower[brow.lower.length - 1])
    return toDeg(Math.atan2(head.y - tail.y, (tail.x - head.x) * side))
  }
  const right = tilt(ctx.M, BROW_RIGHT, -1)
  const left = tilt(ctx.M, BROW_LEFT, 1)
  const value = (right + left) / 2
  // Arch: how far the peak rises above the head-to-tail line, relative to brow length.
  const arch = (brow: typeof BROW_RIGHT) => {
    const g = browGeometry(ctx.M, brow)
    const base = interpolateAtX([g.head, g.tail], g.peak.x)
    return (base - g.peak.y) / dist(g.head, g.tail)
  }
  const archAvg = (arch(BROW_RIGHT) + arch(BROW_LEFT)) / 2
  const key = value > 3 ? 'rising' : value < -6 ? 'falling' : archAvg > 0.24 ? 'arched' : archAvg < 0.14 ? 'straight' : 'soft'

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const shapes: Shape[] = []
  for (const brow of [BROW_RIGHT, BROW_LEFT]) {
    const g = browGeometry(ctx.D, brow)
    const head = ctx.D.lm(brow.lower[0])
    const tail = ctx.D.lm(brow.lower[brow.lower.length - 1])
    shapes.push(
      { t: 'poly', pts: [...g.upper, ...[...g.lower].reverse()], closed: true, tone: 'muted' },
      { t: 'line', a: head, b: tail, tone: 'accent', w: 1.5 },
      { t: 'line', a: head, b: { x: tail.x, y: head.y }, tone: 'muted', dash: true },
      { t: 'dot', p: head, tone: 'accent' },
      { t: 'dot', p: tail, tone: 'accent' },
      { t: 'dot', p: g.peak, tone: 'white', r: 2 },
    )
  }
  return graded(
    'browTilt',
    ctx,
    value,
    signedDeg(value),
    { box: box([...browGeometry(ctx.D, BROW_RIGHT).upper, ...browGeometry(ctx.D, BROW_LEFT).upper, D.pR, D.pL], 0.1 * W, 0.08 * W), shapes },
    [
      { label: 'Right · left brow', value: `${signedDeg(right)} · ${signedDeg(left)}` },
      { label: 'Arch height', value: `${Math.round(archAvg * 100)}% of brow length` },
    ],
    f2,
    key,
  )
}

export function noseWidth(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const nose = dist(p.alR, p.alL)
  const inter = dist(p.enR, p.enL)
  const value = nose / inter

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const ny = (D.alR.y + D.alL.y) / 2
  const shapes: Shape[] = [
    vline(D.enR.x, D.enR.y, ny + 0.05 * W, { tone: 'muted', dash: true }),
    vline(D.enL.x, D.enL.y, ny + 0.05 * W, { tone: 'muted', dash: true }),
    { t: 'span', a: { x: D.enR.x, y: D.enR.y - 0.05 * W }, b: { x: D.enL.x, y: D.enL.y - 0.05 * W }, text: 'eyes', side: -1, tone: 'white' },
    { t: 'span', a: { x: D.alR.x, y: ny + 0.09 * W }, b: { x: D.alL.x, y: ny + 0.09 * W }, text: 'nose', side: 1, tone: 'accent' },
    { t: 'dot', p: D.alR, tone: 'accent' },
    { t: 'dot', p: D.alL, tone: 'accent' },
    { t: 'dot', p: D.enR, tone: 'white' },
    { t: 'dot', p: D.enL, tone: 'white' },
  ]
  const details = [
    { label: 'Nose width', value: mmText(ctx, nose) ?? `${Math.round(nose)} px` },
    { label: 'Between the eyes', value: mmText(ctx, inter) ?? `${Math.round(inter)} px` },
  ]
  return graded('noseWidth', ctx, value, f2(value), { box: box([D.enR, D.enL, D.alR, D.alL, { x: D.alR.x, y: ny + 0.16 * W }], 0.14 * W, 0.08 * W), shapes }, details)
}

export function mouthNose(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const mouth = dist(p.chR, p.chL)
  const nose = dist(p.alR, p.alL)
  const value = mouth / nose

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const ny = (D.alR.y + D.alL.y) / 2
  const my = (D.chR.y + D.chL.y) / 2
  const shapes: Shape[] = [
    { t: 'span', a: { x: D.alR.x, y: ny - 0.02 * W }, b: { x: D.alL.x, y: ny - 0.02 * W }, text: 'nose', side: -1, tone: 'white' },
    { t: 'span', a: { x: D.chR.x, y: my + 0.07 * W }, b: { x: D.chL.x, y: my + 0.07 * W }, text: 'mouth', side: 1, tone: 'accent' },
    vline(D.alR.x, ny, my, { tone: 'muted', dash: true }),
    vline(D.alL.x, ny, my, { tone: 'muted', dash: true }),
    { t: 'dot', p: D.chR, tone: 'accent' },
    { t: 'dot', p: D.chL, tone: 'accent' },
  ]
  const details = [
    { label: 'Mouth width', value: mmText(ctx, mouth) ?? `${Math.round(mouth)} px` },
    { label: 'Nose width', value: mmText(ctx, nose) ?? `${Math.round(nose)} px` },
  ]
  return graded('mouthNose', ctx, value, f2(value), { box: box([D.chR, D.chL, D.alR, D.alL, { x: D.chR.x, y: my + 0.14 * W }], 0.1 * W, 0.1 * W), shapes }, details)
}

export function lipRatio(ctx: FrontContext): MetricResult {
  const { p, lm } = ctx.M
  const upper = lm(LM.upperLipInner).y - p.ls.y
  const lower = p.li.y - lm(LM.lowerLipInner).y
  const value = lower / Math.max(upper, 1e-6)

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const inU = ctx.D.lm(LM.upperLipInner)
  const inL = ctx.D.lm(LM.lowerLipInner)
  const x = D.chL.x + 0.05 * W
  const shapes: Shape[] = [
    hline(D.ls.y, D.ls.x - 0.05 * W, x, { tone: 'muted', dash: true }),
    hline(inU.y, inU.x, x, { tone: 'muted', dash: true }),
    hline(inL.y, inL.x, x, { tone: 'muted', dash: true }),
    hline(D.li.y, D.li.x - 0.05 * W, x, { tone: 'muted', dash: true }),
    { t: 'span', a: { x, y: D.ls.y }, b: { x, y: inU.y }, text: 'upper', side: 1, tone: 'white' },
    { t: 'span', a: { x, y: inL.y }, b: { x, y: D.li.y }, text: 'lower', side: 1, tone: 'accent' },
  ]
  const details = ctx.mm
    ? [{ label: 'Upper · lower lip height', value: `${(upper * ctx.mm).toFixed(1)} · ${(lower * ctx.mm).toFixed(1)} mm` }]
    : []
  return graded('lipRatio', ctx, value, `1 : ${value.toFixed(2)}`, { box: box([D.chR, D.chL, D.ls, D.li, { x: x + 0.22 * W, y: D.li.y }], 0.06 * W, 0.08 * W), shapes }, details, (n) => n.toFixed(1))
}

export function lowerThird(ctx: FrontContext): MetricResult {
  const { p } = ctx.M
  const upper = p.sto.y - p.sn.y
  const lower = p.me.y - p.sto.y
  const value = lower / upper

  const D = ctx.D.p
  const W = widthOf(ctx.D)
  const x = D.chL.x + 0.08 * W
  const shapes: Shape[] = [
    hline(D.sn.y, D.sn.x - 0.1 * W, x, { tone: 'muted', dash: true }),
    hline(D.sto.y, D.chR.x, x, { tone: 'muted', dash: true }),
    hline(D.me.y, D.me.x - 0.1 * W, x, { tone: 'muted', dash: true }),
    { t: 'span', a: { x, y: D.sn.y }, b: { x, y: D.sto.y }, text: '1', side: 1, tone: 'white' },
    { t: 'span', a: { x, y: D.sto.y }, b: { x, y: D.me.y }, text: value.toFixed(1), side: 1, tone: 'accent' },
  ]
  const details = ctx.mm
    ? [{ label: 'Nose-to-lips · lips-to-chin', value: `${Math.round(upper * ctx.mm)} · ${Math.round(lower * ctx.mm)} mm` }]
    : []
  return graded('lowerThird', ctx, value, `1 : ${value.toFixed(2)}`, { box: box([D.sn, D.me, D.chR, { x: x + 0.2 * W, y: D.me.y }], 0.08 * W), shapes }, details, (n) => n.toFixed(1))
}

export const FRONT_METRICS = [
  thirds,
  fifths,
  fwhr,
  midface,
  faceIndex,
  canthalTilt,
  eyeSpacing,
  eyeSeparation,
  eyeShape,
  browPosition,
  browTilt,
  noseWidth,
  mouthNose,
  lipRatio,
  lowerThird,
  jawCheek,
]
