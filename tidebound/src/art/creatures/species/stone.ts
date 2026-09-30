/**
 * PEBBLIT → CRAGOYLE (stone gargoyles) and WOMBIT → WOMBASTION (wombats).
 */
import type { SpeciesId } from '../../../data/dex'
import type { Canvas } from '../canvas'
import type { Ramp } from '../color'
import { eye, iconEye, type Recipe } from '../kit'
import { spiral } from '../parts'

/** Speckles and cracks on stone. */
function stoneMarks(s: Canvas, specks: readonly (readonly [number, number])[], cracks: readonly (readonly [number, number, number, number])[]): void {
  for (const [x, y] of specks) s.shadePx(x, y, 1)
  for (const [a, b, c, d] of cracks) s.shadeLine(a, b, c, d, 2)
}

/**
 * A bat wing: an arm from the shoulder to the wrist, fingers fanning from the
 * wrist to the tips, and membrane between them with scalloped edges, closing
 * back onto the body at `root`.
 */
function batWing(
  s: Canvas,
  sx: number,
  sy: number,
  wx: number,
  wy: number,
  tips: readonly (readonly [number, number])[],
  root: readonly [number, number],
  r: Ramp,
  mem: Ramp,
  g: string,
  under = false,
  bone = 1.2,
): void {
  const pts: [number, number][] = [[sx, sy], [wx, wy]]
  const all = [...tips, root]
  all.forEach(([x, y], i) => {
    pts.push([x, y])
    if (i < all.length - 1) {
      const [nx, ny] = all[i + 1]
      const mx = (x + nx) / 2
      const my = (y + ny) / 2
      pts.push([mx + (wx - mx) * 0.3, my + (wy - my) * 0.3])
    }
  })
  s.poly(pts, mem, { g: `${g}m`, under, bevel: 1.6, tilt: [0.1, 0.15] })
  s.limb(sx, sy, bone * 1.5, wx, wy, bone * 1.2, r, { g: `${g}b`, under })
  for (const [x, y] of tips) s.limb(wx, wy, bone, x, y, bone * 0.45, r, { g: `${g}b`, under })
}

const pebblit: Recipe = {
  size: 'S',
  front: { k: 0.92 },
  shiny: { map: { '#c8c8c0': '#d8c0a0', '#909088': '#b09070', '#585850': '#705840', '#f8b830': '#60e8f8' } },
  draw(s, p) {
    const stone = p.ramp3('#dcdcd4', '#c8c8c0', '#909088', { deepC: '#6c6c64' })
    const dark = p.ramp3('#a8a8a0', '#909088', '#686860', { deepC: '#585850' })
    const moss = p.ramp('#70a060')
    const back = s.back
    const icon = s.icon

    const wings = () => {
      batWing(s, 39, 38, 43, 31, [[45, 26], [50, 28], [52, 34]], [43, 40], dark, dark, 'wg1', false, 0.8)
      batWing(s, 36, 37, 38, 30, [[37, 25], [42, 25]], [39, 36], dark, dark, 'wg2', true, 0.7)
    }
    const tail = () => s.poly([[44, 53], [53, 47], [51, 51], [55, 51], [47, 57]], stone, { g: 'tail', bevel: 1.4 })
    const body = () => {
      s.ellipse(35, 48, 11, 11, stone, { g: 'body' })
      s.ellipse(40.5, 54, 6.5, 5.5, stone, { g: 'haunch' })
      s.ellipse(37, 59.3, 4.5, 2, stone, { g: 'hpaw' })
    }
    const paws = () => {
      s.limb(27, 49, 3.4, 25, 57, 3, stone, { g: 'arm2', under: true })
      s.ellipse(26, 58.5, 4, 2.4, stone, { g: 'arm2', under: true })
      s.limb(24, 49, 3.6, 20.5, 57, 3.2, stone, { g: 'arm1' })
      s.ellipse(20, 58.5, 4.4, 2.6, stone, { g: 'arm1' })
    }
    const head = () => {
      s.limb(20, 27.5, 2.2, 17.5, 22, 1.2, dark, { g: 'horn2' })
      s.squircle(22, 35, 10, 9, 2.5, stone, { g: 'head' })
      s.tube(spiral(27.5, 26, 3.4, 2.4, 170, 280, 2.4, 1.2, 8), dark, { g: 'horn1' })
      s.squircle(14.5, 39, 5, 4, 2.3, stone, { g: 'snout' })
      s.ellipse(28, 28, 3, 1.8, moss, { paint: true, onto: ['head'] })
    }
    if (back) {
      head()
      paws()
      body()
      wings()
      tail()
      if (!icon) stoneMarks(s, [[33, 44], [38, 49], [30, 52]], [[36, 40, 38, 45], [30, 30, 32, 34]])
      return
    }
    wings()
    tail()
    body()
    paws()
    head()
    if (!icon) stoneMarks(s, [[38, 44], [42, 50], [31, 54], [26, 31]], [[40, 40, 42, 44], [42, 44, 41, 47], [19, 29, 21, 31]])
    if (icon) {
      iconEye(s, p, 20.5, 33, 'glow', { i: '#f8b830' })
      iconEye(s, p, 14.5, 33.5, 'glow', { i: '#f8b830' })
      return
    }
    const ec = { o: '#403830', i: '#f8b830', h: '#fff4b0' }
    // Grumpy brows slanting down toward the snout.
    s.stamp(p.stamp(['oo...', '.ooo.', '.ohio', '..oo.'], ec), 18, 31)
    s.stamp(p.stamp(['..o', '.oo', 'ohi', '.o.'], ec), 12.5, 31.5)
    s.stamp(p.stamp(['oo', 'oo'], { o: '#403830' }), 10.5, 37.5)
    s.pxs([13, 42, 14, 41, 15, 41, 16, 42], p.c('#585850'))
  },
}

