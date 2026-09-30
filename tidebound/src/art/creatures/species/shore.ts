/**
 * COCRAB → COCONCLAW (coconut crabs), BRANDGER (flame badger) and
 * SAWFRY → SAWBLADON (sawfish).
 */
import type { SpeciesId } from '../../../data/dex'
import type { Canvas } from '../canvas'
import type { Ramp } from '../color'
import { eye, iconEye, type Recipe } from '../kit'
import { flame } from '../parts'

/** Coconut husk hair: short fibre strokes over a shell. */
function husk(s: Canvas, cx: number, cy: number, rx: number, ry: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (Math.PI * (i + 0.5)) / n
    const x = cx + Math.cos(a) * rx * 0.72
    const y = cy + Math.sin(a) * ry * 0.72
    s.shadeLine(x, y, x + Math.cos(a) * 2, y + Math.sin(a) * 2 + 1, 1)
  }
}

/**
 * A crab claw: an arm to a round palm, then two tapered fingers opening in a
 * V toward (dx, dy). One group, so the outline wraps the whole pincer.
 */
function claw(s: Canvas, sx: number, sy: number, cx: number, cy: number, r: number, dx: number, dy: number, c: Ramp, g: string, under = false, open = 32): void {
  s.limb(sx, sy, r * 0.38, cx, cy, r * 0.34, c, { g: `${g}a`, under })
  const a = Math.atan2(dy, dx)
  const o = (open * Math.PI) / 180
  s.ellipse(cx, cy, r, r * 0.8, c, { g: `${g}c`, under, rot: (a * 180) / Math.PI })
  for (const [sgn, len, w] of [
    [-1, 1.9, 0.5],
    [1, 1.6, 0.42],
  ] as const) {
    const b = a + sgn * o * 0.5
    const bx = cx + Math.cos(a) * r * 0.45 + Math.cos(a + sgn * Math.PI / 2) * r * 0.35
    const by = cy + Math.sin(a) * r * 0.45 + Math.sin(a + sgn * Math.PI / 2) * r * 0.35
    s.limb(bx, by, r * w, bx + Math.cos(b) * r * len, by + Math.sin(b) * r * len, r * 0.12, c, { g: `${g}c`, under })
  }
}

function crabLegs(s: Canvas, legs: readonly (readonly [number, number, number, number, number, number])[], c: Ramp, joint: Ramp, r: number, g: string, under = false): void {
  legs.forEach(([hx, hy, kx, ky, fx, fy], i) => {
    s.limb(kx, ky, r * 0.85, fx, fy, r * 0.35, c, { g: `${g}${i}`, under })
    s.limb(hx, hy, r, kx, ky, r * 0.9, c, { g: `${g}${i}u`, under })
    s.circle(kx, ky, r * 0.95, joint, { g: `${g}${i}j`, under: false, onto: [`${g}${i}`, `${g}${i}u`] })
  })
}

