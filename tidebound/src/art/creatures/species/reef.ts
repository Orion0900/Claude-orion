/**
 * SPINEFIN → LIONSPIRE (lionfish), JABSHRIMP → CLOBBERCLAW (mantis shrimp)
 * and CLIONETTE → SERAFIN (sea angels).
 */
import type { SpeciesId } from '../../../data/dex'
import type { Canvas, P2 } from '../canvas'
import type { Ramp } from '../color'
import { eye, iconEye, type Pal, type Recipe } from '../kit'
import { crestFin, finFan, puff, teardrop } from '../parts'

/** Vertical-ish bands across a fish body (polygons painted onto `onto`). */
function bands(s: Canvas, xs: readonly number[], w: number, y0: number, y1: number, slant: number, r: Ramp, onto: string): void {
  for (const x of xs)
    s.poly(
      [
        [x - w / 2, y0],
        [x + w / 2, y0],
        [x + w / 2 + slant, y1],
        [x - w / 2 + slant, y1],
      ],
      r,
      { paint: true, onto: [onto] },
    )
}

const spinefin: Recipe = {
  size: 'S',
  front: { k: 0.94, dy: -3 },
  shiny: { hue: 150, sat: 0.95, band: [260, 360] },
  draw(s, p) {
    const cream = p.ramp('#f8e8d8', { sh: 0.12, deep: 0.26, outC: '#40205c', lineC: '#7c5070' })
    const violet = p.ramp3('#d098e0', '#c078d8', '#9050b0', { deepC: '#7838a0' })
    const deepV = p.ramp3('#9858c0', '#7838a0', '#582880', { deepC: '#40205c' })
    const web = p.ramp3('#f0d8f8', '#e0b8f0', '#b888d0', { outC: '#583078' })
    const spine = p.ramp3('#a060c0', '#7838a0', '#40205c')
    const tip = p.ramp('#f050a0')
    const back = s.back
    const icon = s.icon

    const tail = () =>
      finFan(s, 41, 40, [[51, 31], [53.5, 37], [53.5, 43], [51, 49]], web, spine, 'tail', { web: 0.95, sag: 0.1 })
    const dorsal = () =>
      crestFin(
        s,
        [[23, 33], [27, 31.5], [31, 31], [35, 31.5], [39, 33]],
        [[18, 17], [23, 14], [30, 13], [37, 15], [44, 19]],
        web,
        spine,
        'dorsal',
        { web: 0.5, tipR: tip, under: true, spine: 0.8 },
      )
    const pectoral = (near: boolean) =>
      near
        ? finFan(s, 29, 44, [[19, 53], [22, 57], [27, 59], [32, 58.5], [36, 55]], web, spine, 'pf1', { web: 0.85, tipR: tip })
        : finFan(s, 34, 44, [[40, 55], [44, 52]], web, spine, 'pf2', { web: 0.85, under: true })
    const body = () => {
      s.ellipse(31, 40, 11.5, 9.5, cream, { g: 'body' })
      bands(s, [24, 30.5, 37, 42.5], 3, 28, 52, 1.5, violet, 'body')
      if (!back) s.ellipse(20, 40, 3.5, 6, deepV, { paint: true, onto: ['body'] })
    }
    if (back) {
      pectoral(false)
      dorsal()
      tail()
      body()
      pectoral(true)
      return
    }
    dorsal()
    pectoral(false)
    tail()
    body()
    pectoral(true)
    if (icon) {
      iconEye(s, p, 22.5, 37, 'dark', { p: '#281830' })
      return
    }
    eye(s, p, 'round56', 20, 34, { p: '#281830', w: '#c8a0f0' })
    s.stamp(p.stamp(['.pp', 'pmp', '.pp'], { p: '#a03070', m: '#f080b0' }), 17.5, 41.5)
  },
}