const cragoyle: Recipe = {
  size: 'L',
  front: { k: 0.92 },
  shiny: { map: { '#b8b8b0': '#c8b098', '#808078': '#98806c', '#484840': '#584838', '#f89830': '#80f0ff', '#68a050': '#c070c0' } },
  draw(s, p) {
    const stone = p.ramp3('#d0d0c8', '#b8b8b0', '#8c8c84', { deepC: '#66665e' })
    const wingBone = p.ramp3('#a8a8a0', '#909088', '#6c6c64', { deepC: '#50504a' })
    const memR = p.ramp3('#8c8c84', '#727268', '#56564e', { deepC: '#44443c' })
    const ledge = p.ramp3('#b8a890', '#948470', '#6c604e', { deepC: '#4c4238' })
    const moss = p.ramp3('#a8d880', '#78b058', '#4c8038')
    const horn = p.ramp3('#7c7c74', '#5c5c54', '#3c3c36')
    const back = s.back
    const icon = s.icon

    const rock = () => {
      s.poly([[3, 55], [9, 51], [30, 50.5], [52, 51.5], [61, 55], [61, 62], [3, 62]], ledge, { g: 'ledge', bevel: 2.5, tilt: [0, -0.35] })
      if (!icon) {
        s.shadeLine(12, 56, 20, 57, 1).shadeLine(38, 55, 46, 58, 1)
        s.dot(21, 57, moss, 1).dot(22, 57, moss, 2).dot(46, 58, moss, 1)
      }
    }
    const wings = (far: boolean) =>
      far
        ? batWing(s, 27, 28, 19, 15, [[11, 6], [5, 12], [3, 22]], [22, 32], wingBone, memR, 'wf', true, 1.1)
        : batWing(s, 37, 27, 45, 12, [[53, 2], [61, 8], [62, 19], [58, 30]], [42, 36], wingBone, memR, 'wn', false, 1.4)
    const tail = () => {
      s.tube([[43, 48, 2.6], [51, 49.5, 2.2], [56, 54, 1.8], [57, 58.5, 1.4]], stone, { g: 'tail' })
      s.poly([[57, 57.5], [53.5, 60], [57.5, 63.5], [61, 60]], stone, { g: 'spade', bevel: 1.2 })
    }
    const body = () => {
      s.ellipse(33, 38, 9.5, 11.5, stone, { g: 'body', rot: -15 })
      s.ellipse(40, 45.5, 7, 6.2, stone, { g: 'thigh' })
      s.limb(42, 47, 3.2, 43, 50.5, 2.8, stone, { g: 'thigh' })
      s.ellipse(41.5, 51, 5, 2, stone, { g: 'foot' })
      for (const dx of [-3, 0, 3]) s.limb(41.5 + dx, 51, 0.9, 39.5 + dx * 1.2, 53, 0.5, stone, { g: 'foot' })
    }
    const arms = (far: boolean) => {
      if (far) {
        s.limb(30, 32, 3, 27, 42, 2.6, stone, { g: 'a2', under: true })
        s.limb(27, 42, 2.4, 28, 50, 2.2, stone, { g: 'a2', under: true })
      } else {
        s.limb(27, 33, 3.4, 21, 42, 3, stone, { g: 'a1' })
        s.limb(21, 42, 2.8, 20, 49.5, 2.4, stone, { g: 'a1' })
        for (const dx of [-3, 0, 3]) s.limb(20 + dx * 0.8, 49.5, 1, 18 + dx * 1.1, 52.5, 0.5, stone, { g: 'a1' })
      }
    }
    const head = () => {
      s.tube([[25, 21, 1.8], [31, 17, 1.5], [38, 16, 1.1], [43, 18.5, 0.6]], horn, { g: 'horn2' })
      s.ellipse(21, 25, 7.5, 6.5, stone, { g: 'head' })
      // Jutting lower jaw with fangs.
      s.squircle(14.5, 30.5, 5.2, 3.4, 2.6, stone, { g: 'jaw', rot: -8 })
      s.squircle(15.5, 25.5, 4.5, 2.8, 2.6, stone, { g: 'head' })
      s.tube([[20, 19.5, 2], [26, 13, 1.7], [33, 10, 1.2], [39, 11, 0.6]], horn, { g: 'horn1' })
    }
    const mossy = () => {
      if (icon) return
      // Moss tucked into cracks: a dark crack with green on its lip.
      for (const [x1, y1, x2, y2] of [
        [34, 32, 37, 37],
        [29, 41, 32, 44],
        [39, 43, 42, 47],
        [23, 21, 26, 23],
      ]) {
        s.shadeLine(x1, y1, x2, y2, 2)
        s.dot(x1 - 1, y1 + 1, moss, 1).dot(Math.round((x1 + x2) / 2) - 1, Math.round((y1 + y2) / 2) + 1, moss, 2)
      }
    }
    if (back) {
      rock()
      head()
      arms(false)
      wings(true)
      body()
      arms(true)
      mossy()
      wings(false)
      tail()
      return
    }
    wings(true)
    rock()
    tail()
    arms(true)
    body()
    wings(false)
    mossy()
    arms(false)
    head()
    if (!icon) stoneMarks(s, [[34, 34], [30, 38], [37, 42]], [])
    if (icon) {
      iconEye(s, p, 18, 22.5, 'glow', { i: '#f89830' })
      return
    }
    s.stamp(p.stamp(['oo....', '.oooo.', '.ohiio', '..ooo.'], { o: '#302820', i: '#f89830', h: '#fff0a0' }), 15, 20.5)
    s.stamp(p.stamp(['w...w', 'w...w'], { w: '#f8f8f0' }), 11.5, 27.5)
    s.line(10, 28.5, 18, 29.5, p.c('#403830'))
  },
}

