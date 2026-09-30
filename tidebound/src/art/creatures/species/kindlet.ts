/**
 * KINDLET → CINDERAM → VOLCARAM: the ember goat starter line.
 */
import type { SpeciesId } from '../../../data/dex'
import type { Canvas, P3 } from '../canvas'
import type { Ramp } from '../color'
import { iconEye, type Pal, type Recipe } from '../kit'
import { flame, plates, puff, spiral } from '../parts'

function flames(p: Pal) {
  return {
    outer: p.glow('#f8a020', '#f07020', '#c03810', '#801c08'),
    core: p.glow('#fff8b0', '#ffe070', '#ffd040'),
  }
}

/** Glowing ember curls along the top edge of each wool bump. */
function embers(s: Canvas, bumps: readonly P3[], ember: Ramp, every = 1): void {
  bumps.forEach(([x, y, r], i) => {
    if (i % every) return
    // A little arc of glowing tips just inside the bump's upper rim.
    for (const [a, t] of [
      [-115, 2],
      [-90, 1],
      [-65, 1],
      [-40, 2],
    ] as const) {
      const rad = (a * Math.PI) / 180
      s.dot(Math.round(x + Math.cos(rad) * (r - 1.2)), Math.round(y + Math.sin(rad) * (r - 1.2)), ember, t)
    }
  })
}

function smoke(s: Canvas, p: Pal, list: readonly P3[], g: string): void {
  const sm = p.ramp3('#f4f2f4', '#d0ccd4', '#a09aa8', { outC: '#76707e', lineC: '#8c8894' })
  puff(s, list, sm, { g, line: false })
}

/** A rising wisp: a tapering curl of smoke along a gentle S. */
function wisp(s: Canvas, p: Pal, x: number, y: number, r: number, n: number, g: string, sway = 1): void {
  const sm = p.ramp3('#f4f2f4', '#d0ccd4', '#a09aa8', { outC: '#76707e', lineC: '#8c8894' })
  const list: P3[] = []
  const len = n * r * 1.6
  for (let i = 0; i <= 6; i++) {
    const t = i / 6
    list.push([x + Math.sin(t * Math.PI * 1.5) * 2.6 * sway, y - t * len, r * (1 - t * 0.75)])
  }
  s.tube(list, sm, { g, line: false })
}

const kindlet: Recipe = {
  size: 'S',
  front: { k: 0.86 },
  shiny: { hue: 175, sat: 0.95, band: [0, 70] },
  draw(s, p) {
    const wool = p.ramp3('#fffcf4', '#fff4e0', '#e8d4b0', { deepC: '#c8ac88' })
    const coal = p.ramp('#383038', { hi: 0.3 })
    const { outer, core } = flames(p)
    const back = s.back
    const icon = s.icon

    const bodyBumps: P3[] = [
      [29, 43, 6],
      [35, 40, 6.5],
      [42, 41, 6],
      [46, 45, 5],
      [40, 47, 5.5],
      [32, 47.5, 5.5],
      [26.5, 47, 4.5],
    ]
    const legs = (under: boolean) => {
      const o = { under }
      if (under) {
        s.limb(31, 50, 1.9, 30.5, 57, 1.6, wool, { g: 'fl2', ...o })
        s.ellipse(30.5, 58.3, 2.2, 1.6, coal, { g: 'fh2', ...o })
        s.limb(45, 49, 1.9, 47.5, 57, 1.6, wool, { g: 'hl2', ...o })
        s.ellipse(47.8, 58.3, 2.2, 1.6, coal, { g: 'hh2', ...o })
      } else {
        s.limb(27, 50, 2.1, 24.5, 57, 1.7, wool, { g: 'fl1' })
        s.ellipse(24, 58.5, 2.4, 1.7, coal, { g: 'fh1' })
        s.limb(41, 50, 2.1, 42.5, 57, 1.7, wool, { g: 'hl1' })
        s.ellipse(43, 58.5, 2.4, 1.7, coal, { g: 'hh1' })
      }
    }
    const tail = () => puff(s, [[50.5, 39, 3.2], [52, 41.5, 2.4]], wool, { g: 'tail' })
    const horns = () => {
      s.limb(16.5, 23, 1.8, 15.5, 19.5, 1.3, coal, { g: 'horn2' })
      s.limb(22.5, 22.5, 2, 23.5, 18.5, 1.5, coal, { g: 'horn1' })
      flame(s, 15.3, 17.5, 2, 5.5, outer, core, 'fl2', -0.25)
      flame(s, 23.8, 16.5, 2.2, 6, outer, core, 'fl1', 0.2)
    }
    const head = () => {
      s.leaf(26, 29.5, 33, 33, 4.2, wool, { g: 'ear' }, 0.8)
      s.circle(20, 30, 8.5, wool, { g: 'head' })
      puff(s, [[18.5, 23, 3.6], [23.5, 23.5, 3.3], [26.5, 27, 2.7]], wool, { g: 'head' })
      if (!back) {
        s.ellipse(16, 31.5, 7, 6, coal, { paint: true, onto: ['head'] })
        s.ellipse(13, 34.5, 3.8, 3.1, coal, { g: 'muzzle' })
      } else s.ellipse(13, 34.5, 3.6, 3, coal, { g: 'muzzle', under: true })
    }

    if (back) {
      head()
      horns()
      legs(true)
      puff(s, bodyBumps, wool, { g: 'body' })
      legs(false)
      tail()
      return
    }
    legs(true)
    tail()
    puff(s, bodyBumps, wool, { g: 'body' })
    legs(false)
    head()
    horns()
    if (icon) {
      iconEye(s, p, 17.5, 29, 'iris', { i: '#ffa020', p: '#401008' })
      iconEye(s, p, 12, 29.5, 'glow', { i: '#ffa020' })
      return
    }
    const eyeC = { o: '#181018', i: '#ffa020', j: '#e06010', h: '#ffffff', p: '#401008' }
    s.stamp(p.stamp(['.ooo.', 'ohhio', 'ohiio', 'oijjo', '.ooo.'], eyeC), 15, 26.5)
    s.stamp(p.stamp(['.oo', 'ohi', 'oij', '.oo'], eyeC), 10.5, 27.5)
    // Mischievous grin.
    s.pxs([10, 35, 11, 36, 12, 36, 13, 36, 14, 36, 15, 35], p.c('#f8e8d8'))
    s.px(13, 37, p.c('#f8e8d8'))
  },
}