const lionspire: Recipe = {
  size: 'L',
  shiny: { hue: 140, sat: 0.95, band: [260, 360] },
  draw(s, p) {
    const cream = p.ramp('#fff0e0', { sh: 0.12, deep: 0.26, outC: '#40184c', lineC: '#7c4868' })
    const violet = p.ramp3('#b068d0', '#9040b8', '#682890', { deepC: '#4c1c6c' })
    const magenta = p.ramp3('#ff88b8', '#f04890', '#b82868')
    const web = p.ramp3('#fcecff', '#f0d0fc', '#cca0e0', { outC: '#50206c' })
    const spine = p.ramp3('#a050c8', '#682890', '#381850')
    const tip = p.ramp('#f04890')
    const back = s.back
    const icon = s.icon

    const mane = () => {
      const tips: P2[] = []
      for (let i = 0; i < 10; i++) {
        const a = ((-215 + i * 25) * Math.PI) / 180
        const L = 16 + (i % 2) * 3.5
        tips.push([26 + Math.cos(a) * L, 30 + Math.sin(a) * L])
      }
      finFan(s, 26, 30, tips, web, spine, 'mane', { web: 0.78, sag: 0.22, tipR: tip, spine: 0.9 })
    }
    const crown = () =>
      crestFin(
        s,
        [[33, 29], [37, 29], [41, 30.5], [45, 33], [49, 36]],
        [[31, 9], [37, 6], [44, 8], [50, 13], [55, 20]],
        web,
        spine,
        'crown',
        { web: 0.55, tipR: tip, under: true },
      )
    const trailing = (near: boolean) =>
      near
        ? finFan(s, 32, 44, [[21, 57], [26, 62.5], [33, 63], [39, 59.5]], web, spine, 'pf1', { web: 0.95, sag: 0.12 })
        : finFan(s, 41, 45, [[45, 60], [50, 61], [55, 57]], web, spine, 'pf2', { web: 0.92, under: true })
    const tail = () => finFan(s, 51, 46, [[58, 37], [62, 44], [62, 51], [58, 57]], web, spine, 'tail', { web: 0.95, sag: 0.1 })
    const body = () => {
      s.ellipse(38, 39, 14, 9.5, cream, { g: 'body', rot: 25 })
      for (const [x, c] of [
        [33, magenta],
        [38.5, violet],
        [44, magenta],
        [49, violet],
      ] as const)
        s.poly(
          [
            [x - 1.7 + 5, 24],
            [x + 1.7 + 5, 24],
            [x + 1.7 - 5, 54],
            [x - 1.7 - 5, 54],
          ],
          c,
          { paint: true, onto: ['body'] },
        )
    }
    const head = () => {
      s.ellipse(23, 31, 8.5, 7.5, cream, { g: 'head', rot: 20 })
      s.poly([[22, 22], [25.5, 22], [22, 40], [18.5, 40]], violet, { paint: true, onto: ['head'] })
      s.squircle(16.5, 36.5, 4, 2.6, 2.4, cream, { g: 'jaw', rot: 15 })
    }
    if (back) {
      trailing(false)
      crown()
      tail()
      body()
      mane()
      head()
      trailing(true)
      return
    }
    crown()
    trailing(false)
    tail()
    mane()
    body()
    head()
    trailing(true)
    if (icon) {
      iconEye(s, p, 18.5, 29.5, 'glow', { i: '#f8d040' })
      return
    }
    s.stamp(p.stamp(['oooo.', 'ohiio', '.ooo.'], { o: '#281030', i: '#f8d040', h: '#ffffff' }), 16, 28)
    s.line(13, 35, 16, 36, p.c('#682890'))
  },
}

function rainbowEye(s: Canvas, p: Pal, x: number, y: number, rx: number, ry: number, g: string, icon: boolean): void {
  s.ellipse(x, y, rx, ry, p.ramp3('#80f0c0', '#40c090', '#208060'), { g })
  const cols = icon ? ['#f86050', '#50c8f0'] : ['#f84860', '#f8c030', '#60e060', '#40a0f8']
  cols.forEach((c, i) => {
    const yy = y - ry + ((i + 0.5) * 2 * ry) / cols.length
    s.poly(
      [
        [x - rx - 1, yy - 0.6],
        [x + rx + 1, yy - 1.2],
        [x + rx + 1, yy + 0.4],
        [x - rx - 1, yy + 1],
      ],
      p.ramp(c),
      { paint: true, onto: [g], flat: 1 },
    )
  })
  if (!icon) s.dot(Math.round(x - rx * 0.4), Math.round(y - ry * 0.3), p.ramp('#181818'), 1)
}

