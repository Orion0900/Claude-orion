import { angleAt, dist, lineAngle, signedDistance, sub, dot, norm, perp } from './geometry'
import type { MetricSpec } from './metrics/ideals'
import { idealRange } from './metrics/ideals'
import { bandOf, scoreValue } from './metrics/scoring'
import type { MetricResult, Shape } from './metrics/types'
import type { Sex, Vec2 } from './types'

/**
 * The side-profile points, in the order they're placed. Soft-tissue
 * landmarks of cephalometric profile analysis, named for someone tapping on
 * their own photo.
 */
export const PROFILE_POINTS = [
  { id: 'prn', name: 'Nose tip', hint: 'The most forward point of the nose.' },
  { id: 'me', name: 'Bottom of the chin', hint: 'The lowest point of the chin.' },
  { id: 'ea', name: 'Ear', hint: 'The small flap in front of the ear canal (the tragus).' },
  { id: 'g', name: 'Forehead', hint: 'The most forward point of the forehead, level with the brows.' },
  { id: 'n', name: 'Top of the nose', hint: 'The deepest point where the forehead meets the nose.' },
  { id: 'cm', name: 'Under the nose tip', hint: 'On the underside of the nose, just behind the tip.' },
  { id: 'sn', name: 'Base of the nose', hint: 'Where the underside of the nose meets the upper lip.' },
  { id: 'ac', name: 'Back of the nostril', hint: 'Where the nostril wing joins the cheek.' },
  { id: 'ls', name: 'Upper lip', hint: 'The most forward point of the upper lip.' },
  { id: 'li', name: 'Lower lip', hint: 'The most forward point of the lower lip.' },
  { id: 'sm', name: 'Chin crease', hint: 'The deepest point between the lower lip and the chin.' },
  { id: 'pg', name: 'Chin', hint: 'The most forward point of the chin.' },
  { id: 'c', name: 'Chin–neck corner', hint: 'Where the underside of the chin turns down into the neck.' },
  { id: 'np', name: 'Neck', hint: 'A point on the front of the neck, a little above the collar.' },
  { id: 'go', name: 'Jaw angle', hint: 'The back corner of the jaw, below the ear.' },
] as const

export type ProfilePointId = (typeof PROFILE_POINTS)[number]['id']
export type ProfilePoints = Record<ProfilePointId, Vec2>

/** The first three points anchor a template that places the rest. */
export const ANCHORS: ProfilePointId[] = ['prn', 'me', 'ea']

/**
 * A typical profile facing right, in centimetres (x forward, y up): the
 * canonical face mesh's midline seen side-on, adjusted to the average angles
 * of profile analysis (nasofrontal ≈ 130°, nasolabial ≈ 101°, lips just
 * behind the E-line), with the ear, neck and jaw corner at typical positions.
 * It only seeds the points; each is then dragged to where it really is.
 */
const TEMPLATE: ProfilePoints = {
  g: { x: 5.39, y: 4.45 },
  n: { x: 5.05, y: 3.27 },
  prn: { x: 7.8, y: -0.46 },
  cm: { x: 7.11, y: -1.5 },
  sn: { x: 6.06, y: -2.09 },
  ac: { x: 5.2, y: -0.98 },
  ls: { x: 6.5, y: -3.41 },
  li: { x: 6.1, y: -5.37 },
  sm: { x: 5.3, y: -6.2 },
  pg: { x: 5.6, y: -7.94 },
  me: { x: 4.26, y: -9.4 },
  c: { x: 0.6, y: -9.6 },
  np: { x: -0.6, y: -14.3 },
  go: { x: -3.0, y: -6.0 },
  ea: { x: -4.2, y: 1.2 },
}

/** The template drawn at `scale` pixels per centimetre with its origin at `origin`. */
export function templatePoints(scale: number, origin: Vec2, facing: 'left' | 'right' = 'right'): ProfilePoints {
  const out = {} as ProfilePoints
  const f = facing === 'right' ? 1 : -1
  for (const { id } of PROFILE_POINTS) out[id] = { x: origin.x + f * TEMPLATE[id].x * scale, y: origin.y - TEMPLATE[id].y * scale }
  return out
}

/**
 * Places every point from the three anchors: the template is flipped to face
 * the same way, then scaled, turned and moved (least squares) onto them.
 */