const cocrab: Recipe = {
  size: 'S',
  front: { k: 0.84 },
  shiny: { hue: 140, sat: 0.9, band: [200, 300] },
  draw(s, p) {
    const shell = p.ramp3('#b8844c', '#a07040', '#704820', { deepC: '#402810' })
    const inner = p.ramp3('#f0e8d8', '#e0d4bc', '#b0a080')
    const violet = p.ramp3('#98a0e8', '#7078d0', '#404890', { deepC: '#303470' })
    const joint = p.ramp('#f09040')
    const eyeR = p.ramp3('#606070', '#202028', '#101014')
    const back = s.back
    const icon = s.icon

    const legs = () =>
      crabLegs(
        s,
        [
          [27, 48, 21, 52, 18.5, 60],
          [31, 49, 27.5, 54, 26, 60.5],
          [41, 49, 45, 54, 47, 60.5],
          [45, 48, 50.5, 52, 53.5, 60],
        ],
        violet,
        joint,
        1.6,
        'lg',
        true,
      )
    const shellDome = () => {
      s.ellipse(36, 49, 15, 14, shell, { g: 'shell' })
      s.poly([[18, 50], [54, 50], [54, 64], [18, 64]], shell, { cut: true, onto: ['shell'] })
      s.poly([[19, 48], [53, 48], [53, 50.5], [19, 50.5]], inner, { paint: true, onto: ['shell'] })
      if (!icon) {
        husk(s, 36, 49, 15, 14, 9)
        for (const [x, y] of [
          [35, 40],
          [40, 39],
          [37.5, 43.5],
        ])
          s.circle(x, y, 1.4, shell, { g: `dm${x}`, bias: 2, line: false })
      }
    }
    const face = () => s.ellipse(24.5, 48, 5.5, 4, violet, { g: 'face', under: true })
    const eyes = () => {
      s.limb(22.5, 46, 1.1, 20.5, 39.5, 1, violet, { g: 'st1' })
      s.limb(26.5, 46, 1.1, 26, 38.5, 1, violet, { g: 'st2' })
      s.circle(20.3, 38.5, 2.5, eyeR, { g: 'e1' })
      s.circle(26, 37.5, 2.5, eyeR, { g: 'e2' })
    }
    const claws = () => {
      claw(s, 24, 49, 13.5, 45, 5.2, -1, -0.6, violet, 'cl1', false, 36)
      claw(s, 28, 46, 21, 32, 4.2, -0.6, -1, violet, 'cl2', true, 32)
    }
    if (back) {
      shellDome()
      eyes()
      claws()
      legs()
      return
    }
    shellDome()
    face()
    legs()
    claws()
    eyes()
    if (!icon) {
      s.px(19.5, 37, p.c('#ffffff')).px(25, 36, p.c('#ffffff'))
      s.pxs([22, 49, 23, 49.5, 24, 49.5, 25, 49], p.c('#303470'))
    }
  },
}

const coconclaw: Recipe = {
  size: 'L',
  front: { k: 0.9 },
  shiny: { hue: 140, sat: 0.9, band: [200, 300] },
  draw(s, p) {
    const shell = p.ramp3('#b8844c', '#a07040', '#704820', { deepC: '#402810' })
    const violet = p.ramp3('#98a0e8', '#7078d0', '#383c88', { deepC: '#28286c' })
    const joint = p.ramp('#f09040')
    const frond = p.ramp3('#a8e878', '#68c048', '#3c8c30')
    const back = s.back
    const icon = s.icon

    const legs = () =>
      crabLegs(
        s,
        [
          [26, 47, 17, 51, 13, 61],
          [31, 48, 26, 55, 23, 61.5],
          [44, 48, 50, 55, 52, 61.5],
          [49, 47, 57, 51, 60, 61],
        ],
        violet,
        joint,
        2.1,
        'lg',
        true,
      )
    const shellDome = () => {
      s.ellipse(37, 44, 18, 16, shell, { g: 'shell' })
      s.poly([[16, 50], [58, 50], [58, 64], [16, 64]], shell, { cut: true, onto: ['shell'] })
      if (!icon) {
        husk(s, 37, 44, 18, 16, 12)
        for (const [x, y] of [
          [33, 35],
          [39, 34],
          [36, 39],
        ])
          s.circle(x, y, 1.6, shell, { g: `dm${x}`, bias: 2, line: false })
      }
    }
    const fronds = () => {
      const f: [number, number, number][] = [
        [20, 22, -1],
        [27, 14, -1],
        [38, 10, 1],
        [48, 14, 1],
        [55, 22, 1],
      ]
      f.forEach(([tx, ty, b], i) => s.leaf(37, 29, tx, ty, 6.5, frond, { g: `fr${i}` }, b * 2.5))
      if (!icon) f.forEach(([tx, ty]) => s.shadeLine(37, 29, (37 + tx) / 2, (29 + ty) / 2, 1))
      s.circle(37, 29, 2.4, shell, { g: 'crown' })
    }
    const eyeR = p.ramp3('#606070', '#202028', '#101014')
    const eyes = () => {
      s.limb(22, 44, 1.4, 19, 34, 1.2, violet, { g: 'st1' })
      s.limb(27, 44, 1.4, 26.5, 32, 1.2, violet, { g: 'st2' })
      s.circle(18.7, 32.5, 2.5, eyeR, { g: 'e1' })
      s.circle(26.5, 30.5, 2.5, eyeR, { g: 'e2' })
    }
    const claws = () => {
      claw(s, 27, 48, 13, 45, 7, -1, -0.3, violet, 'cl1', false, 36)
      claw(s, 30, 46, 22, 25, 4.8, -0.5, -1, violet, 'cl2', true, 30)
    }
    if (back) {
      shellDome()
      fronds()
      eyes()
      claws()
      legs()
      return
    }
    fronds()
    shellDome()
    legs()
    claws()
    eyes()
    if (!icon) {
      s.dot(18, 31, p.ramp('#ffffff'), 0).dot(26, 29, p.ramp('#ffffff'), 0)
      s.line(16, 29, 21, 30.5, p.c('#1c1c50'))
      s.line(24, 27.5, 29, 28.5, p.c('#1c1c50'))
    }
  },
}

