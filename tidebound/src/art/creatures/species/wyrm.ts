/**
 * DRIFTWYRM → TEMPESTWYRM (sea and sky dragons) and ATOLLUS (the legendary
 * island turtle).
 */
import type { SpeciesId } from '../../../data/dex'
import type { Canvas, P2, P3 } from '../canvas'
import type { Ramp } from '../color'
import { eye, iconEye, type Recipe } from '../kit'
import { puff, samplePath, zigzag } from '../parts'

/** Paints one side of a tube body (belly or back) with another ramp. */
function side(s: Canvas, spine: readonly P3[], r: Ramp, onto: string, sgn: number, from: number, to: number): void {
  const path = samplePath(spine, 1)
  const a: P2[] = []
  const b: P2[] = []
  for (const [x, y, rad, tx, ty] of path) {
    const nx = -ty * sgn
    const ny = tx * sgn
    a.push([x + nx * rad * from, y + ny * rad * from])
    b.push([x + nx * rad * to, y + ny * rad * to])
  }
  s.poly([...a, ...b.reverse()], r, { paint: true, onto: [onto] })
}

/** Ridge lines across a tube (belly rings, scale bands). */
function rings(s: Canvas, spine: readonly P3[], every: number, sgn: number, from: number, to: number, d = 1): void {
  for (const [x, y, rad, tx, ty] of samplePath(spine, every)) {
    const nx = -ty * sgn
    const ny = tx * sgn
    s.shadeLine(x + nx * rad * from, y + ny * rad * from, x + nx * rad * to, y + ny * rad * to, d)
  }
}

/** A kelp frond: wavy leaf with a gold tip. */
function kelp(s: Canvas, x: number, y: number, tx: number, ty: number, w: number, leafR: Ramp, gold: Ramp, g: string, bend: number): void {
  s.leaf(x, y, tx, ty, w, leafR, { g }, bend)
  s.circle(tx - (tx - x) * 0.1, ty - (ty - y) * 0.1, w * 0.3, gold, { paint: true, onto: [g], flat: 1 })
}

const driftwyrm: Recipe = {
  size: 'M',
  front: { k: 0.9, dy: -2 },
  shiny: { hue: -130, sat: 0.95, band: [150, 290] },
  draw(s, p) {
    const violet = p.ramp3('#8a6ad0', '#6848b8', '#4c3094', { deepC: '#302068' })
    const teal = p.ramp3('#90f0d0', '#58c8b4', '#40a8a0', { deepC: '#2c7c7c' })
    const kelpR = p.ramp3('#d0e080', '#a8c048', '#708828')
    const gold = p.ramp3('#fff0a0', '#f0c848', '#c09020')
    const back = s.back
    const icon = s.icon
    const spine: P3[] = [
      [23, 19, 4.2],
      [29.5, 25, 5],
      [31, 33, 6.4],
      [27.5, 41, 6.6],
      [26.5, 49, 5],
      [30.5, 55.5, 3.5],
      [37, 57, 2.6],
      [40.5, 53, 1.9],
      [37.5, 50, 1.4],
    ]
    const fronds = () => {
      kelp(s, 25, 13, 30, 3, 4.5, kelpR, gold, 'k1', 1.5)
      kelp(s, 27, 15, 37, 9, 4.2, kelpR, gold, 'k2', -1.5)
      kelp(s, 34, 27, 44, 22, 5, kelpR, gold, 'k3', 1.5)
      kelp(s, 36, 35, 47, 34, 5, kelpR, gold, 'k4', -1.5)
      kelp(s, 32, 44, 42, 46, 4.6, kelpR, gold, 'k5', 1.5)
      kelp(s, 38, 55, 46, 60, 3.8, kelpR, gold, 'k6', -1)
    }
    const body = () => {
      s.tube(spine, violet, { g: 'body' })
      if (!back) {
        side(s, spine.slice(0, 6), teal, 'body', 1, 0.1, 1.4)
        if (!icon) rings(s, spine.slice(1, 6), 2.6, 1, 0.2, 1.1)
      }
    }
    const head = () => {
      s.limb(20, 19, 2.2, 8, 22, 1.5, violet, { g: 'snout' })
      s.circle(7.5, 22, 1.8, violet, { g: 'snout' })
      s.ellipse(22, 16, 6, 5.5, violet, { g: 'head' })
      if (!back) s.ellipse(20, 18.5, 4, 3, teal, { paint: true, onto: ['head'] })
    }
    const fins = () => {
      s.poly([[33, 29], [38, 26], [40, 31], [35, 34]], gold, { g: 'dfin', bevel: 1 })
      if (!back) s.leaf(25, 27, 19, 30, 3.6, gold, { g: 'pfin' }, 0.6)
    }
    if (back) {
      head()
      body()
      fins()
      fronds()
      return
    }
    fronds()
    body()
    fins()
    head()
    if (icon) {
      iconEye(s, p, 21, 15, 'iris', { i: '#40c8b0', p: '#101830' })
      return
    }
    eye(s, p, 'iris56', 18.5, 12, { i: '#40c8b0', o: '#201840', p: '#101830' })
    s.px(9, 23, p.c('#302068'))
  },
}