export function placeFromAnchors(anchors: Pick<ProfilePoints, 'prn' | 'me' | 'ea'>): ProfilePoints {
  // Template in image orientation (y down), facing right.
  const t = (id: ProfilePointId) => ({ x: TEMPLATE[id].x, y: -TEMPLATE[id].y })
  // Facing left when the nose is left of the ear.
  const flip = anchors.prn.x < anchors.ea.x ? -1 : 1
  const src = ANCHORS.map((id) => ({ x: t(id).x * flip, y: t(id).y }))
  const dst = ANCHORS.map((id) => anchors[id as 'prn' | 'me' | 'ea'])
  // Similarity transform by least squares (Umeyama without reflection).
  const mean = (ps: Vec2[]) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length })
  const ms = mean(src)
  const md = mean(dst)
  let a = 0
  let b = 0
  let ss = 0
  src.forEach((p, i) => {
    const sx = p.x - ms.x
    const sy = p.y - ms.y
    const dx = dst[i].x - md.x
    const dy = dst[i].y - md.y
    a += sx * dx + sy * dy
    b += sx * dy - sy * dx
    ss += sx * sx + sy * sy
  })
  const ca = a / ss
  const sa = b / ss
  const out = {} as ProfilePoints
  for (const { id } of PROFILE_POINTS) {
    const p = { x: t(id).x * flip - ms.x, y: t(id).y - ms.y }
    out[id] = { x: md.x + ca * p.x - sa * p.y, y: md.y + sa * p.x + ca * p.y }
  }
  for (const id of ANCHORS) out[id] = { ...anchors[id as 'prn' | 'me' | 'ea'] }
  return out
}

export const PROFILE_SPECS = {
  // Degrees at the top of the nose between forehead and nasal bridge.
  nasofrontal: { group: 'profile', ideal: { female: [120, 135], male: [115, 130] }, sigma: 6, weight: 1, gauge: [100, 160] },
  // Degrees between the underside of the nose and the upper lip.
  nasolabial: { group: 'profile', ideal: { female: [95, 115], male: [90, 105] }, sigma: 6, weight: 1, gauge: [70, 140] },
  // Degrees between the nasal bridge and the forehead–chin line.
  nasofacial: { group: 'profile', ideal: { female: [30, 40], male: [30, 40] }, sigma: 4, weight: 0.8, gauge: [20, 50] },
  // Degrees at the nose tip between the bridge and the chin.
  nasomental: { group: 'profile', ideal: { female: [120, 132], male: [120, 132] }, sigma: 4, weight: 1, gauge: [105, 145] },
  // Goode ratio: how far the tip stands out, over the nose's length.
  tipProjection: { group: 'profile', ideal: { female: [0.55, 0.6], male: [0.55, 0.6] }, sigma: 0.04, weight: 0.8, gauge: [0.4, 0.75] },
  // Degrees at the base of the nose between forehead and chin: 180 is a flat profile.
  convexity: { group: 'profile', ideal: { female: [163, 173], male: [163, 173] }, sigma: 4, weight: 1.5, gauge: [150, 185] },
  // Millimetres from Ricketts' E-line (nose tip to chin); negative is behind it.
  eLineUpper: { group: 'profile', ideal: { female: [-6, -2], male: [-6, -2] }, sigma: 2, weight: 1, gauge: [-12, 6] },
  eLineLower: { group: 'profile', ideal: { female: [-4, 0], male: [-4, 0] }, sigma: 2, weight: 1, gauge: [-10, 8] },
  // Degrees in the crease between the lower lip and the chin.
  mentolabial: { group: 'profile', ideal: { female: [110, 135], male: [110, 135] }, sigma: 8, weight: 0.8, gauge: [80, 160] },
  // Degrees at the corner under the chin, between the chin's underside and the neck.
  cervicomental: { group: 'profile', ideal: { female: [95, 120], male: [95, 120] }, sigma: 8, weight: 1.5, gauge: [80, 150] },
  // Degrees at the jaw's corner, between the line to the ear and the jawline.
  gonial: { group: 'profile', ideal: { female: [120, 130], male: [112, 125] }, sigma: 5, weight: 1.5, gauge: [95, 145] },
  // Degrees between the forehead–chin line and the underside of the chin.
  mentocervical: { group: 'profile', ideal: { female: [80, 95], male: [80, 95] }, sigma: 5, weight: 1, gauge: [60, 115] },
} satisfies Record<string, MetricSpec>

export type ProfileMetricId = keyof typeof PROFILE_SPECS