const brandger: Recipe = {
  size: 'M',
  shiny: { hue: 190, sat: 0.95, band: [0, 70] },
  draw(s, p) {
    const black = p.ramp3('#585060', '#383038', '#201820', { deepC: '#140e14' })
    const fireO = p.glow('#f8a020', '#e04818', '#a02808', '#501008')
    const fireY = p.glow('#fffce0', '#fff070', '#f8c040')
    const outer = p.glow('#f8a020', '#f07020', '#c03810', '#701808')
    const core = p.glow('#fff8b0', '#ffe070', '#ffd040')
    const claw = p.ramp('#f0e0d0', { sh: 0.2 })
    const back = s.back
    const icon = s.icon

    const legs = (far: boolean) => {
      if (far) {
        s.limb(25, 50, 3.6, 24, 58, 3, black, { g: 'lf2', under: true })
        s.limb(45, 50, 3.8, 48, 58, 3, black, { g: 'lh2', under: true })
      } else {
        s.limb(21, 50, 4, 18, 58, 3.4, black, { g: 'lf1' })
        s.ellipse(16.5, 59, 4, 2, black, { g: 'lf1' })
        s.limb(41, 50, 4.4, 42, 58, 3.4, black, { g: 'lh1' })
        s.ellipse(41, 59, 4, 2, black, { g: 'lh1' })
        for (const dx of [-2, 0, 2]) s.limb(15 + dx, 59.5, 0.7, 12.5 + dx, 60.5, 0.5, claw, { g: `cl${dx}` })
      }
    }
    const body = () => {
      s.ellipse(33, 45, 17, 9.5, black, { g: 'body' })
      s.limb(49, 43, 2.6, 55, 46, 1.4, black, { g: 'tail' })
      // The flame stripe along the back.
      s.poly([[16, 36], [30, 34.5], [44, 35.5], [51, 40], [48, 43], [34, 40.5], [18, 42]], fireO, { paint: true, onto: ['body', 'head'], flat: 1 })
      s.poly([[18, 37.5], [30, 36.5], [44, 37.5], [48, 40.5], [34, 38.5], [19, 40]], fireY, { paint: true, onto: ['body', 'head'], flat: 1 })
    }
    const head = () => {
      s.ellipse(15, 43, 8, 6.5, black, { g: 'head' })
      s.squircle(8.5, 46, 4.2, 3.4, 2.4, black, { g: 'head' })
      s.poly([[6, 35], [22, 35], [24, 40], [12, 40.5], [7, 41]], fireO, { paint: true, onto: ['head'], flat: 1 })
      s.poly([[9, 37], [21, 36.5], [22, 39], [11, 39.5]], fireY, { paint: true, onto: ['head'], flat: 1 })
    }
    const flames = () => {
      if (icon) {
        flame(s, 30, 34, 2.4, 6, outer, core, 'fx1')
        return
      }
      const fl: [number, number, number, number, number][] = [
        [16, 36, 1.8, 5, -0.3],
        [23, 34.5, 2.2, 7, -0.2],
        [30, 34, 2.4, 8, -0.1],
        [37, 34.5, 2.2, 7, 0],
        [43, 36, 1.9, 5.5, 0.1],
      ]
      fl.forEach(([x, y, r, h, l], i) => flame(s, x, y, r, h, outer, core, `fx${i}`, l))
    }
    if (back) {
      head()
      legs(false)
      body()
      legs(true)
      flames()
      return
    }
    legs(true)
    flames()
    body()
    legs(false)
    head()
    if (icon) {
      iconEye(s, p, 12, 42, 'glow', { i: '#ff3020' })
      return
    }
    s.stamp(p.stamp(['oo...', 'ohio.', '.ooo.'], { o: '#100808', i: '#ff3020', h: '#ffd0c0' }), 9.5, 40.5)
    // Snarl with bared fangs.
    s.line(5, 48.5, 11, 48.5, p.c('#100808'))
    s.pxs([6, 49.5, 9, 49.5], p.c('#f0e0d0'))
    s.pxs([4, 45, 5, 45], p.c('#100808'))
  },
}

