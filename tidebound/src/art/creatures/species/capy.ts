/**
 * TUBBARA → CAPYBARON (capybaras) and PUFFLET → PUFFINAUT (puffins).
 */
import type { SpeciesId } from '../../../data/dex'
import { eye, iconEye, type Recipe } from '../kit'
import { puff } from '../parts'

const tubbara: Recipe = {
  size: 'S',
  shiny: { hue: 12, sat: 0.55, light: 0.3, band: [15, 50] },
  draw(s, p) {
    const fur = p.ramp3('#e4b47c', '#d0a068', '#a87840', { deepC: '#704820' })
    const snout = p.ramp3('#c89868', '#b08058', '#886038')
    const citrus = p.ramp3('#ffd070', '#f0a030', '#c07018')
    const leaf = p.ramp('#58a038')
    const back = s.back
    const icon = s.icon

    const legs = () => {
      s.ellipse(23, 59, 4, 2, fur, { g: 'lf', under: true })
      s.ellipse(43, 59.5, 4.2, 2, fur, { g: 'lh', under: true })
    }
    const body = () => {
      s.squircle(33, 48, 16, 11.5, 2.6, fur, { g: 'body', lift: -0.07 })
      if (!icon)
        for (const [x, y] of [
          [30, 40],
          [37, 41],
          [43, 44],
          [35, 46],
          [41, 50],
        ])
          s.shadeLine(x, y, x + 1, y + 1, 1)
    }
    const head = () => {
      s.ellipse(22.5, 34, 2.2, 2.2, fur, { g: 'ear' })
      s.squircle(19.5, 42, 8.8, 8, 2.7, fur, { g: 'head', ln: 'soft' })
      if (!back) s.squircle(14, 44, 4.5, 5, 2.4, snout, { paint: true, onto: ['head'] })
    }
    const fruit = () => {
      s.circle(19.5, 30, 4.2, citrus, { g: 'fruit' })
      s.leaf(19.5, 26.3, 24, 24.5, 2.8, leaf, { g: 'fleaf' }, -0.5)
      if (!icon) s.shadePx(18, 30, -1)
    }
    if (back) {
      head()
      fruit()
      legs()
      body()
      if (!icon)
        for (const [x, y] of [
          [26, 41],
          [31, 39],
          [36, 42],
          [41, 40],
          [29, 46],
          [35, 48],
          [42, 46],
          [25, 51],
          [46, 51],
        ])
          s.shadeLine(x, y, x + 1, y + 2, 1)
      return
    }
    legs()
    body()
    head()
    fruit()
    if (icon) {
      iconEye(s, p, 16, 40, 'slit', { p: '#302018' })
      return
    }
    s.stamp(p.stamp(['.ooo.', 'opppo', '.hoo.'], { o: '#402818', p: '#201010', h: '#e8c8a0' }), 13.5, 38.5)
    s.stamp(p.stamp(['oo.', 'ppo'], { o: '#402818', p: '#201010' }), 19.5, 38.5)
    s.pxs([10, 43, 10, 45], p.c('#402818'))
    s.line(12, 48, 14, 48, p.c('#6c4424'))
  },
}

