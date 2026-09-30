/**
 * LEAFOLIN → FRONDOLIN → CANOPANGOL: the leaf pangolin starter line.
 */
import type { SpeciesId } from '../../../data/dex'
import { eye, iconEye, type Recipe } from '../kit'
import { scaleRows, scales, spiral } from '../parts'

const inEll = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

const leafolin: Recipe = {
  size: 'S',
  front: { k: 0.86 },
  shiny: { hue: -62, sat: 1.05, band: [60, 180] },
  draw(s, p) {
    const green = p.ramp3('#b8f070', '#68c040', '#2f8030')
    const rim = p.ramp3('#f4ffd8', '#d4f8a0', '#98d068')
    const cream = p.ramp('#f4e8c8', { sh: 0.12, deep: 0.26 })
    const leaf = p.ramp3('#e0ffa0', '#a8e060', '#68a838', { deepC: '#3c7c28' })
    const icon = s.icon
    const back = s.back
    const so = { tip: 1.15 }

    const tail = () => {
      s.tube([[38, 57, 4.6], [47, 57, 4.3], [53, 52, 3.8], [55, 45, 3.3], [53, 39, 2.8], [48.5, 36.5, 2.3]], green, { g: 'tail' })
      scales(s, 'ts', [[47.5, 56, 3.4], [52.5, 51, 3.2], [54.2, 45, 2.9], [52.5, 40, 2.5]], -0.1, 1, green, rim, { blend: 0.4, ...so })
    }
    const tailLeaf = () => {
      s.limb(48.5, 36.5, 1, 47, 34.5, 0.8, leaf, { g: 'tleaf' })
      s.leaf(47.5, 35, 39.5, 27.5, 8.5, leaf, { g: 'tleaf' }, -1.4)
      if (!icon) s.shadeLine(46.5, 34, 41.5, 29.5, 1)
    }
    const head = () => {
      s.circle(22, 30, 11, green, { g: 'head' })
      if (back) s.ellipse(12.5, 35, 3.4, 2.7, cream, { g: 'snout', under: true })
      else {
        s.ellipse(17.5, 34, 9.5, 8, cream, { paint: true, onto: ['head'] })
        s.ellipse(11.5, 35.5, 3.6, 2.9, cream, { g: 'snout' })
      }
      if (back) scaleRows(s, 'hs', 13, 36, [9, 14, 19], -110, 40, 6, 4, ['head'], green, rim, so)
      else scales(s, 'hs', [[31, 32, 3.8], [30, 25.5, 4], [25, 21.5, 4], [19, 21.5, 3.6]], 0.85, 0.5, green, rim, so)
    }
    const body = () => {
      s.ellipse(33, 47, 12, 12.5, green, { g: 'body' })
      if (!back) s.ellipse(26.5, 49.5, 7.5, 10.5, cream, { paint: true, onto: ['body'] })
      scaleRows(s, 'bs', 25, 38, back ? [6, 11.5, 17, 22.5] : [11.5, 17, 22.5], -60, 95, 6.6, 4.4, ['body'], green, rim, {
          ...so,
          skip: (x, y) => !back && inEll(x, y, 26.5, 49.5, 8, 11),
        })
    }

    if (back) {
      head()
      body()
      s.ellipse(25, 59, 5, 2.6, cream, { g: 'foot1', under: true })
      tail()
      tailLeaf()
      return
    }

    tail()
    body()
    tailLeaf()
    s.ellipse(38, 59.5, 4.4, 2.3, cream, { g: 'foot2', under: true })
    s.ellipse(25, 58.5, 5, 2.6, cream, { g: 'foot1' })
    head()
    // Stubby forepaws held up in front of the chest.
    s.ellipse(25, 45.5, 2.6, 2.2, cream, { g: 'paw2', ln: 'soft' })
    s.ellipse(21, 45, 3, 2.4, cream, { g: 'paw1' })
    if (icon) {
      iconEye(s, p, 16.5, 29.5, 'dark')
      s.pxs([8, 34], p.c('#e07080'))
      return
    }
    s.stamp(p.stamp(['.oo.', 'ohno', 'onno', '.oo.'], { o: '#a84858', n: '#f09098', h: '#ffd8d8' }), 6.5, 32.5)
    eye(s, p, 'round45', 14.5, 27)
    s.line(10, 38, 12, 38, p.c('#a07060'))
    s.pxs([20, 35, 21, 35], p.c('#f8a8a0'))
    s.pxs([18, 45, 18, 46], p.c('#b09880'))
  },
}