const jabshrimp: Recipe = {
  size: 'S',
  front: { k: 0.82 },
  shiny: { hue: 140, sat: 1, band: [140, 200] },
  draw(s, p) {
    const teal = p.ramp3('#98f0d8', '#58c8b0', '#28a090', { deepC: '#106050' })
    const glove = p.ramp3('#ffc0a0', '#f88850', '#c85830')
    const lime = p.ramp('#c8e848')
    const orange = p.ramp('#f88850')
    const back = s.back
    const icon = s.icon

    const tailFan = () => finFan(s, 38, 55, [[30, 60], [35, 61.5], [41, 61.5], [46, 60]], teal, teal, 'fan', { web: 0.98, sag: 0.1, spine: 0.6 })
    const segs: [number, number, number, number][] = [
      [38, 51, 5.4, 4],
      [36.5, 45.5, 6, 4.2],
      [34.5, 39.5, 6.2, 4.4],
      [32, 33.5, 6.2, 4.4],
    ]
    const body = () =>
      segs.forEach(([x, y, rx, ry], i) => {
        s.ellipse(x, y, rx, ry, teal, { g: `sg${i}` })
        s.ellipse(x + 1, y + ry * 0.75, rx * 0.9, 1.4, orange, { paint: true, onto: [`sg${i}`] })
        if (!icon) s.dot(Math.round(x + rx * 0.4), Math.round(y - 1), lime, 1)
      })
    const legs = () => {
      for (const [x, y] of [
        [33, 47],
        [34, 50],
      ])
        s.limb(x, y, 0.9, x - 4, y + 4, 0.6, teal, { g: `lg${y}`, under: true })
    }
    const head = () => {
      s.limb(28, 25, 1.1, 25, 16, 0.9, teal, { g: 'stalk2' })
      s.limb(30, 25, 1.2, 31, 15, 1, teal, { g: 'stalk1' })
      rainbowEye(s, p, 24.5, 14, 2.4, 3.2, 'eye2', icon)
      rainbowEye(s, p, 31.5, 13, 2.6, 3.4, 'eye1', icon)
      s.ellipse(28, 28, 6, 4.8, teal, { g: 'head' })
    }
    const antennae = () => {
      for (const [x0, y0, x1, y1] of [
        [24, 27, 12, 19],
        [25, 29, 13, 26],
      ] as const) {
        s.limb(x0, y0, 0.6, x1, y1, 0.4, teal, { g: `an${y1}` })
        if (!icon) s.limb(x1 + 2, y1 + 0.5, 0.9, x1 - 1, y1 - 1.5, 0.5, lime, { g: `af${y1}` })
      }
    }
    const gloves = (far: boolean) => {
      if (far) {
        s.limb(29, 34, 1.8, 24, 30, 1.6, teal, { g: 'arm2', under: true })
        s.circle(21, 27.5, 4.6, glove, { g: 'glove2', under: true })
      } else {
        s.limb(31, 38, 2, 24, 38, 1.8, teal, { g: 'arm1' })
        s.circle(19.5, 36.5, 5.4, glove, { g: 'glove1' })
        if (!icon) s.shadeLine(16, 38, 18, 40, 1)
      }
    }
    if (back) {
      antennae()
      head()
      gloves(false)
      tailFan()
      body()
      legs()
      gloves(true)
      return
    }
    gloves(true)
    tailFan()
    legs()
    body()
    antennae()
    head()
    gloves(false)
    if (!icon) s.pxs([23, 29, 24, 29], p.c('#106050'))
  },
}