/** A flat steel saw from (x0, y0) to (x1, y1): blade, teeth along both edges, a ridge. */
function saw(s: Canvas, x0: number, y0: number, x1: number, y1: number, w: number, steel: Ramp, teeth: number, tooth: number, g: string, icon: boolean): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const L = Math.hypot(dx, dy)
  const ux = dx / L
  const uy = dy / L
  const nx = -uy
  const ny = ux
  s.poly(
    [
      [x0 + nx * w, y0 + ny * w],
      [x1 + nx * w * 0.8, y1 + ny * w * 0.8],
      [x1 + ux * w * 0.6, y1 + uy * w * 0.6],
      [x1 - nx * w * 0.8, y1 - ny * w * 0.8],
      [x0 - nx * w, y0 - ny * w],
    ],
    steel,
    { g, bevel: 1.2, tilt: [-0.15, -0.25] },
  )
  const n = icon ? Math.max(2, teeth - 2) : teeth
  for (let i = 0; i < n; i++) {
    const t = 0.18 + (0.78 * i) / Math.max(1, n - 1)
    const bx = x0 + dx * t
    const by = y0 + dy * t
    const ww = w * (1 - 0.2 * t)
    for (const sg of [1, -1]) {
      const ex = bx + nx * ww * sg
      const ey = by + ny * ww * sg
      s.poly(
        [
          [ex - ux * 1.2, ey - uy * 1.2],
          [ex + ux * 1.2, ey + uy * 1.2],
          [ex + nx * tooth * sg - ux * 0.6, ey + ny * tooth * sg - uy * 0.6],
        ],
        steel,
        { g, bevel: 0.5, flat: 1 },
      )
    }
  }
  if (!icon) s.shadeLine(x0 + dx * 0.05, y0 + dy * 0.05, x1 - dx * 0.05, y1 - dy * 0.05, 1)
}