/** Average soft-tissue nasion-to-chin height, mm, for a scale when there's no front photo. */
export const TYPICAL_FACE_HEIGHT_MM: Record<Sex, number> = { female: 112, male: 121 }

export interface ProfileAnalysis {
  metrics: MetricResult[]
  /** Millimetres per pixel, and where the scale came from. */
  mmPerPx: number
  scaleFrom: 'front' | 'average'
  facing: 'left' | 'right'
}

const deg = (n: number) => `${Math.round(n)}°`
const mmFmt = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)} mm`

/**
 * Measures the profile. `frontFaceHeightMm` — the nasion-to-chin height from
 * a front analysis — sets the millimetre scale; without it an average is used.
 */
export function analyzeProfile(p: ProfilePoints, sex: Sex, frontFaceHeightMm: number | null): ProfileAnalysis {
  const facing = p.prn.x >= p.ea.x ? 'right' : 'left'
  const heightPx = dist(p.n, p.me)
  const mmPerPx = (frontFaceHeightMm ?? TYPICAL_FACE_HEIGHT_MM[sex]) / heightPx
  const W = heightPx

  // "Forward" is the way the face points: from the ear towards the nose.
  const forward = norm(sub(p.prn, p.ea))
  /** Signed distance of q in front of (+) or behind (−) the line a→b, in mm. */
  const ahead = (q: Vec2, a: Vec2, b: Vec2) => {
    let n = perp(norm(sub(b, a)))
    if (dot(n, forward) < 0) n = { x: -n.x, y: -n.y }
    return dot(sub(q, a), n) * mmPerPx
  }

  const results: MetricResult[] = []
  const add = (id: ProfileMetricId, value: number, display: string, shapes: Shape[], format: (n: number) => string, details: { label: string; value: string }[] = []) => {
    const spec: MetricSpec = PROFILE_SPECS[id]
    const ideal = idealRange(spec, sex)!
    const { band, dir } = bandOf(value, ideal, spec.sigma!)
    const xs = shapes.flatMap((s) => ('a' in s ? [s.a, s.b] : 'p' in s ? [s.p] : 'pts' in s ? s.pts : []))
    const minX = Math.min(...xs.map((q) => q.x))
    const minY = Math.min(...xs.map((q) => q.y))
    const maxX = Math.max(...xs.map((q) => q.x))
    const maxY = Math.max(...xs.map((q) => q.y))
    const pad = 0.12 * W
    results.push({
      id,
      group: 'profile',
      value,
      display,
      ideal,
      idealDisplay: `${format(ideal.lo)} – ${format(ideal.hi)}`,
      gauge: { lo: spec.gauge[0], hi: spec.gauge[1] },
      score: scoreValue(value, ideal, spec.sigma!),
      band,
      dir,
      key: dir === 0 ? 'ideal' : dir < 0 ? 'low' : 'high',
      details,
      overlay: { box: { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }, shapes },
      weight: spec.weight,
    })
  }
  const angleShapes = (vertex: Vec2, a: Vec2, b: Vec2, value: number): Shape[] => [
    { t: 'line', a: vertex, b: a, tone: 'accent', w: 1.5 },
    { t: 'line', a: vertex, b: b, tone: 'accent', w: 1.5 },
    { t: 'arc', c: vertex, a, b, r: Math.min(dist(vertex, a), dist(vertex, b)) * 0.45, tone: 'white', text: deg(value) },
    { t: 'dot', p: vertex, tone: 'accent' },
    { t: 'dot', p: a, tone: 'white' },
    { t: 'dot', p: b, tone: 'white' },
  ]

  const nf = angleAt(p.n, p.g, p.prn)
  add('nasofrontal', nf, deg(nf), angleShapes(p.n, p.g, p.prn, nf), deg)

  const nl = angleAt(p.sn, p.cm, p.ls)
  add('nasolabial', nl, deg(nl), angleShapes(p.sn, p.cm, p.ls, nl), deg)

  const nfa = lineAngle(p.g, p.pg, p.n, p.prn)
  add(
    'nasofacial',
    nfa,
    deg(nfa),
    [
      { t: 'line', a: p.g, b: p.pg, tone: 'muted', dash: true },
      { t: 'line', a: p.n, b: p.prn, tone: 'accent', w: 1.5 },
      { t: 'dot', p: p.n, tone: 'accent' },
      { t: 'dot', p: p.prn, tone: 'accent' },
      { t: 'label', p: { x: (p.n.x + p.prn.x) / 2 + (facing === 'right' ? 0.08 : -0.08) * W, y: (p.n.y + p.prn.y) / 2 }, text: deg(nfa), tone: 'white', anchor: 'middle' },
    ],
    deg,
  )

  const nm = angleAt(p.prn, p.n, p.pg)
  add('nasomental', nm, deg(nm), angleShapes(p.prn, p.n, p.pg, nm), deg)

  const proj = Math.abs(signedDistance(p.prn, p.n, p.ac)) / dist(p.n, p.prn)
  add(
    'tipProjection',
    proj,
    proj.toFixed(2),
    [
      { t: 'line', a: p.n, b: p.ac, tone: 'muted', dash: true },
      { t: 'span', a: p.prn, b: projectOnto(p.prn, p.n, p.ac), tone: 'accent', text: 'tip' },
      { t: 'span', a: p.n, b: p.prn, tone: 'white', text: 'length', side: facing === 'right' ? -1 : 1 },
      { t: 'dot', p: p.ac, tone: 'accent' },
    ],
    (n) => n.toFixed(2),
  )

  // Convexity is read on the face's side of the line: a nose base in front of
  // the forehead–chin line is convex (under 180°), one behind it concave.
  const bend = angleAt(p.sn, p.g, p.pg)
  const cx = ahead(p.sn, p.g, p.pg) >= 0 ? bend : 360 - bend
  add('convexity', cx, deg(cx), angleShapes(p.sn, p.g, p.pg, cx), deg)

  const eShapes = (q: Vec2, v: number): Shape[] => [
    { t: 'line', a: p.prn, b: p.pg, tone: 'muted', dash: true },
    { t: 'span', a: q, b: projectOnto(q, p.prn, p.pg), tone: v > 0 ? 'warn' : 'accent', text: mmFmt(v) },
    { t: 'dot', p: q, tone: 'accent' },
  ]
  const eu = ahead(p.ls, p.prn, p.pg)
  add('eLineUpper', eu, mmFmt(eu), eShapes(p.ls, eu), (n) => `${n}`, [{ label: 'Scale', value: frontFaceHeightMm ? 'from your front photo' : 'from an average face height' }])
  const el = ahead(p.li, p.prn, p.pg)
  add('eLineLower', el, mmFmt(el), eShapes(p.li, el), (n) => `${n}`, [{ label: 'Scale', value: frontFaceHeightMm ? 'from your front photo' : 'from an average face height' }])

  const ml = angleAt(p.sm, p.li, p.pg)
  add('mentolabial', ml, deg(ml), angleShapes(p.sm, p.li, p.pg, ml), deg)

  const cm = angleAt(p.c, p.me, p.np)
  add('cervicomental', cm, deg(cm), angleShapes(p.c, p.me, p.np, cm), deg)

  const go = angleAt(p.go, p.ea, p.me)
  add('gonial', go, deg(go), angleShapes(p.go, p.ea, p.me, go), deg)

  // Between the face's line running down (forehead to chin) and the chin's
  // underside running back (chin to neck corner): 90° when they're square.
  const down = sub(p.pg, p.g)
  const backLine = sub(p.c, p.me)
  const mc = (Math.atan2(Math.abs(down.x * backLine.y - down.y * backLine.x), dot(down, backLine)) * 180) / Math.PI
  add(
    'mentocervical',
    mc,
    deg(mc),
    [
      { t: 'line', a: p.g, b: p.pg, tone: 'muted', dash: true },
      { t: 'line', a: p.me, b: p.c, tone: 'accent', w: 1.5 },
      { t: 'dot', p: p.me, tone: 'accent' },
      { t: 'dot', p: p.c, tone: 'accent' },
      { t: 'label', p: { x: (p.me.x + p.c.x) / 2, y: (p.me.y + p.c.y) / 2 + 0.06 * W }, text: deg(mc), tone: 'white', anchor: 'middle' },
    ],
    deg,
  )

  return { metrics: results, mmPerPx, scaleFrom: frontFaceHeightMm ? 'front' : 'average', facing }
}

function projectOnto(q: Vec2, a: Vec2, b: Vec2): Vec2 {
  const d = sub(b, a)
  const t = dot(sub(q, a), d) / dot(d, d)
  return { x: a.x + d.x * t, y: a.y + d.y * t }
}