const wombit: Recipe = {
  size: 'S',
  shiny: { hue: -30, sat: 0.5, light: -0.05, band: [15, 60], map: { '#e0c090': '#d8d8e0', '#b89060': '#a8a8b8', '#785830': '#686878' } },
  draw(s, p) {
    const fur = p.ramp3('#ecd0a4', '#e0c090', '#b89060', { deepC: '#8c6c40' })
    const muzzle = p.ramp('#f0e0c0', { sh: 0.12, deep: 0.26 })
    const nose = p.ramp3('#685040', '#483020', '#301c10')
    const dirt = p.ramp('#a07848')
    const back = s.back
    const icon = s.icon

    const legs = (far: boolean) => {
      if (far) {
        s.squircle(28, 56, 3.2, 4, 2.6, fur, { g: 'lf2', under: true })
        s.squircle(47, 56, 3.2, 4, 2.6, fur, { g: 'lh2', under: true })
      } else {
        s.squircle(21, 56.5, 3.6, 4, 2.6, fur, { g: 'lf1' })
        s.squircle(40, 56.5, 3.8, 4, 2.6, fur, { g: 'lh1' })
        s.ellipse(20, 59.5, 3.4, 1.4, dirt, { paint: true, onto: ['lf1'] })
        s.ellipse(39.5, 59.5, 3.4, 1.4, dirt, { paint: true, onto: ['lh1'] })
      }
    }
    const body = () => {
      s.squircle(35, 47, 15, 10.5, 3, fur, { g: 'body', lift: -0.06 })
      if (!icon)
        for (const [x, y] of back
          ? [
              [27, 40],
              [33, 39],
              [39, 40],
              [45, 42],
              [30, 45],
              [37, 46],
              [43, 48],
            ]
          : [
              [34, 40],
              [40, 41],
              [45, 44],
              [38, 47],
            ])
          s.shadeLine(x, y, x + 1, y + 2, 1)
    }
    const head = () => {
      s.circle(24.5, 36, 2.5, fur, { g: 'ear2' })
      s.squircle(19, 44, 9.5, 8.5, 2.6, fur, { g: 'head' })
      s.circle(20.5, 36.5, 2.6, fur, { g: 'ear1' })
      if (!back) {
        s.squircle(13, 47, 5.5, 4.5, 2.4, muzzle, { paint: true, onto: ['head'] })
        s.squircle(9.5, 45.5, 3, 2.2, 3, nose, { g: 'nose' })
        s.ellipse(12, 48.5, 2.2, 1, dirt, { paint: true, onto: ['head'] })
      }
    }
    if (back) {
      head()
      legs(false)
      body()
      legs(true)
      return
    }
    legs(true)
    body()
    legs(false)
    head()
    if (icon) {
      iconEye(s, p, 16, 42.5, 'dark', { p: '#201410' })
      return
    }
    eye(s, p, 'bead3', 15, 41, { p: '#201410' })
    s.px(20, 41, p.c('#201410')).px(20, 42, p.c('#201410'))
    s.px(8, 45, p.c('#988070'))
    s.pxs([13, 51, 14, 51], p.c('#8c6c40'))
  },
}