const cinderam: Recipe = {
  size: 'M',
  shiny: { hue: 180, sat: 0.9, band: [0, 70] },
  draw(s, p) {
    const wool = p.ramp3('#b8b0b0', '#a09898', '#686068', { deepC: '#4c4450' })
    const coal = p.ramp('#383038', { hi: 0.28 })
    const horn = p.ramp3('#a07868', '#785048', '#4c3030')
    const hot = p.glow('#fff0a0', '#ffb040', '#e05818', '#802010')
    const ember = p.glow('#ffd070', '#ffb040', '#e05818')
    const back = s.back
    const icon = s.icon

    const bumps: P3[] = [
      [29, 40, 6.5],
      [36, 35.5, 7.5],
      [44, 35.5, 7],
      [50.5, 39.5, 5.8],
      [47, 45, 6.5],
      [38, 45, 7],
      [30, 46, 6],
    ]
    const far = () => {
      s.tube([[29, 48, 2.8], [26, 53, 2.3], [24, 57.5, 2]], coal, { g: 'fl2', under: true })
      s.tube([[47, 48, 3], [51, 53, 2.4], [52.5, 57.5, 2]], coal, { g: 'hl2', under: true })
    }
    const near = () => {
      s.tube([[27, 47, 3.2], [22.5, 52.5, 2.6], [19.5, 58, 2.3]], coal, { g: 'fl1' })
      s.tube([[43, 47, 3.8], [46.5, 52.5, 2.8], [45, 58, 2.3]], coal, { g: 'hl1' })
    }
    const hornSpiral = () => {
      const path = spiral(22, 38.5, 8.2, 3.6, -115, 205, 3.4, 1.7, 20)
      const cut = Math.floor(path.length * 0.66)
      s.tube(path.slice(0, cut + 1), horn, { g: 'horn' })
      s.tube(path.slice(cut), hot, { g: 'horn', flat: 2 })
      const [tx, ty] = path[path.length - 1]
      s.circle(tx, ty, 1.1, hot, { paint: true, onto: ['horn'], flat: 1 })
      if (!icon) for (let i = 2; i < cut; i += 3) s.shadeLine(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], 1)
    }
    const head = () => {
      s.ellipse(16, 43, 7, 6.5, coal, { g: 'head' })
      s.ellipse(10, 47, 4.2, 3.6, coal, { g: 'head' })
      hornSpiral()
    }
    const smokes = () => {
      wisp(s, p, 40, 26, 2.6, 4, 'sm1')
      wisp(s, p, 50, 31, 2, 3, 'sm2', -1)
    }

    if (back) {
      head()
      far()
      puff(s, bumps, wool, { g: 'body' })
      embers(s, bumps, ember)
      near()
      puff(s, [[53, 43, 3], [54.5, 46, 2.2]], wool, { g: 'tail' })
      smokes()
      return
    }
    far()
    puff(s, [[53, 43, 3], [54.5, 46, 2.2]], wool, { g: 'tail' })
    puff(s, bumps, wool, { g: 'body' })
    if (!icon) embers(s, bumps, ember)
    near()
    head()
    smokes()
    if (icon) {
      iconEye(s, p, 11.5, 41, 'glow', { i: '#ffa030' })
      return
    }
    s.stamp(p.stamp(['ooo..', 'ohiio', '.oiio', '..oo.'], { o: '#100810', i: '#ffa030', h: '#fff0a0' }), 9, 39)
    s.pxs([6, 47, 7, 47], p.c('#181018'))
  },
}

