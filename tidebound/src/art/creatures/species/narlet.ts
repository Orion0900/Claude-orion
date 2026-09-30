/**
 * NARLET → NARWHELM → TIDELANCE: the narwhal starter line.
 */
import type { SpeciesId } from '../../../data/dex'
import type { Canvas, P3 } from '../canvas'
import type { Ramp } from '../color'
import { eye, iconEye, type Recipe } from '../kit'
import { teardrop } from '../parts'

/** A long spiral tusk from base to tip with diagonal twist lines. */
function tusk(s: Canvas, x0: number, y0: number, x1: number, y1: number, r0: number, r: Ramp, g: string, twists: number, icon: boolean): void {
  s.limb(x0, y0, r0, x1, y1, 0.5, r, { g })
  if (icon) return
  const dx = x1 - x0
  const dy = y1 - y0
  const L = Math.hypot(dx, dy)
  const nx = -dy / L
  const ny = dx / L
  for (let i = 1; i < twists; i++) {
    const t = i / twists
    const rr = r0 * (1 - t) * 0.9
    const cx = x0 + dx * t
    const cy = y0 + dy * t
    s.shadeLine(cx + nx * rr, cy + ny * rr, cx - nx * rr + dx * 0.04, cy - ny * rr + dy * 0.04, 1)
  }
}

/** Paints the belly side of a tube body: a band offset toward the lower-left of the spine. */
function bellyBand(s: Canvas, spine: readonly P3[], r: Ramp, onto: string, side = 1, from = 0.15, to = 1.2): void {
  const pts = spine.map(([x, y]) => [x, y] as const)
  const offs: [number, number][] = []
  const inner: [number, number][] = []
  for (let i = 0; i < spine.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    const nx = (-dy / L) * side
    const ny = (dx / L) * side
    const rad = spine[i][2]
    inner.push([pts[i][0] + nx * rad * from, pts[i][1] + ny * rad * from])
    offs.push([pts[i][0] + nx * rad * to, pts[i][1] + ny * rad * to])
  }
  s.poly([...inner, ...offs.reverse()], r, { paint: true, onto: [onto] })
}

const narlet: Recipe = {
  size: 'S',
  front: { k: 0.97 },
  shiny: { hue: 105, sat: 0.85, band: [150, 260] },
  draw(s, p) {
    const blue = p.ramp3('#c8ecff', '#8cc8f8', '#5898e0', { deepC: '#3070c0' })
    const white = p.ramp('#ffffff', { sh: 0.1, deep: 0.2 })
    const ivory = p.ramp('#f8f0d8', { sh: 0.14, deep: 0.28 })
    const speck = p.ramp('#e0f4ff')
    const back = s.back
    const icon = s.icon

    const tail = () => {
      s.tube([[36, 52, 5.5], [44, 57, 3.8], [50, 56, 2.6], [53, 52, 1.8]], blue, { g: 'tail' })
      s.leaf(53, 53, 57.5, 45.5, 4.8, blue, { g: 'fluke' }, 1)
      s.leaf(53, 53, 60, 56, 4.4, blue, { g: 'fluke2' }, -0.6)
    }
    const flipper = (near: boolean) =>
      near
        ? s.leaf(22, 50, 14.5, 55, 5, blue, { g: 'fl1' }, 0.8)
        : s.leaf(38, 49, 45, 52.5, 4.6, blue, { g: 'fl2', under: true }, -0.6)
    const body = () => {
      s.ellipse(30, 42, 13.5, 14.5, blue, { g: 'body' })
      if (!back) s.ellipse(24, 49.5, 10, 9.5, white, { paint: true, onto: ['body'] })
      if (!icon)
        for (const [x, y] of back
          ? [
              [28, 34],
              [33, 31],
              [37, 36],
              [31, 40],
              [26, 45],
              [36, 44],
            ]
          : [
              [36, 32],
              [40, 37],
              [35, 38],
              [39, 43],
            ])
          s.dot(x, y, speck, 1)
    }
    const horn = () => {
      s.limb(21.5, 30.5, 1.7, 19, 26, 0.6, ivory, { g: 'horn' })
      if (!icon) s.shadeLine(19.5, 28.5, 21, 28, 1)
    }

    if (back) {
      horn()
      flipper(true)
      body()
      flipper(false)
      tail()
      return
    }
    flipper(false)
    tail()
    body()
    flipper(true)
    horn()
    if (icon) {
      iconEye(s, p, 24.5, 36, 'dark', { p: '#182848' })
      iconEye(s, p, 19, 36.5, 'dark', { p: '#182848' })
      return
    }
    const ec = { p: '#182848', h: '#ffffff', w: '#a8d0ff' }
    eye(s, p, 'round56', 22, 33, ec)
    s.stamp(p.stamp(['.p.', 'hpp', 'ppp', '.p.'], ec), 17.5, 34.5)
    s.pxs([19, 42, 20, 43, 21, 43, 22, 42], p.c('#305080'))
    s.pxs([27, 41, 28, 41], p.c('#ffb8c8'))
  },
}