const clobberclaw: Recipe = {
  size: 'L',
  front: { k: 0.93 },
  shiny: { hue: 140, sat: 1, band: [140, 200] },
  draw(s, p) {
    const teal = p.ramp3('#a8f8e0', '#58d0b8', '#30b0a0', { deepC: '#107060' })
    const green = p.ramp3('#e0f8a0', '#b8e060', '#78a830', { deepC: '#507020' })
    const orange = p.ramp3('#ffc8a0', '#ff9050', '#c85c28', { deepC: '#903818' })
    const pink = p.ramp3('#ff88b0', '#e03878', '#a01c50')
    const club = p.ramp3('#ffd0b0', '#ff9050', '#c05828', { deepC: '#803010' })
    const back = s.back
    const icon = s.icon

    const tailFan = () =>
      finFan(s, 40, 55, [[26, 61], [32, 63], [40, 64], [48, 63], [54, 60]], teal, teal, 'fan', { web: 0.98, sag: 0.08, spine: 0.8 })
    const segs: [number, number, number, number, Ramp][] = [
      [40, 51, 8, 5, orange],
      [38.5, 44, 9, 5.5, teal],
      [36, 36.5, 9.5, 5.6, green],
      [33, 29, 9, 5.4, teal],
    ]
    const body = () =>
      segs.forEach(([x, y, rx, ry, c], i) => {
        s.ellipse(x, y, rx, ry, c, { g: `sg${i}` })
        s.ellipse(x - rx * 0.35, y - ry * 0.35, rx * 0.4, ry * 0.3, pink, { paint: true, onto: [`sg${i}`], flat: 0 })
      })
    const legs = () => {
      for (const [x, y] of [
        [32, 45],
        [34, 49],
      ])
        s.limb(x, y, 1.4, x - 5, y + 6, 0.9, orange, { g: `lg${y}`, under: true })
    }
    const head = () => {
      s.limb(27, 18, 1.5, 24, 9, 1.2, teal, { g: 'stalk2' })
      s.limb(30, 18, 1.6, 32, 8, 1.3, teal, { g: 'stalk1' })
      rainbowEye(s, p, 23.5, 7, 3, 4, 'eye2', icon)
      rainbowEye(s, p, 32.5, 6, 3.2, 4.2, 'eye1', icon)
      s.ellipse(28.5, 21, 7.5, 5.5, teal, { g: 'head' })
      for (const [x, y, tx, ty] of [
        [30, 17, 36, 12],
        [33, 18, 40, 15],
        [35, 20, 41, 20],
      ] as const)
        s.limb(x, y, 1.6, tx, ty, 0.5, green, { g: 'crest' })
    }
    const fists = (far: boolean) => {
      if (far) {
        s.limb(30, 30, 2.8, 24, 23, 2.4, orange, { g: 'arm2', under: true })
        s.squircle(18, 19, 6, 5.5, 2.6, club, { g: 'club2', under: true, rot: -20 })
      } else {
        s.limb(33, 36, 3.2, 24, 38, 2.8, orange, { g: 'arm1' })
        s.limb(24, 38, 2.8, 17, 33, 2.6, teal, { g: 'arm1b' })
        s.squircle(12, 31, 7.5, 7, 2.6, club, { g: 'club1', rot: -15 })
        if (!icon) {
          s.shadeLine(8, 30, 10, 36, 1)
          s.shadeLine(12, 27, 15, 35, 1)
        }
      }
    }
    if (back) {
      head()
      fists(false)
      tailFan()
      body()
      legs()
      fists(true)
      return
    }
    fists(true)
    tailFan()
    legs()
    body()
    head()
    fists(false)
    if (!icon) s.pxs([22, 22, 23, 23, 24, 23], p.c('#105040'))
  },
}