const wombastion: Recipe = {
  size: 'L',
  front: { k: 1.0 },
  shiny: { hue: -30, sat: 0.5, band: [15, 60], map: { '#c8a070': '#c0c0cc', '#8c6838': '#8c8ca0', '#503818': '#50506c' } },
  draw(s, p) {
    const fur = p.ramp3('#d8b484', '#c8a070', '#8c6838', { deepC: '#604420' })
    const slab = p.ramp3('#c4c4bc', '#a8a8a0', '#787870', { deepC: '#58584e' })
    const rockR = p.ramp3('#b8b0a0', '#9c9484', '#6c6454', { deepC: '#50483c' })
    const nose = p.ramp3('#584030', '#402818', '#281408')
    const muzzle = p.ramp3('#e0c8a0', '#d4b488', '#a88858')
    const back = s.back
    const icon = s.icon

    const legs = (far: boolean) => {
      if (far) {
        s.squircle(25, 55, 4.5, 6, 2.8, fur, { g: 'lf2', under: true })
        s.squircle(51, 55, 4.5, 6, 2.8, fur, { g: 'lh2', under: true })
      } else {
        s.squircle(21, 54.5, 5.5, 6.5, 2.8, fur, { g: 'lf1' })
        s.squircle(44, 54.5, 5.5, 6.5, 2.8, fur, { g: 'lh1' })
      }
    }
    const body = () => {
      s.squircle(35, 42, 20, 13, 3.2, fur, { g: 'body' })
      // The stone slab over back and hindquarters, with crenellations.
      const top = 27
      const pts: [number, number][] = [[28, 48], [28, top + 4]]
      for (let x = 28, i = 0; x < 55; x += 4.5, i++) {
        const y = i % 2 ? top : top + 3.5
        pts.push([x, y], [x + 4.5, y])
      }
      pts.push([57, top + 4], [57.5, 50], [50, 53], [35, 52])
      s.poly(pts, slab, { g: 'slab', bevel: 1.6, tilt: [0.05, -0.1] })
      if (!icon) {
        for (const [a, b, c, d] of [
          [30, 38, 56, 38],
          [30, 45, 56, 45],
          [38, 31, 38, 38],
          [47, 31, 47, 38],
          [34, 38, 34, 45],
          [43, 38, 43, 45],
          [52, 38, 52, 45],
          [39, 45, 39, 51],
          [48, 45, 48, 51],
        ])
          s.shadeLine(a, b, c, d, 2)
      }
    }
    const boulder = () => {
      s.circle(12, 55, 6.5, rockR, { g: 'boulder' })
      if (!icon) s.shadeLine(9, 53, 12, 57, 1).shadePx(14, 52, 1)
    }
    const head = () => {
      s.circle(22, 30.5, 2.8, fur, { g: 'ear' })
      s.squircle(16, 38, 10, 9, 2.7, fur, { g: 'head' })
      if (!back) {
        s.squircle(9.5, 41.5, 6, 4.8, 2.4, muzzle, { paint: true, onto: ['head'] })
        s.squircle(5.5, 39.5, 3.4, 2.6, 3, nose, { g: 'nose' })
      }
    }
    const paw = () => {
      s.squircle(14.5, 50, 5, 4, 2.6, fur, { g: 'paw' })
      for (const dx of [-3, 0, 3]) s.limb(14 + dx, 48.5, 0.8, 11.5 + dx, 49.5, 0.5, p.ramp('#503818'), { g: 'claw' })
    }
    if (back) {
      head()
      legs(true)
      boulder()
      body()
      legs(false)
      paw()
      return
    }
    legs(true)
    body()
    legs(false)
    boulder()
    head()
    paw()
    if (icon) {
      iconEye(s, p, 12.5, 35.5, 'slit', { p: '#201008' })
      return
    }
    s.stamp(p.stamp(['oooo.', '.ohpo', '..oo.'], { o: '#302010', p: '#201008', h: '#e8c8a0' }), 10, 34)
    s.stamp(p.stamp(['ooo', 'op.'], { o: '#302010', p: '#201008' }), 16.5, 34.5)
    s.line(4, 44.5, 7, 44.5, p.c('#604420'))
  },
}

export const STONE_LINE = { pebblit, cragoyle, wombit, wombastion } satisfies Partial<Record<SpeciesId, Recipe>>