const sawfry: Recipe = {
  size: 'S',
  front: { k: 0.8, dy: -4 },
  shiny: { map: { '#e0d8c0': '#f0d8e8', '#b0a488': '#d8a0b8', '#8c8068': '#a87090', '#706850': '#906078', '#98a8b8': '#e8c070', '#c8d4e0': '#f8e0a0', '#586878': '#a07830' } },
  draw(s, p) {
    const sand = p.ramp3('#c8bca0', '#b0a488', '#8c8068', { deepC: '#706850' })
    const belly = p.ramp('#e0d8c0', { sh: 0.12, deep: 0.26 })
    const steel = p.ramp3('#ffffff', '#c8d4e0', '#98a8b8', { deepC: '#708090', outC: '#303c48', lineC: '#586878' })
    const back = s.back
    const icon = s.icon

    if (back) {
      // Seen from above and behind, swimming away: flat pectorals spread
      // like wings, the tail nearest, the saw pointing ahead.
      s.blob([[25, 35], [17, 38], [13, 43], [17, 45], [24, 42], [29, 39]], sand, { g: 'pfL', bevel: 2, bias: 1 })
      s.blob([[29, 31], [31, 24], [35, 20], [37, 23], [35, 30], [32, 34]], sand, { g: 'pfR', bevel: 2 })
      s.leaf(39, 48, 33, 53, 3.4, sand, { g: 'pvL' }, 0.5)
      s.leaf(41, 46, 46, 42, 3.2, sand, { g: 'pvR' }, -0.5)
      s.tube([[20, 30, 5.2], [27.5, 36, 5.2], [35, 44, 4.2], [41, 50.5, 3], [44, 56, 2]], sand, { g: 'body' })
      s.ellipse(20, 29, 7, 5.8, sand, { g: 'body', rot: 40 })
      if (!icon) s.poly([[18, 29], [43, 52], [41, 54], [16, 31]], steel, { paint: true, onto: ['body'], bias: 1 })
      s.poly([[31, 38], [36, 34], [35, 41]], sand, { g: 'dorsal', bevel: 1 })
      s.poly([[43, 55], [48, 52], [52, 54], [49, 57], [47, 62], [44, 59]], sand, { g: 'tail', bevel: 1.2 })
      saw(s, 16, 25, 5, 13, 2, steel, 4, 2.2, 'saw', icon)
      return
    }
    // Swimming left: shark tail, broad pectoral, flat head, steel saw.
    s.poly([[35, 35], [38, 27], [42, 29], [43, 36]], sand, { g: 'df', bevel: 1.2, under: true })
    s.poly([[46, 40], [55, 29], [58, 30], [55, 40], [58, 49], [55, 50], [46, 44]], sand, { g: 'tail', bevel: 1.4 })
    s.tube([[21, 41, 6], [31, 40.5, 6.8], [41, 41, 5], [49, 42, 2.8]], sand, { g: 'body' })
    s.ellipse(19, 42, 8, 5.5, sand, { g: 'body' })
    if (!back) s.poly([[10, 44], [46, 43], [46, 50], [10, 50]], belly, { paint: true, onto: ['body'] })
    if (!icon) s.poly([[16, 36.5], [47, 38], [47, 39.5], [16, 38.5]], steel, { paint: true, onto: ['body'] })
    saw(s, 12.5, 42, -1, 43, 2, steel, 4, 2.2, 'saw', icon)
    s.poly([[25, 45], [19, 55], [23, 55], [33, 47]], sand, { g: 'pf1', bevel: 1.4 })
    s.poly([[37, 46], [36, 51], [41, 47]], sand, { g: 'pv', bevel: 1 })
    if (icon) {
      iconEye(s, p, 17, 40, 'dark', { p: '#101820' })
      return
    }
    eye(s, p, 'round45', 15, 37.5, { p: '#101820' })
    s.line(12, 46, 16, 46.5, p.c('#706850'))
  },
}