const capybaron: Recipe = {
  size: 'M',
  front: { k: 0.9 },
  shiny: { hue: 12, sat: 0.55, light: 0.3, band: [15, 50] },
  draw(s, p) {
    const fur = p.ramp3('#d8a068', '#c89058', '#986030', { deepC: '#583418' })
    const chest = p.ramp3('#e8bc88', '#d8a470', '#b07848')
    const snout = p.ramp3('#b88858', '#a07048', '#785030')
    const pad = p.ramp3('#98e070', '#68b848', '#3c8830')
    const pink = p.ramp3('#ffc8e0', '#f090b8', '#c05888')
    const grey = p.ramp3('#ffffff', '#d8d8d8', '#a8a8b0')
    const water = p.ramp3('#d8f0ff', '#a8d8f8', '#70b0e8', { outC: '#3878c0' })
    const back = s.back
    const icon = s.icon

    const puddle = () => s.ellipse(33, 60, 23, 3.8, water, { g: 'water', line: false, flat: 1 })
    const haunch = () => {
      s.ellipse(41.5, 52, 8, 7.5, fur, { g: 'haunch', lift: -0.06 })
      s.ellipse(35, 58.5, 5, 2.2, fur, { g: 'hfoot' })
    }
    const body = () => {
      s.ellipse(35, 42, 13.5, 16, fur, { g: 'body', lift: -0.06 })
      if (!back) s.ellipse(27.5, 41, 7.5, 12, chest, { paint: true, onto: ['body'] })
    }
    const arms = () => {
      s.limb(29, 47, 3, 26.5, 58, 2.6, fur, { g: 'arm2', under: true })
      s.limb(24.5, 46, 3.2, 21.5, 58, 2.8, fur, { g: 'arm1' })
    }
    const head = () => {
      s.ellipse(31, 16.5, 2.4, 2.4, fur, { g: 'ear' })
      s.squircle(24.5, 23.5, 10, 8.5, 2.6, fur, { g: 'head' })
      if (!back) {
        s.squircle(18, 26, 5, 5, 2.4, snout, { paint: true, onto: ['head'] })
        puff(s, [[14.5, 30.5, 2.8], [18.5, 31.5, 3], [22.5, 30.5, 2.5]], grey, { g: 'stache' })
      }
    }
    const hat = () => {
      s.ellipse(24, 14, 11.5, 3.2, pad, { g: 'pad', tilt: [-0.2, -0.3] })
      s.poly(
        [
          [24, 14],
          [34, 12],
          [36, 15],
        ],
        pad,
        { cut: true },
      )
      if (!icon) s.shadeLine(17, 14, 22, 15, 1)
      puff(s, [[20, 11, 1.8], [22.5, 10, 1.8], [21, 8.5, 1.7], [18.5, 9.5, 1.6]], pink, { g: 'flower' })
      s.dot(20, 10, p.ramp('#ffe070'), 1)
    }
    if (back) {
      // From behind: a pear-shaped seated body, the head above with both
      // ears and the lily-pad hat.
      puddle()
      s.ellipse(36, 52, 16, 9, fur, { g: 'body', lift: -0.06 })
      s.ellipse(35, 42, 13.5, 14, fur, { g: 'body', lift: -0.06 })
      s.squircle(29, 26, 9.5, 8.5, 2.6, fur, { g: 'head', lift: -0.05 })
      s.ellipse(36.5, 20, 2.4, 2.2, fur, { g: 'ear1' })
      s.ellipse(22, 20, 2.4, 2.2, fur, { g: 'ear2' })
      s.ellipse(29, 15.5, 11.5, 3.2, p.ramp3('#98e070', '#68b848', '#3c8830'), { g: 'pad', tilt: [-0.2, -0.3] })
      puff(s, [[25, 12.5, 1.8], [27.5, 11.5, 1.8], [26, 10, 1.7], [23.5, 11, 1.6]], p.ramp3('#ffc8e0', '#f090b8', '#c05888'), { g: 'flower' })
      if (!icon)
        for (const [x, y] of [
          [30, 34],
          [36, 36],
          [41, 40],
          [31, 42],
          [37, 46],
          [43, 49],
          [29, 51],
          [27, 24],
          [32, 27],
        ])
          s.shadeLine(x, y, x + 1, y + 2, 1)
      return
    }
    puddle()
    body()
    haunch()
    arms()
    head()
    hat()
    if (icon) {
      iconEye(s, p, 22.5, 22, 'slit', { p: '#301810' })
      return
    }
    s.stamp(p.stamp(['.ooo.', 'opppo', '.oho.'], { o: '#381c10', p: '#201010', h: '#e8c8a0' }), 20, 20.5)
    s.stamp(p.stamp(['..ww..', '.w..w.', 'w....w', 'w....w', '.w..w.', '..ww..'], { w: '#f0f0f0' }), 19.5, 18.5)
    s.line(25.5, 22, 30, 27, p.c('#e0e0e0'))
    s.stamp(p.stamp(['oo.', 'ppo'], { o: '#381c10', p: '#201010' }), 14, 20.5)
    s.pxs([12, 27, 13, 26], p.c('#382014'))
  },
}

const pufflet: Recipe = {
  size: 'S',
  shiny: { hue: 200, sat: 0.8, band: [15, 50], map: { '#8c8c98': '#b89878', '#484858': '#705040' } },
  draw(s, p) {
    const down = p.ramp3('#a8a8b4', '#8c8c98', '#606070', { deepC: '#484858' })
    const white = p.ramp('#f8f8f8', { sh: 0.1, deep: 0.22 })
    const orange = p.ramp3('#ffc070', '#f89038', '#c86020')
    const back = s.back
    const icon = s.icon

    const feet = () => {
      s.poly([[22, 60.5], [25, 55], [29, 60.5]], orange, { g: 'ft1', bevel: 1 })
      s.poly([[34, 60.5], [37, 55.5], [41, 60.5]], orange, { g: 'ft2', bevel: 1 })
    }
    const body = () => {
      puff(
        s,
        [
          [32, 44, 14],
          [20, 40, 3],
          [22, 34.5, 3],
          [27.5, 31, 3],
          [34, 30.5, 3],
          [40.5, 32.5, 3],
          [45, 37.5, 3],
          [46.5, 44, 3],
          [45, 50, 3],
        ],
        down,
        { g: 'body' },
      )
      if (!back) s.ellipse(26, 47, 10.5, 10.5, white, { paint: true, onto: ['body'] })
    }
    const wings = (near: boolean) =>
      near
        ? s.leaf(43, 44, 53, 51, 6, down, { g: 'w1' }, 1)
        : s.leaf(21, 46, 12.5, 51.5, 5, down, { g: 'w2', under: true }, -1)
    const tuft = () => {
      s.tube([[32, 32, 1.4], [31, 28, 1.1], [33, 24.5, 0.6]], down, { g: 'tuft' })
      s.tube([[34, 32, 1.1], [36, 29, 0.8], [38.5, 28.5, 0.5]], down, { g: 'tuft' })
    }
    if (back) {
      tuft()
      wings(false)
      feet()
      body()
      wings(true)
      return
    }
    wings(false)
    feet()
    tuft()
    body()
    wings(true)
    // Beak.
    s.poly([[18.5, 43], [13, 46.5], [18.5, 49]], orange, { g: 'beak', bevel: 1.2 })
    if (icon) {
      iconEye(s, p, 21, 42, 'dark', { p: '#282830' })
      iconEye(s, p, 27, 41.5, 'dark', { p: '#282830' })
      return
    }
    eye(s, p, 'bead3', 20, 40.5, { p: '#282830' })
    eye(s, p, 'bead3', 26, 40, { p: '#282830' })
    s.pxs([18, 45, 19, 46], p.c('#fff0c0'))
    s.pxs([23, 45, 29, 45], p.c('#ffc8c8'))
  },
}