const narwhelm: Recipe = {
  size: 'M',
  front: { k: 0.92 },
  shiny: { hue: 75, sat: 0.9, band: [150, 260] },
  draw(s, p) {
    const blue = p.ramp3('#5890d8', '#3878c8', '#1c4488', { deepC: '#122c64' })
    const white = p.ramp('#e8f4ff', { sh: 0.1, deep: 0.22 })
    const bone = p.ramp('#f4ecd0', { sh: 0.14, deep: 0.3 })
    const spot = p.ramp('#a8d8ff')
    const back = s.back
    const icon = s.icon
    // A leaping arc: tail low on the right, back curving over, head down-left.
    const spine: P3[] = [
      [47, 60, 2.6],
      [52, 53, 4.6],
      [52.5, 44, 7],
      [47.5, 35, 8.8],
      [38.5, 29.5, 9.4],
      [28.5, 28, 8.8],
      [20.5, 29.5, 7.4],
      [15.5, 31.5, 5.4],
    ]
    const flukes = () => {
      s.leaf(47, 60, 40, 57, 5.4, blue, { g: 'fk1' }, -1)
      s.leaf(47, 60, 44, 64, 5, blue, { g: 'fk2' }, 1)
    }
    const fin = (near: boolean) =>
      near
        ? s.leaf(29, 36, 24.5, 46, 6.4, blue, { g: 'pf1' }, 1.4)
        : s.leaf(40, 37, 42, 46, 5.4, blue, { g: 'pf2', under: true }, -1)
    const helm = () => {
      s.poly(
        [
          [12.5, 27],
          [16, 22.5],
          [22, 20],
          [28.5, 20.5],
          [32, 23.5],
          [26, 25],
          [19.5, 26.5],
          [15, 28.5],
        ],
        bone,
        { g: 'helm', bevel: 2 },
      )
      if (!icon) {
        s.shadeLine(18.5, 23, 19.5, 25.5, 1)
        s.shadeLine(23, 21.5, 24, 24.5, 1)
        s.shadeLine(27.5, 21.5, 28, 23.5, 1)
      }
    }
    const body = () => {
      s.tube(spine, blue, { g: 'body' })
      if (!back) bellyBand(s, spine, white, 'body', -1, 0.25, 1.4)
      if (!icon)
        for (const [x, y] of back
          ? [[34, 31], [42, 32], [48, 38], [50, 46], [26, 33], [39, 38]]
          : [[36, 25], [43, 28], [48, 34], [51, 41], [30, 24.5], [45, 35]])
          s.dot(x, y, spot, 1)
    }
    if (back) {
      fin(true)
      body()
      helm()
      fin(false)
      flukes()
      return
    }
    fin(false)
    flukes()
    body()
    fin(true)
    tusk(s, 12.5, 29, 1, 17, 1.9, bone, 'tusk', 5, icon)
    helm()
    if (icon) {
      iconEye(s, p, 17.5, 30, 'iris', { i: '#68b8ff', p: '#0c1838' })
      return
    }
    s.stamp(p.stamp(['ooooo', 'ohipo', '.ooo.'], { o: '#0c1838', i: '#68b8ff', p: '#0c1838', h: '#ffffff' }), 15, 28.5)
    s.pxs([12, 35, 13, 35, 14, 34.5], p.c('#183060'))
  },
}