const clionette: Recipe = {
  size: 'S',
  front: { dy: -4 },
  shiny: { hue: 175, minSat: 0.02, sat: 1.4 },
  draw(s, p) {
    const glass = p.ramp3('#ffffff', '#e4f4fc', '#c8e8f8', { deepC: '#a0c8e4', lineC: '#88b0d0', outC: '#5880a8' })
    const core = p.glow('#fff0d0', '#ffb070', '#f07050', '#a04030')
    const back = s.back
    const icon = s.icon

    const flaps = (near: boolean) =>
      near
        ? s.leaf(26, 37, 16, 33, 6.5, glass, { g: 'fl1' }, -2)
        : s.leaf(36, 36, 45, 31, 6, glass, { g: 'fl2', under: true }, 2)
    const body = () => {
      s.poly(teardrop(31, 40, 6.5, 0.15, 1, 2.6), glass, { g: 'body', bevel: 4 })
      s.circle(30.5, 27, 8, glass, { g: 'head' })
      s.poly(teardrop(29, 20.5, 2.4, -0.3, -1, 1.8), core, { paint: true, onto: ['head'], flat: 2 })
    }
    const heart = () => {
      if (back) return
      puff(s, [[29.5, 39.5, 2.3], [32.5, 39.5, 2.3]], core, { g: 'heart', line: false, flat: 2 })
      s.poly([[27.3, 40.3], [34.7, 40.3], [31, 44.8]], core, { g: 'heart', line: false, flat: 2 })
      s.ellipse(30.5, 40.5, 1.6, 1.3, core, { paint: true, onto: ['heart'], flat: 1 })
      s.dot(29, 39, core, 0)
    }
    flaps(false)
    body()
    heart()
    flaps(true)
    if (back || icon) {
      if (icon) {
        iconEye(s, p, 26, 27, 'slit', { p: '#6080a8' })
        iconEye(s, p, 31.5, 27, 'slit', { p: '#6080a8' })
      }
      return
    }
    s.stamp(p.stamp(['.oo.', 'o..o'], { o: '#6080a8' }), 24, 26)
    s.stamp(p.stamp(['.o.', 'o.o'], { o: '#6080a8' }), 30, 26)
    s.pxs([27, 31, 28, 32, 29, 32, 30, 31], p.c('#c07070'))
    s.pxs([23, 29, 24, 29, 32, 29], p.c('#ffc8c0'))
  },
}

const serafin: Recipe = {
  size: 'M',
  front: { k: 0.92, dy: -3 },
  shiny: { hue: 175, minSat: 0.02, sat: 1.4 },
  draw(s, p) {
    const glass = p.ramp3('#ffffff', '#e8f6fe', '#d0ecfc', { deepC: '#a8cce8', lineC: '#90b8e0', outC: '#5a80b0' })
    const core = p.glow('#fff8e0', '#ffd080', '#ff8850', '#a85020')
    const halo = p.glow('#fffce8', '#ffe8a0', '#ffc860', '#b07820')
    const back = s.back
    const icon = s.icon

    const wings = (near: boolean) => {
      if (near) {
        s.leaf(27, 30, 9, 20, 8, glass, { g: 'w1' }, -3)
        s.leaf(28, 40, 13, 45, 6.5, glass, { g: 'w3' }, 2)
      } else {
        s.leaf(36, 29, 54, 18, 8, glass, { g: 'w2', under: true }, 3)
        s.leaf(35, 40, 50, 46, 6.5, glass, { g: 'w4', under: true }, -2)
      }
    }
    const body = () => {
      s.tube([[31, 34, 6.5], [32, 44, 5.5], [34, 51, 3.5], [38, 56, 2], [43, 58, 1.2], [47, 56, 0.8]], glass, { g: 'body' })
      s.circle(31, 21, 8.5, glass, { g: 'head' })
    }
    const coreOrb = () => {
      if (back) return
      s.circle(31.5, 36, 3.8, core, { g: 'core', line: false, flat: 2 })
      s.circle(31, 35.4, 2, core, { paint: true, onto: ['core'], flat: 1 })
      s.dot(30, 34, core, 0)
    }
    const ring = () => s.ring(31, 7.5, 8, 2.4, 1.2, halo, { g: 'halo', flat: 1 })
    wings(false)
    body()
    coreOrb()
    wings(true)
    ring()
    if (back || icon) {
      if (icon) {
        iconEye(s, p, 27, 21, 'glow', { i: '#f8b048' })
        iconEye(s, p, 33, 21, 'glow', { i: '#f8b048' })
      }
      return
    }
    const ec = { o: '#5a80b0', i: '#ffd080', h: '#ffffff' }
    s.stamp(p.stamp(['.oo.', 'ohio', '.oo.'], ec), 25, 19.5)
    s.stamp(p.stamp(['.o.', 'ohi', '.o.'], ec), 31.5, 19.5)
    s.pxs([28, 25, 29, 25.5, 30, 25], p.c('#b88080'))
  },
}

export const REEF_LINE = { spinefin, lionspire, jabshrimp, clobberclaw, clionette, serafin } satisfies Partial<Record<SpeciesId, Recipe>>
