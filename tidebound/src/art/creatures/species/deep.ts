/**
 * TATTERLING → SAILWRAITH (ghost sails), MURKEEL → MORAYNIGHT (morays) and
 * DUGLING → MANATIDE (manatees).
 */
import type { SpeciesId } from '../../../data/dex'
import type { Canvas, P2, P3 } from '../canvas'
import type { Ramp } from '../color'
import { eye, iconEye, type Pal, type Recipe } from '../kit'
import { puff, samplePath } from '../parts'

function mintEyes(s: Canvas, p: Pal, x: number, y: number, big: boolean): void {
  const ec = { o: '#20403c', i: '#70f0c0', h: '#f0fff8', j: '#38b890' }
  if (big) s.stamp(p.stamp(['.ooo.', 'ohiio', 'oiiio', 'oijio', '.ooo.'], ec), x, y)
  else s.stamp(p.stamp(['.oo.', 'ohio', 'oijo', '.oo.'], ec), x, y)
}

/** A rope: a tube with twist marks. */
function rope(s: Canvas, pts: readonly P3[], r: Ramp, g: string, icon: boolean): void {
  s.tube(pts, r, { g })
  if (icon) return
  for (const [x, y, , tx, ty] of samplePath(pts, 2.2)) s.shadeLine(x - ty, y + tx, x + ty * 0.2 + tx, y - tx * 0.2 + ty, 1)
}

const tatterling: Recipe = {
  size: 'S',
  front: { dy: -4 },
  shiny: { map: { '#f0ead8': '#e0e8f8', '#c8c0a8': '#a8b4d0', '#8c8478': '#6c7898', '#70f0c0': '#ffa0d0', '#6c5890': '#9058a0' } },
  draw(s, p) {
    const cloth = p.ramp3('#f8f4e8', '#f0ead8', '#c8c0a8', { deepC: '#8c8478' })
    const fold = p.ramp3('#a898c8', '#8c7cb0', '#6c5890')
    const ropeR = p.ramp3('#b08058', '#8c6040', '#5c3c24')
    const back = s.back
    const icon = s.icon

    const cloak = () => {
      s.poly(
        [
          [22, 33],
          [34.5, 33],
          [40, 38],
          [46, 42],
          [51, 47],
          [48, 49],
          [49, 53],
          [44, 51],
          [42, 56],
          [38, 52],
          [34, 57],
          [31, 52],
          [26, 56],
          [24, 51],
          [19, 54],
          [19.5, 48],
          [15, 49],
          [18, 42],
        ],
        cloth,
        { g: 'cloak', bevel: 3 },
      )
      if (!icon) {
        s.poly([[28, 36], [31, 36], [36, 52], [33, 52]], fold, { paint: true, onto: ['cloak'] })
        s.poly([[36.5, 37], [39, 38], [45, 49], [42.5, 49]], fold, { paint: true, onto: ['cloak'] })
        s.poly([[22.5, 38], [24.5, 38], [24, 50], [22, 50]], fold, { paint: true, onto: ['cloak'] })
      }
    }
    const head = () => {
      // A cloth draped over a round head, with a limp peak that flops back.
      s.ellipse(28, 26.5, 9.5, 8.5, cloth, { g: 'head' })
      s.tube([[27, 19, 3.2], [31, 16.5, 2.2], [35, 17.5, 1.2]], cloth, { g: 'head' })
      if (!icon) {
        s.shadeLine(33, 20, 36, 26, 1)
        s.shadeLine(21, 29, 23, 33, 1)
      }
    }
    const tie = () => {
      rope(s, [[20.5, 33.5, 1.6], [28, 35, 1.7], [35.5, 33.5, 1.6]], ropeR, 'rope', icon)
      s.tube([[34, 34, 1.3], [37, 38, 1.1], [36, 42, 0.9]], ropeR, { g: 'ropeend' })
      s.circle(34.5, 34.2, 2, ropeR, { g: 'knot' })
    }
    cloak()
    head()
    tie()
    if (back || icon) {
      if (icon) {
        iconEye(s, p, 23.5, 24.5, 'iris', { i: '#70f0c0', p: '#20403c' })
        iconEye(s, p, 30.5, 24.5, 'iris', { i: '#70f0c0', p: '#20403c' })
      }
      return
    }
    mintEyes(s, p, 21.5, 22.5, false)
    mintEyes(s, p, 28, 22, true)
    s.pxs([24, 30, 25, 29.5, 26, 30, 27, 30.5, 28, 30], p.c('#5c5448'))
  },
}