const puffinaut: Recipe = {
  size: 'M',
  front: { k: 0.9 },
  shiny: { hue: 180, sat: 0.9, band: [0, 70] },
  draw(s, p) {
    const black = p.ramp3('#585868', '#303040', '#202030', { deepC: '#181824' })
    const white = p.ramp('#ffffff', { sh: 0.1, deep: 0.22 })
    const orange = p.ramp3('#ffb070', '#f87830', '#c04810')
    const yellow = p.ramp3('#fff0a0', '#f8d040', '#c09818')
    const slate = p.ramp3('#7890c0', '#5070a0', '#304878')
    const goggle = p.ramp3('#e0e0e8', '#b0b0bc', '#80808c')
    const back = s.back
    const icon = s.icon

    const wing = (near: boolean) => {
      if (near) {
        s.poly([[36, 31], [47, 20], [58, 10], [62, 14], [60, 22], [54, 30], [46, 37], [39, 40]], black, { g: 'w1', bevel: 2.2, tilt: [-0.1, -0.2] })
        if (!icon)
          for (const [a, b, c, d] of [
            [50, 27, 56, 22],
            [46, 31, 53, 28],
            [54, 22, 59, 17],
          ])
            s.shadeLine(a, b, c, d, -1)
      } else {
        s.poly([[28, 30], [18, 22], [8, 15], [4, 19], [7, 26], [14, 31], [22, 36]], black, { g: 'w2', under: true, bevel: 2, bias: 1 })
      }
    }
    const body = () => {
      s.ellipse(33, 41, 10, 14, black, { g: 'body', rot: -8 })
      if (!back) s.ellipse(29, 44, 7, 11.5, white, { paint: true, onto: ['body'], rot: -8 })
      s.poly([[38, 52], [46, 57], [40, 57]], black, { g: 'tail', under: true, bevel: 1 })
    }
    const feet = () => {
      s.limb(29, 54, 1.4, 27, 58, 1.2, orange, { g: 'leg1', under: true })
      s.poly([[27, 57], [23, 61], [30, 60.5]], orange, { g: 'ft1', bevel: 1 })
      s.limb(34, 54, 1.4, 35, 58, 1.2, orange, { g: 'leg2', under: true })
      s.poly([[35, 57.5], [33, 61.5], [39, 60.5]], orange, { g: 'ft2', bevel: 1, under: true })
    }
    const head = () => {
      s.circle(26, 21.5, 8.5, black, { g: 'head' })
      if (!back) s.ellipse(22.5, 24, 6.5, 6.5, white, { paint: true, onto: ['head'] })
    }
    const beak = () => {
      s.poly([[19, 17], [7.5, 23], [9, 25], [19, 28.5]], orange, { g: 'beak', bevel: 1.2 })
      if (!back) {
        s.poly([[19, 16], [15.5, 18.5], [15.5, 27.5], [20, 29]], slate, { paint: true, onto: ['beak'] })
        s.poly([[15.5, 18], [12.5, 20], [12.5, 26.5], [15.5, 27.5]], yellow, { paint: true, onto: ['beak'] })
      }
    }
    if (back) {
      wing(false)
      beak()
      head()
      feet()
      body()
      wing(true)
      return
    }
    wing(false)
    feet()
    body()
    wing(true)
    head()
    beak()
    if (icon) {
      iconEye(s, p, 22.5, 20.5, 'dark', { p: '#181824' })
      return
    }
    s.ring(22.5, 20.5, 3, 2.6, 1, goggle, { g: 'goggle' })
    s.line(25, 19, 32, 17, p.c('#9898a4'))
    s.stamp(p.stamp(['hp', 'pp'], { h: '#ffffff', p: '#181824' }), 21.5, 19.5)
    s.pxs([12, 23, 13, 23], p.c('#a04818'))
  },
}

export const CAPY_LINE = { tubbara, capybaron, pufflet, puffinaut } satisfies Partial<Record<SpeciesId, Recipe>>