const tempestwyrm: Recipe = {
  size: 'L',
  front: { k: 0.93 },
  shiny: { hue: -130, sat: 0.95, band: [200, 300] },
  draw(s, p) {
    const scale = p.ramp3('#8870f0', '#5c48c8', '#3c2c98', { deepC: '#241860' })
    const belly = p.ramp3('#fff4c8', '#f8e098', '#d0b068')
    const frill = p.ramp3('#a898f8', '#7c68e0', '#5040b0', { deepC: '#382c88' })
    const cloud = p.ramp3('#f4f6fc', '#d0d4e0', '#a0a4b8', { deepC: '#7c8098', outC: '#484c68' })
    const bolt = p.glow('#ffffff', '#f8e040', '#e0b020', '#806010')
    const horn = p.ramp3('#fff8e0', '#e8dcc0', '#b0a080')
    const back = s.back
    const icon = s.icon
    const spine: P3[] = [
      [18, 17, 5],
      [28, 20, 5.2],
      [41, 22, 5.6],
      [50, 30, 5.8],
      [47, 41, 5.8],
      [36, 45, 5.6],
      [26, 49, 5.2],
      [28, 57, 4.4],
      [40, 59, 3.4],
      [52, 57, 2.4],
      [60, 51, 1.3],
    ]
    const wings = () => {
      s.poly([[40, 23], [50, 8], [62, 4], [60, 12], [63, 17], [57, 22], [58, 28], [50, 29]], frill, { g: 'fw1', bevel: 2, under: true })
      s.poly([[30, 47], [18, 40], [8, 42], [12, 47], [6, 51], [14, 53], [26, 53]], frill, { g: 'fw2', bevel: 2, under: true })
      if (!icon) {
        s.shadeLine(44, 23, 56, 10, 1)
        s.shadeLine(47, 26, 60, 18, 1)
        s.shadeLine(27, 48, 13, 45, 1)
        s.shadeLine(25, 51, 11, 51, 1)
      }
    }
    const body = () => {
      s.tube(spine, scale, { g: 'body' })
      if (!back) {
        side(s, spine, belly, 'body', 1, 0.3, 1.4)
        if (!icon) rings(s, spine.slice(1), 3, 1, 0.35, 1.1)
      } else if (!icon) {
        // A row of dorsal scales down the spine instead of the belly.
        rings(s, spine.slice(1), 3, -1, -0.4, 0.4, -1)
      }
    }
    const mane = () => {
      puff(s, [[24, 12, 4], [30, 13, 4.2], [36, 15, 3.8], [41, 17, 3.2], [45, 20, 2.6], [20, 9, 3]], cloud, { g: 'mane' })
      if (!icon)
        for (const [x1, y1, x2, y2] of [
          [27, 10, 29, 15],
          [37, 13, 38, 17],
        ]) {
          const z = zigzag(x1, y1, x2, y2, 2, 1)
          for (let i = 1; i < z.length; i++) s.limb(z[i - 1][0], z[i - 1][1], 0.6, z[i][0], z[i][1], 0.6, bolt, { g: `bz${x1}`, flat: 2, onto: ['mane'] })
        }
    }
    const head = () => {
      s.tube([[17, 11, 1.6], [24, 5, 1.3], [31, 3, 0.7]], horn, { g: 'horn2' })
      s.ellipse(15, 17, 7, 5.5, scale, { g: 'head' })
      s.limb(12, 18, 4, 3, 20, 2.6, scale, { g: 'head' })
      if (!back) s.poly([[3, 21], [14, 20.5], [16, 23], [5, 23]], belly, { paint: true, onto: ['head'] })
      s.tube([[19, 13, 1.8], [26, 8, 1.5], [34, 7, 0.8]], horn, { g: 'horn1' })
    }
    if (back) {
      head()
      wings()
      body()
      mane()
      return
    }
    wings()
    body()
    mane()
    head()
    if (icon) {
      iconEye(s, p, 13.5, 15.5, 'glow', { i: '#f8d040' })
      return
    }
    s.stamp(p.stamp(['oooo.', 'ohiio', '.ooo.'], { o: '#100828', i: '#f8d040', h: '#ffffff' }), 11, 14)
    s.pxs([3, 19, 4, 19], p.c('#100828'))
  },
}