const sailwraith: Recipe = {
  size: 'L',
  front: { k: 0.93 },
  shiny: { map: { '#e8e0cc': '#dde4f4', '#b0a890': '#a0acc8', '#706858': '#5c6888', '#70f0c0': '#ff90c0', '#7c60b0': '#b058a0' } },
  draw(s, p) {
    const canvas = p.ramp3('#f4eee0', '#e8e0cc', '#b0a890', { deepC: '#8c8470' })
    const patch = p.ramp3('#e0d0b0', '#cbb894', '#9c8c6c')
    const wood = p.ramp3('#8c6448', '#5c3c28', '#3c2418')
    const mist = p.ramp3('#b8a0e8', '#9c80d0', '#7c60b0', { outC: '#48306c', lineC: '#6c50a0' })
    const ropeR = p.ramp3('#c09870', '#9c7450', '#6c4c30')
    const emblem = p.ramp('#c0a888')
    const back = s.back
    const icon = s.icon

    const mistPuffs = () =>
      puff(s, [[22, 57, 5], [30, 59, 5.5], [39, 58, 5], [47, 56, 4], [15, 55, 3.5], [34, 54, 4]], mist, { g: 'mist', line: false })
    const mast = () => {
      s.tube([[33, 63, 2.4], [31.5, 40, 2.2], [32.5, 20, 2], [31, 3, 1.6]], wood, { g: 'mast' })
    }
    const spar = () => {
      s.tube([[9, 13, 1.8], [22, 10.5, 2], [36, 9.5, 2], [53, 11.5, 1.7]], wood, { g: 'spar' })
      s.tube([[13, 47, 1.3], [30, 49, 1.5], [49, 47, 1.3]], wood, { g: 'boom', under: true })
    }
    const sail = () => {
      s.poly(
        [
          [10, 13],
          [30, 11],
          [52, 13],
          [55, 24],
          [54, 36],
          [51, 44],
          [47, 42],
          [45, 48],
          [41, 44],
          [37, 49],
          [33, 45],
          [28, 50],
          [24, 45],
          [20, 49],
          [17, 44],
          [12, 46],
          [9, 36],
          [7, 24],
        ],
        canvas,
        { g: 'sail', bevel: 7, prof: 1.6 },
      )
      if (icon) return
      s.squircle(46, 34, 4, 3.5, 4, patch, { paint: true, onto: ['sail'], rot: 8 })
      s.squircle(16, 22, 3.5, 3, 4, patch, { paint: true, onto: ['sail'], rot: -6 })
      for (const [x, y] of [
        [42.5, 31],
        [42.5, 33],
        [42.5, 35],
        [42.5, 37],
        [13, 20],
        [13, 22],
        [13, 24],
      ])
        s.shadePx(x, y, 2)
      s.ring(22, 36, 3.2, 3, 0.8, emblem, { paint: true, onto: ['sail'] })
      s.limb(22, 32, 0.7, 22, 40, 0.7, emblem, { paint: true, onto: ['sail'] })
      // Torn holes.
      s.ellipse(40, 19, 1.8, 2.4, canvas, { cut: true })
      s.ellipse(14, 37, 1.5, 2, canvas, { cut: true })
    }
    const ropes = () => {
      rope(s, [[10, 14, 1.3], [5, 24, 1.2], [4, 33, 1.1], [7, 40, 0.9]], ropeR, 'rope1', icon)
      rope(s, [[52, 13, 1.3], [57, 23, 1.2], [59, 32, 1.1], [56, 39, 0.9]], ropeR, 'rope2', icon)
    }
    if (back) {
      mistPuffs()
      spar()
      sail()
      mast()
      ropes()
      return
    }
    mistPuffs()
    mast()
    spar()
    sail()
    ropes()
    if (icon) {
      iconEye(s, p, 22, 25, 'iris', { i: '#70f0c0', p: '#20403c' })
      iconEye(s, p, 33, 24.5, 'iris', { i: '#70f0c0', p: '#20403c' })
      return
    }
    s.stamp(p.stamp(['.oooo.', 'ohiiio', 'oiiiio', 'oiijio', '.oooo.'], { o: '#20403c', i: '#70f0c0', h: '#f0fff8', j: '#38b890' }), 30, 22)
    s.stamp(p.stamp(['.ooo.', 'ohiio', 'oiijo', '.ooo.'], { o: '#20403c', i: '#70f0c0', h: '#f0fff8', j: '#38b890' }), 19.5, 23)
    s.poly([[20, 32], [24, 34], [27, 32], [30, 35], [33, 32], [36, 34], [37, 37], [21, 37]], p.ramp('#3c3428'), { g: 'mouth', flat: 2, line: false })
  },
}