const frondolin: Recipe = {
  size: 'M',
  front: { k: 0.88 },
  shiny: { hue: -45, sat: 1.1, band: [60, 170] },
  draw(s, p) {
    const green = p.ramp3('#78c850', '#48a038', '#206828')
    const rim = p.ramp3('#c8f098', '#98e060', '#58a838')
    const cream = p.ramp('#f0e0c0', { sh: 0.13, deep: 0.27 })
    const claw = p.ramp3('#e0f8c0', '#a0d880', '#60a048')
    const back = s.back
    const icon = s.icon
    const fo = { tip: 1.9, midrib: true }

    const tail = () => {
      s.tube([[36, 48, 4.4], [45, 53, 3.8], [53, 52, 3], [58.5, 46, 2.2], [60.5, 38, 1.3]], green, { g: 'tail' })
      scales(s, 'ts', [[57.5, 44, 2.2], [54.5, 50, 2.7], [48.5, 52.5, 3.1], [42, 51, 3.3]], 1, -0.35, green, rim, { ...fo, blend: 0.4 })
    }
    const crest = () => {
      // Three curled fern fiddleheads.
      const heads: [number, number, number, number][] = [
        [23, 12.5, 21.5, 5],
        [27, 12, 28, 3.5],
        [30.5, 14, 34, 8],
      ]
      heads.forEach(([bx, by, tx, ty], i) => {
        s.limb(bx, by, 1.5, tx, ty + 2, 1.1, green, { g: `fh${i}` })
        s.tube(spiral(tx + 2.2, ty + 2, 2.6, 1.2, 180, 490, 1.05, 0.8, 16), rim, { g: `fh${i}` })
      })
    }
    const head = () => {
      crest()
      s.ellipse(25, 18, 7.5, 6.5, green, { g: 'head' })
      if (!back) s.ellipse(20.5, 20, 7, 5.2, cream, { paint: true, onto: ['head'] })
      s.limb(20, 20.5, 4, 12, 23, 2.1, back ? green : cream, { g: 'snout', under: back })
      scales(s, 'hs', [[31, 20, 3.2], [30, 15, 3.4], [26, 12.5, 3.2]], 1, 0.2, green, rim, fo)
    }
    const nearLeg = () => {
      s.ellipse(29, 47, 4.5, 6.5, green, { g: 'thigh1', rot: 25 })
      s.limb(27, 51, 2.7, 24, 57.5, 2.2, cream, { g: 'shin1' })
      s.ellipse(21.5, 59, 4.2, 1.8, cream, { g: 'foot1' })
    }
    const farLeg = () => {
      s.limb(38, 50, 2.6, 41, 57.5, 2.1, cream, { g: 'shin2', under: true })
      s.ellipse(43, 59, 3.8, 1.7, cream, { g: 'foot2', under: true })
      s.ellipse(37, 46, 4.3, 6.2, green, { g: 'thigh2', rot: -15, under: true })
    }
    const torso = () => {
      s.ellipse(33, 36, 8.5, 12.5, green, { g: 'torso', rot: -12 })
      if (!back) s.ellipse(28.5, 38, 4.8, 11, cream, { paint: true, onto: ['torso'], rot: -12 })
      scaleRows(s, 'bs', 21, 22, back ? [8, 14, 20, 26] : [14, 20, 26], -40, 90, 6.8, 4.3, ['torso'], green, rim, {
        ...fo,
        tip: 1.7,
        skip: (x, y) => !back && x < 31 - (y - 36) * 0.2,
      })
    }
    const claws = (wx: number, wy: number, a: number, len: number) => {
      for (const d of [-22, 0, 22]) {
        const t = ((a + d) * Math.PI) / 180
        s.limb(wx, wy, 1.3, wx + Math.cos(t) * len, wy + Math.sin(t) * len, 0.5, claw, { g: `cl${wx}${d}` })
      }
    }
    const farArm = () => {
      s.limb(33, 27, 2.6, 29, 32, 2.3, cream, { g: 'farup', under: true })
      s.limb(29, 32, 2.3, 21, 27, 2, cream, { g: 'farlo', under: true })
      claws(20.5, 26.5, 205, 6)
    }
    const nearArm = () => {
      s.limb(31, 28.5, 3, 27, 37, 2.7, green, { g: 'upper' })
      s.limb(27, 37, 2.7, 17.5, 34, 2.3, cream, { g: 'fore' })
      claws(16.5, 33.5, 190, 7)
    }

    if (back) {
      farArm()
      head()
      farLeg()
      nearArm()
      torso()
      nearLeg()
      tail()
      return
    }
    tail()
    farLeg()
    farArm()
    torso()
    nearLeg()
    head()
    nearArm()
    if (icon) {
      iconEye(s, p, 19.5, 17.5, 'iris', { i: '#d88828', p: '#3c2418' })
      return
    }
    s.stamp(p.stamp(['ooooo', 'ohiio', '.ooo.'], { o: '#3c2418', i: '#d88828', h: '#fff4d0' }), 17, 16)
    s.px(11, 22, p.c('#c86070')).px(12, 22, p.c('#e08890'))
    s.line(14, 25, 17, 25, p.c('#907058'))
  },
}