const atollus: Recipe = {
  size: 'L',
  front: { k: 0.95 },
  shiny: { map: { '#40d0d0': '#f0a0e0', '#a0fff8': '#ffd8f8', '#28a0b0': '#c070b8', '#788890': '#9c9080', '#56646c': '#746858', '#404c58': '#584c40', '#f89898': '#98d8f8' } },
  draw(s, p) {
    const stone = p.ramp3('#a8b4bc', '#788890', '#56646c', { deepC: '#404c58' })
    const shellSide = p.ramp3('#94a2a8', '#6c7c84', '#4c5a64', { deepC: '#384450' })
    const scute = p.ramp3('#a4b0b4', '#808e94', '#5c6a72', { deepC: '#44525c' })
    const sand = p.ramp3('#fff8d8', '#f8e8b0', '#d8c088', { deepC: '#b89c68' })
    const lagoon = p.ramp3('#c0fff8', '#40d0d0', '#28a0b0')
    const coralP = p.ramp3('#ffc8c8', '#f89898', '#c86070', { lineC: '#a04858' })
    const coralO = p.ramp3('#ffd8a0', '#f8a860', '#c87030', { lineC: '#a05828' })
    const coralW = p.ramp3('#ffffff', '#f4f0e4', '#c8c0b0', { lineC: '#9c9488' })
    const teal = p.ramp('#40c0b0')
    const palm = p.ramp3('#98e070', '#58b048', '#347c30')
    const trunk = p.ramp3('#c8a070', '#a07848', '#6c4c28')
    const foam = p.ramp3('#ffffff', '#e0f4ff', '#a8d4f0', { outC: '#3870b0', lineC: '#78b0e0' })
    const sea = p.ramp3('#78c0f8', '#4890f0', '#2c68c0', { outC: '#183c7c' })
    const barn = p.ramp('#e8e8e0', { sh: 0.2 })
    const back = s.back
    const icon = s.icon

    const water = () => {
      s.ellipse(34, 58.5, 30, 4.4, sea, { g: 'sea', line: false, flat: 1 })
      s.ellipse(34, 57.8, 28, 2.8, sea, { paint: true, onto: ['sea'], flat: 0 })
      s.poly(
        [[5, 57], [9, 53.5], [13, 56], [18, 53], [23, 56], [29, 53.5], [35, 56], [41, 53], [47, 56], [53, 53.5], [58, 56], [62, 57.5], [56, 59], [11, 59]],
        foam,
        { g: 'foam', line: false },
      )
      s.poly([[0, 59.5], [64, 59.5], [64, 90], [0, 90]], sea, { cut: true, notOnto: ['sea', 'foam'] })
    }
    const shell = () => {
      s.ellipse(38, 39, 25, 16, shellSide, { g: 'shell' })
      // Marginal scutes around the lower rim of the shell.
      if (!icon)
        for (let i = 0; i < 8; i++) {
          const a = ((200 - i * 22) * Math.PI) / 180
          s.ellipse(38 + Math.cos(a) * 22, 41 - Math.sin(a) * 12.5, 3.4, 2.8, scute, { g: `sc${i}`, blend: 0.35 })
        }
      s.ellipse(38, 31, 21.5, 9.5, sand, { g: 'rim', blend: 0.3 })
      s.ellipse(38.5, 30.5, 13, 5, lagoon, { g: 'lagoon', flat: 1, line: false })
      s.ellipse(36.5, 29.5, 7, 2.2, lagoon, { paint: true, onto: ['lagoon'], flat: 0 })
      if (!icon) {
        s.dot(42, 31, lagoon, 0).dot(43, 31, lagoon, 0).dot(33, 32, lagoon, 0)
        // Coral clusters along the rim of the atoll.
        const cl: [number, number, Ramp][] = [
          [19, 32, coralP],
          [24, 37, coralO],
          [31, 39.5, coralW],
          [39, 40.5, coralP],
          [47, 39.5, coralO],
          [54, 36.5, coralW],
          [58, 31, coralP],
          [22, 26.5, coralW],
          [29, 23.5, coralO],
          [52, 24.5, coralP],
        ]
        cl.forEach(([x, y, c], i) => {
          s.circle(x, y, 1.9, c, { g: `co${i}`, ln: 'soft' })
          s.circle(x - 1.8, y + 0.8, 1.5, c, { g: `co${i}` })
          s.circle(x + 1.7, y + 0.6, 1.4, c, { g: `co${i}` })
          s.circle(x + 0.2, y - 1.6, 1.2, c, { g: `co${i}` })
        })
        for (const [x, y] of [
          [27, 47],
          [46, 50],
          [55, 45],
          [20, 44],
        ])
          s.circle(x, y, 1.2, barn, { g: `bn${x}` })
      }
    }
    const tree = () => {
      s.tube([[45, 29, 1.6], [46.5, 22, 1.3], [45.5, 14.5, 1.1]], trunk, { g: 'trunk' })
      if (!icon) for (const y of [18, 22, 26]) s.shadeLine(45, y, 47, y - 0.5, 1)
      for (const [tx, ty, b] of [
        [36.5, 15.5, -1.5],
        [38.5, 10, 1.5],
        [47, 7.5, 1.5],
        [53, 12.5, 1.5],
        [51.5, 19, -1.5],
      ] as const)
        s.leaf(45.5, 14, tx, ty, 4.2, palm, { g: `pl${tx}` }, b)
      s.circle(46, 15.2, 1.3, trunk, { g: 'nut' })
    }
    const head = () => {
      s.tube([[24, 43, 6.8], [17, 41, 6.4], [11, 38.5, 6]], stone, { g: 'neck' })
      s.ellipse(10.5, 35, 8.2, 7, stone, { g: 'head' })
      // Hooked beak and a heavy brow.
      s.poly([[2.5, 36], [5, 39.5], [9, 41], [4, 42]], stone, { g: 'beak', bevel: 1.2 })
      s.limb(6, 30.5, 1.8, 14, 29.5, 1.6, stone, { g: 'brow' })
      if (!icon) {
        s.shadeLine(3.5, 38.5, 8, 40, 1)
        s.tube([[12, 33, 0.9], [15, 32, 0.8], [17, 34, 0.6]], teal, { paint: true, onto: ['head'] })
        s.tube([[14, 38, 0.9], [17, 37, 0.8]], teal, { paint: true, onto: ['head'] })
        s.tube([[19, 40, 0.9], [22, 39.5, 0.8], [24, 41.5, 0.7]], teal, { paint: true, onto: ['neck'] })
        s.circle(21, 46, 1.1, barn, { g: 'bnn' })
      }
    }
    const flipper = (near: boolean) =>
      near
        ? s.leaf(24, 48, 5, 58.5, 8.5, stone, { g: 'fl1' }, 2.2)
        : s.leaf(57, 44, 63.5, 52, 6, stone, { g: 'fl2', under: true }, -1)
    if (back) {
      head()
      flipper(false)
      shell()
      tree()
      flipper(true)
      water()
      return
    }
    flipper(false)
    shell()
    tree()
    head()
    flipper(true)
    if (!icon) s.tube([[20, 51, 0.8], [13, 55, 0.7], [8, 57, 0.6]], teal, { paint: true, onto: ['fl1'] })
    water()
    if (icon) {
      iconEye(s, p, 7, 33.5, 'glow', { i: '#60f0e0' })
      return
    }
    s.stamp(p.stamp(['oooo.', 'ohiio', '.oooo'], { o: '#203038', i: '#60f0e0', h: '#ffffff' }), 5, 32)
    s.pxs([3, 40.5, 4, 41, 5, 41, 6, 41.5], p.c('#303c48'))
  },
}

export const WYRM_LINE = { driftwyrm, tempestwyrm, atollus } satisfies Partial<Record<SpeciesId, Recipe>>