/** Speckle dots over a tube body, from its path. */
function speckle(s: Canvas, pts: readonly P3[], r: Ramp, every: number, side: number): void {
  samplePath(pts, every).forEach(([x, y, rad, tx, ty], i) => {
    const o = ((i * 7) % 5) / 5 - 0.4
    s.dot(Math.round(x - ty * rad * (o + side * 0.2)), Math.round(y + tx * rad * (o + side * 0.2)), r, 1)
  })
}

/** A frilled fin along the outer side of a tube path. */
function frill(s: Canvas, pts: readonly P3[], r: Ramp, g: string, h: number, side: number, jag = false): void {
  const path = samplePath(pts, 1)
  const outer: P2[] = []
  const inner: P2[] = []
  path.forEach(([x, y, rad, tx, ty], i) => {
    const nx = -ty * side
    const ny = tx * side
    const hh = jag ? (i % 4 < 2 ? h * 1.5 : h * 0.6) : h * (0.8 + 0.2 * Math.sin(i * 1.3))
    inner.push([x + nx * rad * 0.6, y + ny * rad * 0.6])
    outer.push([x + nx * (rad + hh), y + ny * (rad + hh)])
  })
  s.poly([...inner, ...outer.reverse()], r, { g, under: true, bevel: 1.2 })
}