const canopangol: Recipe = {
  size: 'L',
  front: { k: 0.92 },
  shiny: { hue: -48, sat: 1.1, band: [60, 170] },
  draw(s, p) {
    const plate = p.ramp3('#58a040', '#3c8830', '#1c5020')
    const rim = p.ramp3('#a8d878', '#80c050', '#4c8c38')
    const moss = p.ramp3('#b8e070', '#90c050', '#5c9030')
    const canopy = p.ramp3('#a8e068', '#70b848', '#347830')
    const brown = p.ramp3('#c09058', '#a07040', '#5c3c20')
    const cream = p.ramp('#f0dcb0', { sh: 0.14, deep: 0.28 })
    const bone = p.ramp3('#fffae8', '#e8dcc0', '#b0a080')
    const back = s.back
    const icon = s.icon

    const bigClaws = (x: number, y: number, dir: number) => {
      for (const [dx, dy] of [
        [0, 0],
        [1.5, 1.6],
        [3, 3],
      ] as const)
        s.limb(x + dx, y + dy - 2, 1.4, x + dx - 4.5 * dir, y + dy + 0.5, 0.5, bone, { g: `bc${x}${dx}` })
    }
    const tail = () => {
      s.tube([[48, 42, 7], [56, 48, 5.5], [60, 54, 4], [58, 59.5, 2.4], [53, 60.5, 1.5]], plate, { g: 'tail' })
      scales(s, 'ts', [[57.5, 55, 3.4], [57, 49.5, 4.2], [52.5, 45, 5]], 0.4, 1, plate, rim, { tip: 1.5, blend: 0.4 })
    }
    const legs = () => {
      s.limb(24, 50, 4.2, 23, 58, 3.6, brown, { g: 'fl2', under: true })
      s.ellipse(21, 59, 4.5, 2.2, brown, { g: 'fp2', under: true })
      s.limb(47, 50, 4.2, 49, 58, 3.6, brown, { g: 'hl2', under: true })
      s.ellipse(50, 59, 4.4, 2.2, brown, { g: 'hp2', under: true })
    }
    const body = () => {
      s.ellipse(35, 41, 21, 14, plate, { g: 'body' })
      if (!back) s.ellipse(32, 52, 19, 6, brown, { paint: true, onto: ['body'] })
      scaleRows(s, 'bp', 12, 42, back ? [7, 13, 19, 25, 31] : [13, 19, 25, 31], -85, 40, 7.6, 5.4, ['body'], plate, rim, {
          tip: 1.45,
          skip: (_x, y) => !back && y > 48,
        })
      // Moss patches on a few plates.
      if (!icon)
        for (const [x, y, rx, ry] of [
          [29, 32, 2.6, 1.6],
          [45, 35, 2.8, 1.6],
          [24, 40, 2.2, 1.4],
          [38, 44, 2.4, 1.5],
          [51, 41, 2, 1.4],
        ] as const)
          s.ellipse(x, y, rx, ry, moss, { paint: true, notOnto: ['body'], flat: 1 })
    }
    const canopyTree = () => {
      s.limb(36, 30, 2.4, 36.5, 20, 1.8, brown, { g: 'trunk' })
      s.limb(36.5, 24, 1.3, 41, 19, 1, brown, { g: 'trunk' })
      const clumps: [number, number, number][] = [
        [29.5, 22, 5],
        [43.5, 20.5, 5.2],
        [33, 15, 5.8],
        [40.5, 13.5, 5.3],
        [36.5, 20, 5],
      ]
      clumps.forEach(([x, y, r], i) => s.circle(x, y, r, canopy, { g: `cc${i}` }))
      if (!icon)
        for (const [x, y] of [
          [31, 13],
          [38, 11],
          [27, 20],
          [41, 18],
        ])
          s.shadePx(x, y, -1).shadePx(x + 1, y, -1)
    }
    const head = () => {
      s.ellipse(14, 41.5, 9.5, 8, plate, { g: 'head' })
      if (!back) s.ellipse(10, 46, 8.5, 6.5, cream, { paint: true, onto: ['head'] })
      s.limb(7, 47, 4.2, 2, 51, 2.6, back ? plate : cream, { g: 'snout', under: back })
      scales(s, 'hs', [[21, 38, 4.4], [17, 35, 4.2], [12, 35, 3.6]], 0.9, -0.35, plate, rim, { tip: 1.4 })
    }
    const nearLegs = () => {
      s.tube([[22, 46, 5.6], [19.5, 52, 4.7], [18, 56.5, 4.3]], brown, { g: 'fl1', lift: -0.08 })
      s.ellipse(15.5, 58.5, 6, 2.6, brown, { g: 'fp1' })
      s.tube([[45, 46, 6.2], [46.5, 52, 5.1], [46.5, 56.5, 4.5]], brown, { g: 'hl1', lift: -0.08 })
      s.ellipse(46.5, 58.5, 5.5, 2.6, brown, { g: 'hp1' })
      if (!icon) {
        s.shadeLine(21, 50, 22, 53, 1)
        s.shadeLine(46, 50, 47, 53, 1)
      }
    }

    if (back) {
      head()
      legs()
      body()
      nearLegs()
      canopyTree()
      tail()
      return
    }
    tail()
    legs()
    body()
    canopyTree()
    nearLegs()
    head()
    if (!icon) {
      bigClaws(12, 58, 1)
      bigClaws(43, 58, 1)
    }
    if (icon) {
      iconEye(s, p, 10, 41.5, 'glow', { i: '#f8b020' })
      return
    }
    s.stamp(p.stamp(['ooooo.', '.ohiio', '..ooo.'], { o: '#2a1c10', i: '#f8b020', h: '#fff8c0' }), 7, 40)
    s.px(1, 51, p.c('#402818')).px(2, 51, p.c('#402818'))
  },
}

export const LEAFOLIN_LINE = { leafolin, frondolin, canopangol } satisfies Partial<Record<SpeciesId, Recipe>>