const volcaram: Recipe = {
  size: 'L',
  shiny: { hue: 190, sat: 0.95, band: [0, 70] },
  draw(s, p) {
    const basalt = p.ramp3('#7c7078', '#5c5058', '#383038', { deepC: '#281e28' })
    const basalt2 = p.ramp3('#6c6068', '#4c4250', '#302830', { deepC: '#201820' })
    const magma = p.glow('#fff0a0', '#ffe070', '#f08020', '#6c1808')
    const obsid = p.ramp3('#b0a8c8', '#302838', '#18101c', { deepC: '#0c080e', outC: '#08040a' })
    const rimC = p.glow('#ffb040', '#f08020', '#b83810', '#401008')
    const back = s.back
    const icon = s.icon

    const legs = (under: boolean) => {
      if (under) {
        s.squircle(24, 51, 4.6, 7.5, 3, basalt2, { g: 'fl2', under })
        s.squircle(49, 51, 4.6, 7.5, 3, basalt2, { g: 'hl2', under })
      } else {
        s.squircle(18.5, 51.5, 5.4, 7.5, 3, basalt, { g: 'fl1' })
        s.squircle(42.5, 51.5, 5.8, 7.5, 3, basalt, { g: 'hl1' })
        s.squircle(18, 58.5, 5.6, 2.2, 3, obsid, { g: 'fh1' })
        s.squircle(42.8, 58.5, 5.8, 2.2, 3, obsid, { g: 'hh1' })
        if (!icon) {
          s.shadeLine(18, 50, 19, 55, 1)
          s.shadeLine(42.5, 50, 43.5, 55, 1)
        }
        s.dot(16, 52, magma, 1).dot(17, 53, magma, 1)
        s.dot(44, 51, magma, 1).dot(44, 52, magma, 2)
      }
    }
    const body = () => {
      s.blob(
        [
          [12, 44],
          [17, 33],
          [26, 25],
          [36, 22],
          [46, 25],
          [55, 33],
          [59, 43],
          [55, 51],
          [44, 53],
          [26, 53],
          [15, 51],
        ],
        magma,
        { g: 'body', bevel: 4, flat: 1 },
      )
      plates(
        s,
        [
          [20, 36],
          [29, 29],
          [38, 27],
          [48, 30],
          [54, 40],
          [46, 40],
          [36, 36],
          [26, 41],
          [18, 46],
          [31, 48],
          [43, 48],
          [53, 48],
        ],
        1.3,
        [8, 18, 62, 56],
        ['body'],
        [basalt, basalt2],
        { bevel: 2.2 },
      )
    }
    const horn = () => {
      const path = spiral(20, 27, 11, 3.2, -95, 250, 4.2, 1.8, 22)
      s.tube(path.map(([x, y, r]) => [x, y, r + 0.9] as const), rimC, { g: 'horn', flat: 1 })
      s.tube(path.map(([x, y, r]) => [x - 0.5, y - 0.4, r] as const), obsid, { g: 'horn', z: 3 })
    }
    const face = p.ramp3('#9c8e98', '#6c5e68', '#44363e', { deepC: '#2c2028' })
    const head = () => {
      s.ellipse(13, 37.5, 7.5, 7, face, { g: 'head' })
      s.ellipse(8, 42.5, 4.8, 4.2, face, { g: 'head' })
      if (!icon) s.shadeLine(5, 45.5, 9, 46.5, 1)
    }
    const plume = () => {
      smoke(s, p, [[38, 16, 4], [42.5, 13, 3.6], [37, 10.5, 3.2], [41.5, 7, 2.8], [45, 9, 2.4]], 'pl1')
      smoke(s, p, [[30, 17.5, 2.8], [28, 13.5, 2.2]], 'pl2')
    }

    if (back) {
      head()
      legs(true)
      body()
      legs(false)
      horn()
      plume()
      return
    }
    legs(true)
    body()
    legs(false)
    plume()
    head()
    horn()
    if (icon) {
      iconEye(s, p, 10, 36, 'glow', { i: '#ffe070' })
      return
    }
    s.stamp(p.stamp(['ooooo.', 'ohiiio', '.oiio.', '..oo..'], { o: '#1c1018', i: '#ffe070', h: '#ffffff' }), 7, 34)
    s.pxs([4, 43, 5, 43], p.c('#f08020'))
  },
}

export const KINDLET_LINE = { kindlet, cinderam, volcaram } satisfies Partial<Record<SpeciesId, Recipe>>