const murkeel: Recipe = {
  size: 'M',
  shiny: { hue: 100, sat: 1, band: [120, 200] },
  draw(s, p) {
    const eel = p.ramp3('#78c0a8', '#58a890', '#2c6858', { deepC: '#143830' })
    const fin = p.ramp3('#4c9080', '#2c6858', '#184438', { deepC: '#0c2820' })
    const mouth = p.ramp('#f0c8c8', { sh: 0.18 })
    const rock = p.ramp3('#a09888', '#7c7464', '#565044', { deepC: '#3c3830' })
    const speck = p.ramp('#f0d850')
    const back = s.back
    const icon = s.icon
    const spine: P3[] = [
      [37, 62, 5],
      [41, 52, 5.2],
      [37, 43, 5.2],
      [29, 37, 5],
      [24, 30.5, 4.8],
    ]
    const rocks = () => {
      s.blob([[20, 64], [18, 55], [24, 50], [32, 53], [33, 64]], rock, { g: 'rockL', bevel: 3 })
      s.blob([[43, 64], [44, 54], [50, 49], [58, 52], [60, 64]], rock, { g: 'rockR', bevel: 3 })
    }
    const body = () => {
      frill(s, spine, fin, 'frill', 2.6, -1)
      s.tube(spine, eel, { g: 'body' })
      if (!icon) speckle(s, spine, speck, 3, 0)
    }
    const head = () => {
      s.ellipse(20, 27.5, 7.5, 5.8, eel, { g: 'head', rot: -18 })
      if (back) return
      // Gaping jaws.
      s.poly([[9.5, 26], [16, 28.5], [19, 31], [11, 33]], mouth, { g: 'maw', flat: 2, line: false })
      s.poly([[8.5, 25], [15, 24], [18, 27], [16, 28.5]], eel, { g: 'upper' })
      s.poly([[10, 33.5], [19, 31], [21, 34], [14, 36]], eel, { g: 'lower' })
    }
    if (back) {
      body()
      head()
      rocks()
      return
    }
    body()
    rocks()
    head()
    if (icon) {
      iconEye(s, p, 19.5, 25, 'glow', { i: '#f0d850' })
      return
    }
    s.pxs([11, 28, 13, 28.5, 12, 32, 14, 31.5], p.c('#ffffff'))
    s.stamp(p.stamp(['ooo', 'ohi', 'ooo'], { o: '#102420', i: '#f0d850', h: '#fffce0' }), 18, 23.5)
  },
}

const moraynight: Recipe = {
  size: 'L',
  shiny: { hue: 60, sat: 0.9, band: [200, 280], map: { '#3848a0': '#6c38a0', '#1c2060': '#3c1c60', '#0c0c28': '#1c0c28' } },
  draw(s, p) {
    const night = p.ramp3('#4c5cb8', '#3848a0', '#1c2060', { deepC: '#10123c', outC: '#06061a' })
    const crest = p.ramp3('#3c50c0', '#243494', '#141c60', { deepC: '#0c1040' })
    const mouth = p.ramp('#e0a0b0', { sh: 0.2 })
    const star = p.ramp('#fff8c0')
    const star2 = p.ramp('#f0d850')
    const back = s.back
    const icon = s.icon
    const spine: P3[] = [
      [58, 58, 2.4],
      [50, 60, 4.5],
      [38, 58, 6.5],
      [30, 51, 7],
      [34, 42, 6.8],
      [44, 35, 6.5],
      [45, 25, 6],
      [37, 18, 5.5],
      [28, 17, 5.2],
    ]
    const body = () => {
      frill(s, spine.slice(2), crest, 'crest', 3.4, -1, true)
      s.tube(spine, night, { g: 'body' })
      if (icon) return
      const pts = samplePath(spine, 4)
      pts.forEach(([x, y, r, tx, ty], i) => {
        const o = (((i * 5) % 7) / 7 - 0.5) * r
        s.dot(Math.round(x - ty * o), Math.round(y + tx * o), i % 3 ? star : star2, 1)
      })
      const c = pts.slice(3, 7).map(([x, y, r, tx, ty], i) => [x - ty * r * (i % 2 ? 0.3 : -0.2), y + tx * r * (i % 2 ? 0.3 : -0.2)] as const)
      for (let i = 1; i < c.length; i++) s.shadeLine(c[i - 1][0], c[i - 1][1], c[i][0], c[i][1], -2)
    }
    const head = () => {
      s.ellipse(22, 19, 9, 6.5, night, { g: 'head', rot: -8 })
      if (back) return
      s.poly([[8, 17], [17, 20], [21, 24], [10, 27]], mouth, { g: 'maw', flat: 2, line: false })
      s.poly([[6.5, 16], [16, 13.5], [21, 17], [17, 20]], night, { g: 'upper' })
      s.poly([[9, 27.5], [21, 24], [24, 27], [15, 30.5]], night, { g: 'lower' })
    }
    body()
    head()
    if (back) return
    if (icon) {
      iconEye(s, p, 20.5, 15, 'glow', { i: '#f0d850' })
      return
    }
    for (const [x, y] of [
      [9, 18],
      [12, 18.5],
      [15, 19.5],
      [11, 25.5],
      [14, 24.5],
      [17, 23.5],
    ])
      s.px(x, y, p.c('#ffffff'))
    s.stamp(p.stamp(['oooo', 'ohio', '.oo.'], { o: '#06061a', i: '#f0d850', h: '#fffce0' }), 18.5, 13.5)
  },
}