const tidelance: Recipe = {
  size: 'L',
  front: { k: 0.93 },
  shiny: { hue: 75, sat: 0.9, band: [150, 260] },
  draw(s, p) {
    const navy = p.ramp3('#3c6cb8', '#264a94', '#1a3c7c', { deepC: '#10244c' })
    const white = p.ramp('#ffffff', { sh: 0.1, deep: 0.22 })
    const ice = p.ramp3('#ffffff', '#c8f4ff', '#88d8f0', { deepC: '#58a8d0', outC: '#1c4c7c' })
    const ice2 = p.ramp3('#e8fcff', '#a8e8f8', '#68c0e0', { deepC: '#4898c0', outC: '#1c4c7c' })
    const foam = p.ramp3('#ffffff', '#e0f4ff', '#a8d4f0', { outC: '#3870b0', lineC: '#78b0e0' })
    const back = s.back
    const icon = s.icon
    // Rising out of the water, leaning toward the foe.
    const spine: P3[] = [
      [41, 64, 10.5],
      [39.5, 52, 11],
      [35, 41, 10.8],
      [28.5, 32.5, 9.8],
      [21.5, 27.5, 8.4],
      [15.5, 25.5, 6.2],
    ]
    const cape = (near: boolean) =>
      near
        ? s.poly(
            [
              [36, 36],
              [45, 40],
              [54, 47],
              [60, 56],
              [53, 55],
              [46, 51],
              [40, 46],
            ],
            navy,
            { g: 'cape1', bevel: 2.4, tilt: [0.1, 0.2] },
          )
        : s.poly(
            [
              [38, 32],
              [48, 33],
              [57, 38],
              [62, 46],
              [55, 45],
              [46, 41],
            ],
            navy,
            { g: 'cape2', under: true, bevel: 2, tilt: [0.25, 0.3], bias: 1 },
          )
    const armour = () => {
      const pl: [number, number, number, number, number][] = [
        [47, 50, 4.4, 1, -0.2],
        [46, 41.5, 4.8, 1, -0.5],
        [41.5, 33.5, 5, 0.8, -0.8],
        [34.5, 27, 5, 0.55, -1],
        [27, 22.5, 4.6, 0.3, -1],
      ]
      pl.forEach(([x, y, r, dx, dy], i) => s.poly(teardrop(x, y, r, dx, dy, 1.75), i % 2 ? ice2 : ice, { g: `ip${i}`, bevel: 1.8 }))
    }
    const lance = () => {
      s.limb(12, 23.5, 2.9, 3, -1, 0.6, ice, { g: 'lance' })
      if (!icon)
        for (let i = 1; i < 8; i++) {
          const t = i / 8
          const x = 12 + (3 - 12) * t
          const y = 23.5 + (-1 - 23.5) * t
          const rr = 2.7 * (1 - t)
          s.shadeLine(x - rr, y + rr * 0.1, x + rr * 0.9, y - rr * 0.5, 1)
        }
    }
    const splash = () => {
      s.poly(
        [
          [21, 61],
          [23, 56],
          [27, 58],
          [30, 52],
          [34, 56],
          [39, 53],
          [44, 56],
          [48, 51],
          [51, 56],
          [55, 54],
          [59, 57],
          [61, 61],
        ],
        foam,
        { g: 'foam', bevel: 2.5 },
      )
      // The rest of the body is under the water.
      s.poly([[0, 60], [64, 60], [64, 90], [0, 90]], foam, { cut: true, notOnto: ['foam'] })
    }
    const body = () => {
      s.tube(spine, navy, { g: 'body' })
      if (!back) bellyBand(s, spine, white, 'body', -1, 0.2, 1.4)
    }
    const helm = () => {
      s.ellipse(18, 25, 8, 6.5, navy, { g: 'head', rot: -10 })
      if (!back) s.poly([[9, 27], [22, 28], [24, 31], [12, 31]], white, { paint: true, onto: ['head'] })
      s.poly(
        [
          [9.5, 23.5],
          [13, 18.5],
          [19, 15.5],
          [26, 16.5],
          [30, 21],
          [25, 22],
          [19, 22],
          [13, 24],
        ],
        ice,
        { g: 'helm', bevel: 1.8 },
      )
      s.poly(teardrop(24, 16.5, 2.6, 0.5, -1, 2.6), ice2, { g: 'helmcrest', bevel: 1.2 })
      if (!icon) s.shadeLine(13, 21, 19, 18, -1)
    }
    if (back) {
      cape(true)
      body()
      armour()
      helm()
      cape(false)
      splash()
      return
    }
    cape(false)
    body()
    armour()
    cape(true)
    splash()
    lance()
    helm()
    if (icon) {
      iconEye(s, p, 15.5, 24.5, 'glow', { i: '#78e0ff' })
      return
    }
    s.stamp(p.stamp(['oooooo', '.ohiio', '..ooo.'], { o: '#081028', i: '#78e0ff', h: '#ffffff' }), 12.5, 23)
    s.pxs([9, 28.5, 10, 29, 11, 29, 12, 29], p.c('#0c1c40'))
  },
}

export const NARLET_LINE = { narlet, narwhelm, tidelance } satisfies Partial<Record<SpeciesId, Recipe>>