const sawbladon: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  shiny: { map: { '#d8c8a0': '#f0d0e0', '#a8b8c8': '#e8c870', '#607080': '#a07830', '#303848': '#584018', '#f0f4f8': '#fff8e0' } },
  draw(s, p) {
    const armour = p.ramp3('#c8d4e0', '#a8b8c8', '#607080', { deepC: '#404c5c', outC: '#141c28' })
    const armour2 = p.ramp3('#b8c6d4', '#94a4b8', '#566676', { deepC: '#3a4656', outC: '#141c28' })
    const sand = p.ramp('#d8c8a0', { sh: 0.14, deep: 0.28 })
    const steel = p.ramp3('#ffffff', '#e0e8f0', '#a8b8c8', { deepC: '#788898', outC: '#202c38', lineC: '#586878' })
    const rivet = p.ramp('#e8f0f8')
    const back = s.back
    const icon = s.icon

    const fins = (near: boolean) =>
      near
        ? s.poly([[30, 46], [18, 58], [26, 57], [38, 48]], armour2, { g: 'pf1', bevel: 1.4 })
        : s.poly([[38, 33], [42, 18], [46, 20], [48, 34]], armour2, { g: 'df', bevel: 1.4, under: true })
    const tail = () => s.poly([[52, 38], [63, 22], [60, 38], [63, 54], [52, 44]], armour2, { g: 'tail', bevel: 1.5 })
    const body = () => {
      s.tube([[22, 41, 7.5], [34, 40, 8.2], [46, 40, 6], [55, 40.5, 3]], armour, { g: 'body' })
      s.ellipse(19, 42, 9, 6, armour, { g: 'body' })
      if (!back) s.poly([[10, 44.5], [50, 44], [50, 50], [10, 50]], sand, { paint: true, onto: ['body'] })
      if (!icon) {
        for (const x of [24, 32, 40, 47]) s.shadeLine(x, 33, x - 1, 44, 2)
        for (const [x, y] of [
          [21, 36],
          [29, 34.5],
          [37, 34.5],
          [44, 36],
          [21, 41],
          [29, 40],
          [37, 40],
        ])
          s.dot(x, y, rivet, 0)
      }
    }
    if (back) {
      s.blob([[23, 33], [13, 36], [7, 43], [12, 46], [22, 42], [29, 38]], armour2, { g: 'pfL', bevel: 2.4, bias: 1 })
      s.blob([[28, 27], [30, 18], [35, 12], [39, 15], [36, 26], [32, 32]], armour2, { g: 'pfR', bevel: 2.4 })
      s.leaf(40, 49, 32, 55, 4.6, armour2, { g: 'pvL' }, 0.6)
      s.leaf(43, 46, 50, 41, 4.4, armour2, { g: 'pvR' }, -0.6)
      s.tube([[18, 26, 7.8], [28, 34, 8], [38, 45, 6], [45, 53, 3.6], [48, 58, 2.4]], armour, { g: 'body' })
      s.ellipse(18, 25, 9, 7.5, armour, { g: 'body', rot: 40 })
      if (!icon) {
        for (const [a, b, c, d] of [
          [22, 25, 16, 33],
          [29, 31, 23, 40],
          [36, 38, 30, 46],
          [42, 45, 37, 51],
        ])
          s.shadeLine(a, b, c, d, 2)
        for (const [x, y] of [
          [24, 31],
          [31, 37],
          [38, 44],
          [20, 27],
          [27, 33],
        ])
          s.dot(x, y, rivet, 0)
      }
      s.poly([[33, 38], [42, 30], [40, 42]], armour2, { g: 'dorsal', bevel: 1.2 })
      s.poly([[47, 57], [54, 53], [59, 55], [54, 59], [51, 64], [48, 61]], armour2, { g: 'tail', bevel: 1.4 })
      saw(s, 13, 20, -1, 5, 3, steel, 5, 3, 'saw', icon)
      return
    }
    fins(false)
    tail()
    body()
    saw(s, 12, 41.5, -3, 43, 3, steel, 5, 3, 'saw', icon)
    fins(true)
    if (icon) {
      iconEye(s, p, 16.5, 38, 'glow', { i: '#f8e070' })
      return
    }
    s.stamp(p.stamp(['oooo.', '.ohio', '..oo.'], { o: '#101820', i: '#f8e070', h: '#ffffff' }), 14, 36.5)
    s.line(9, 46, 14, 47, p.c('#404c5c'))
  },
}

export const SHORE_LINE = { cocrab, coconclaw, brandger, sawfry, sawbladon } satisfies Partial<Record<SpeciesId, Recipe>>