const dugling: Recipe = {
  size: 'M',
  shiny: { hue: 120, sat: 1.6, minSat: 0.05, band: [170, 260] },
  draw(s, p) {
    const skin = p.ramp3('#c8d6e4', '#a8bccc', '#8098b0', { deepC: '#5c7088' })
    const belly = p.ramp('#e0e8f0', { sh: 0.12, deep: 0.24 })
    const muzzle = p.ramp3('#d8e2ec', '#bccad8', '#94a8bc')
    const grass = p.ramp3('#a0e078', '#68b050', '#3c8038')
    const back = s.back
    const icon = s.icon

    const tail = () => {
      s.limb(38, 52, 4.5, 44, 56, 3.4, skin, { g: 'tail' })
      s.ellipse(48.5, 57.5, 6, 4, skin, { g: 'paddle', rot: -15 })
    }
    const body = () => {
      s.ellipse(31, 41, 13, 15, skin, { g: 'body' })
      if (!back) s.ellipse(27, 46, 8.5, 9.5, belly, { paint: true, onto: ['body'] })
    }
    const face = () => {
      s.ellipse(21, 38.5, 8, 6, muzzle, { g: 'muzzle', ln: 'soft' })
      if (!icon) {
        for (const [x, y] of [
          [16, 38],
          [18, 37],
          [17, 40],
          [19, 40],
          [21, 39],
          [23, 38],
        ])
          s.shadePx(x, y, 2)
        s.shadePx(15, 35.5, 3).shadePx(18, 35, 3)
      }
    }
    const flippers = (near: boolean) =>
      near
        ? s.leaf(25, 45, 18, 51, 5, skin, { g: 'fl1' }, 1)
        : s.leaf(37, 44, 43, 48, 4.5, skin, { g: 'fl2', under: true }, -1)
    const sprig = () => {
      s.leaf(30, 27.5, 27, 20, 2.6, grass, { g: 'sp1' }, -0.8)
      s.leaf(31, 27.5, 34, 20.5, 2.4, grass, { g: 'sp2' }, 0.8)
      s.leaf(30.5, 27.5, 30.5, 18.5, 2.4, grass, { g: 'sp3' }, 0.3)
    }
    if (back) {
      sprig()
      flippers(true)
      body()
      flippers(false)
      tail()
      return
    }
    flippers(false)
    tail()
    sprig()
    body()
    face()
    flippers(true)
    if (icon) {
      iconEye(s, p, 24, 32, 'dark', { p: '#283848' })
      iconEye(s, p, 30, 31, 'dark', { p: '#283848' })
      return
    }
    eye(s, p, 'bead34', 22, 30, { p: '#283848' })
    eye(s, p, 'bead33', 28.5, 29.5, { p: '#283848' })
    s.pxs([17, 43, 18, 44, 19, 44, 20, 44, 21, 44, 22, 43], p.c('#5c7088'))
    s.pxs([31.5, 34, 32.5, 34], p.c('#e8b8c8'))
  },
}

const manatide: Recipe = {
  size: 'L',
  front: { k: 0.97 },
  shiny: { hue: 120, sat: 1.6, minSat: 0.05, band: [170, 260] },
  draw(s, p) {
    const skin = p.ramp3('#bccad8', '#a0b0c0', '#708498', { deepC: '#4c5c70' })
    const belly = p.ramp('#c8d4e0', { sh: 0.12, deep: 0.26 })
    const grass = p.ramp3('#98d870', '#58a848', '#347830')
    const grass2 = p.ramp3('#b8e880', '#78c050', '#48903c')
    const coral = p.ramp3('#ffc0c8', '#f098a8', '#c06078')
    const barn = p.ramp('#e8e8e0', { sh: 0.2 })
    const back = s.back
    const icon = s.icon

    const tail = () => {
      s.limb(47, 43, 6.5, 53, 40, 4.5, skin, { g: 'tail' })
      s.ellipse(57, 37, 6, 8.5, skin, { g: 'paddle', rot: 20 })
    }
    const body = () => {
      s.ellipse(33, 43, 20, 13, skin, { g: 'body', rot: -8 })
      if (!back) s.ellipse(28, 50, 15, 6.5, belly, { paint: true, onto: ['body'], rot: -8 })
      if (!icon) {
        s.shadeLine(36, 46, 42, 44, -1)
        s.shadeLine(24, 44, 28, 46, -1)
        for (const [x, y] of [
          [40, 49],
          [22, 40],
          [46, 42],
        ])
          s.circle(x, y, 1.3, barn, { g: `bn${x}` })
      }
    }
    const garden = () => {
      const blades: [number, number, number, number][] = [
        [20, 33, 17, 22],
        [24, 31.5, 23, 19],
        [28, 30.5, 30, 17],
        [33, 30, 32, 20],
        [38, 30.5, 41, 18],
        [43, 31.5, 44, 22],
        [47, 33.5, 50, 25],
      ]
      blades.forEach(([x, y, tx, ty], i) => s.tube([[x, y, 1.6], [(x + tx) / 2 + (i % 2 ? 1.5 : -1.5), (y + ty) / 2, 1.3], [tx, ty, 0.6]], i % 2 ? grass : grass2, { g: `gb${i}` }))
      s.tube([[35, 31, 1.4], [35, 25, 1.2], [32, 22, 0.9]], coral, { g: 'coral' })
      s.tube([[35, 27, 1], [38.5, 23, 0.8]], coral, { g: 'coral' })
      s.tube([[26, 32, 1.2], [26.5, 27, 1], [29, 25, 0.8]], coral, { g: 'coral2' })
      puff(s, [[22, 33, 3], [29, 31.5, 3.2], [38, 31.5, 3.2], [45, 33, 3]], grass, { g: 'turf' })
    }
    const flippers = (near: boolean) =>
      near
        ? s.leaf(24, 50, 16, 60, 7, skin, { g: 'fl1' }, 1.5)
        : s.leaf(36, 52, 40, 61, 6, skin, { g: 'fl2', under: true }, -1.2)
    const face = () => {
      s.squircle(13, 48, 7.5, 6, 2.4, skin, { g: 'muzzle' })
      if (!icon)
        for (const [x, y] of [
          [8, 48],
          [10, 47],
          [9, 50],
          [11, 50],
          [13, 49],
        ])
          s.shadePx(x, y, 2)
    }
    if (back) {
      flippers(true)
      face()
      body()
      flippers(false)
      tail()
      garden()
      return
    }
    flippers(false)
    tail()
    garden()
    body()
    face()
    flippers(true)
    if (icon) {
      iconEye(s, p, 17, 41.5, 'dark', { p: '#182028' })
      return
    }
    s.stamp(p.stamp(['ooo.', 'ohpo', '.oo.'], { o: '#303c4c', p: '#182028', h: '#e8f0f8' }), 15, 40)
    s.pxs([7, 53, 8, 54, 9, 54, 10, 53.5], p.c('#4c5c70'))
  },
}

export const DEEP_LINE = { tatterling, sailwraith, murkeel, moraynight, dugling, manatide } satisfies Partial<Record<SpeciesId, Recipe>>
