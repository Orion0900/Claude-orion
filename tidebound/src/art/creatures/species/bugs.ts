/**
 * TWIGLING → TIMBERWALK (stick insects) and LUMIGRUB → LANTERWING (glow bugs).
 */
import type { SpeciesId } from '../../../data/dex'
import type { Canvas, P3 } from '../canvas'
import type { Ramp } from '../color'
import { eye, iconEye, type Recipe } from '../kit'
import { puff, zigzag } from '../parts'

/** A thin jointed leg: hip → knee → foot, with a knob at the knee. */
function leg(s: Canvas, hx: number, hy: number, kx: number, ky: number, fx: number, fy: number, r: number, bark: Ramp, g: string, under = false): void {
  s.limb(hx, hy, r, kx, ky, r * 0.9, bark, { g, under })
  s.limb(kx, ky, r * 0.9, fx, fy, r * 0.7, bark, { g, under })
  s.circle(kx, ky, r * 1.45, bark, { g, under })
}

/** Thin 1px feature drawn in a solid colour after outlining (antennae, whiskers). */
function hair(s: Canvas, pts: readonly (readonly [number, number])[], c: number): void {
  for (let i = 1; i < pts.length; i++) s.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c)
}

const twigling: Recipe = {
  size: 'S',
  front: { k: 0.88 },
  shiny: { hue: 70, sat: 0.9, band: [20, 60] },
  draw(s, p) {
    const bark = p.ramp3('#d8a870', '#c89860', '#906438', { deepC: '#583c20' })
    const bud = p.ramp3('#c8f088', '#88d050', '#4c9030')
    const back = s.back
    const icon = s.icon
    const dark = p.c('#3c2814')

    const legs = (far: boolean) => {
      if (far) {
        leg(s, 27, 46, 24, 50, 22, 59.5, 0.9, bark, 'lf1', true)
        leg(s, 35, 46, 35, 51, 35.5, 59.5, 0.9, bark, 'lf2', true)
        leg(s, 44, 46, 48, 51, 52, 59.5, 0.9, bark, 'lf3', true)
      } else {
        leg(s, 24, 46, 19, 50.5, 16, 59.5, 1, bark, 'ln1')
        leg(s, 32, 46.5, 30, 52, 28.5, 59.5, 1, bark, 'ln2')
        leg(s, 41, 46.5, 44, 52, 46, 59.5, 1, bark, 'ln3')
      }
    }
    const body = () => {
      s.tube([[55, 42, 1.6], [46, 44.5, 2.4], [36, 45.5, 2.8], [27, 44.5, 3.1]], bark, { g: 'body' })
      s.circle(39, 45.2, 3.1, bark, { g: 'body', bias: 1 })
      s.circle(30.5, 45, 3.3, bark, { g: 'body', bias: 1 })
      if (!icon) s.shadeLine(44, 44, 48, 43.5, 1).shadeLine(33, 44, 36, 44, -1)
    }
    const head = () => {
      s.leaf(19.5, 35.5, 16, 29, 3.6, bud, { g: 'bud1' }, 0.6)
      s.leaf(21.5, 36, 26.5, 30.5, 3.4, bud, { g: 'bud2' }, -0.6)
      s.circle(20, 41, 6, bark, { g: 'head' })
    }
    if (back) {
      head()
      legs(false)
      body()
      legs(true)
      hair(s, [[18, 36], [14, 30], [13, 24], [16, 20]], dark)
      hair(s, [[21, 36], [21, 29], [24, 23], [28, 21]], dark)
      return
    }
    legs(true)
    body()
    head()
    legs(false)
    hair(s, [[16, 37], [11, 31], [8, 25], [9, 20]], dark)
    hair(s, [[18, 36], [15, 29], [15, 23], [18, 19]], dark)
    if (icon) {
      iconEye(s, p, 16.5, 40.5, 'dark', { p: '#201810' })
      return
    }
    eye(s, p, 'round45', 14.5, 38, { p: '#201810' })
    eye(s, p, 'bead3', 20.5, 38.5, { p: '#201810' })
    s.pxs([15, 44, 16, 45, 17, 45], p.c('#583c20'))
  },
}

const timberwalk: Recipe = {
  size: 'L',
  front: { k: 0.95 },
  shiny: { hue: 60, sat: 0.9, band: [15, 60] },
  draw(s, p) {
    const bark = p.ramp3('#b89060', '#a88050', '#705030', { deepC: '#402c18' })
    const moss = p.ramp3('#b8e878', '#90d058', '#4c9030')
    const leafR = p.ramp3('#a8e070', '#6cb040', '#3c7c28')
    const back = s.back
    const icon = s.icon
    const dark = p.c('#402c18')

    const legs = (far: boolean) => {
      if (far) {
        leg(s, 38, 40, 31, 47, 29, 60, 1.3, bark, 'lf1', true)
        leg(s, 43, 44, 52, 49, 56, 60, 1.3, bark, 'lf2', true)
      } else {
        leg(s, 36, 40, 26, 46, 21, 60, 1.5, bark, 'ln1')
        leg(s, 41, 45, 47, 51, 46, 60, 1.5, bark, 'ln2')
      }
    }
    const body = () => {
      s.tube([[50, 55, 3], [46, 47, 4.2], [40, 38, 4.6], [35, 30, 4.4], [31, 23, 3.6], [28.5, 18.5, 3]], bark, { g: 'body' })
      s.circle(38, 35, 4.8, bark, { g: 'body', bias: 1, z: -1 })
      if (!icon) {
        for (const [x, y, r] of [
          [44.5, 46, 2.4],
          [42.5, 43.5, 1.8],
          [36.5, 31.5, 2],
          [48, 52, 1.6],
        ] as const)
          s.circle(x, y, r, moss, { g: `moss${x}`, onto: ['body'], blend: 0.5 })
        s.shadeLine(42, 40, 44, 44, 1).shadeLine(33, 26, 34, 29, 1)
      }
    }
    const leaves = () => {
      for (const [x, y, tx, ty, w, b] of [
        [37, 26, 44, 18, 4.4, -1],
        [38, 27, 47, 25, 4, 1],
        [35, 25, 37, 16, 3.8, 1],
      ] as const)
        s.leaf(x, y, tx, ty, w, leafR, { g: `lv${tx}` }, b)
    }
    const head = () => {
      s.ellipse(24, 15, 5.5, 3.6, bark, { g: 'head', rot: 18 })
    }
    const fore = (far: boolean) => {
      const o = far ? 'ff' : 'fn'
      const dx = far ? 5 : 0
      const dy = far ? -1 : 0
      // Femur forward and up, tibia folded back down against it, serrated.
      s.limb(32 + dx, 25 + dy, 2.3, 20 + dx, 23 + dy, 2, bark, { g: `${o}1`, under: far })
      s.limb(20 + dx, 23 + dy, 1.9, 22 + dx, 34 + dy, 1.3, bark, { g: `${o}2`, under: far })
      if (!icon)
        for (const t of [0.25, 0.5, 0.75]) {
          const x = 20 + dx + 2 * t
          const y = 23 + dy + 11 * t
          s.limb(x + 1, y, 0.6, x + 3.2, y - 1, 0.4, bark, { g: `${o}2`, under: far })
        }
    }
    if (back) {
      head()
      fore(false)
      legs(false)
      body()
      leaves()
      legs(true)
      hair(s, [[23, 13], [25, 6], [31, 1]], dark)
      return
    }
    legs(true)
    fore(true)
    body()
    leaves()
    legs(false)
    head()
    fore(false)
    hair(s, [[21, 13], [18, 6], [21, 1], [26, 0]], dark)
    hair(s, [[24, 12], [27, 5], [33, 2]], dark)
    s.stamp(p.stamp(['.gg.', 'ghwg', '.gg.'], { g: '#4c9030', h: '#ffffff', w: '#d0f070' }), 19, 13)
    if (!icon) s.px(19, 17, dark).px(20, 17, dark)
  },
}

const lumigrub: Recipe = {
  size: 'S',
  front: { k: 0.85 },
  shiny: { hue: 170, sat: 0.9, map: { '#a0ffff': '#ffb0f0', '#30c8e8': '#f060c8' } },
  draw(s, p) {
    const grub = p.ramp3('#fffad0', '#fff4b0', '#e8d070', { deepC: '#a88c38' })
    const band = p.ramp3('#f0e098', '#e8d070', '#c0a448', { deepC: '#a88c38' })
    const glowR = p.glow('#f0ffff', '#a0ffff', '#30c8e8', '#10607c')
    const back = s.back
    const icon = s.icon
    const segs: P3[] = [
      [46.5, 42, 4.6],
      [42, 47.5, 5.2],
      [36, 51, 5.8],
      [29.5, 52, 6.2],
      [23, 50, 6.6],
    ]
    const bulb = () => {
      s.circle(50, 36.5, 6, glowR, { g: 'bulb' })
      if (!icon) s.ellipse(48.5, 34.5, 2.4, 2, glowR, { paint: true, onto: ['bulb'], flat: 0 })
    }
    const body = () => {
      segs.forEach(([x, y, r], i) => {
        s.circle(x, y, r, grub, { g: `sg${i}` })
        s.ellipse(x + r * 0.55, y + 0.5, r * 0.35, r * 0.95, band, { paint: true, onto: [`sg${i}`] })
      })
      for (const [x, y] of [
        [22, 57],
        [28, 58],
        [35, 57],
      ])
        s.ellipse(x, y, 1.6, 1.8, grub, { g: `lg${x}`, under: true })
    }
    const head = () => {
      s.circle(15.5, 46, 8, grub, { g: 'head' })
      s.limb(9, 51, 1.2, 6.5, 53, 0.7, p.ramp('#a88c38'), { g: 'mand1' })
      s.limb(11, 52.5, 1.2, 9.5, 55, 0.7, p.ramp('#a88c38'), { g: 'mand2' })
    }
    if (back) {
      head()
      body()
      bulb()
      return
    }
    bulb()
    body()
    head()
    if (icon) {
      iconEye(s, p, 15, 44, 'dark', { p: '#282018' })
      return
    }
    eye(s, p, 'round56', 12.5, 41, { p: '#282018' })
    eye(s, p, 'bead34', 7.5, 42, { p: '#282018' })
    s.pxs([11, 49, 12, 50, 13, 50, 14, 49], p.c('#a88c38'))
    s.pxs([18, 48, 19, 48], p.c('#ffc0a0'))
  },
}

const lanterwing: Recipe = {
  size: 'M',
  front: { k: 0.9, dy: -3 },
  shiny: { hue: 110, sat: 0.9, band: [240, 300] },
  draw(s, p) {
    const wingR = p.ramp3('#a080d0', '#8060b0', '#604090', { deepC: '#483070' })
    const wingR2 = p.ramp3('#8c6cc0', '#6c50a0', '#503680', { deepC: '#3c2860' })
    const blue = p.glow('#c8f4ff', '#48c8f8', '#2890d0', '#183c70')
    const yellow = p.ramp3('#fff8c0', '#f8d040', '#c89820')
    const fuzz = p.ramp3('#fffaf0', '#f0e8d8', '#c8b8a0')
    const lantern = p.glow('#ffffff', '#fff8c0', '#f8d040', '#806010')
    const eyeR = p.ramp3('#686080', '#383048', '#201828')
    const back = s.back
    const icon = s.icon

    const spot = (x: number, y: number, r: number, g: string) => {
      s.ellipse(x, y, r, r * 0.9, blue, { paint: true, onto: [g], flat: 2 })
      s.ellipse(x - r * 0.15, y - r * 0.15, r * 0.6, r * 0.55, blue, { paint: true, onto: [g], flat: 0 })
      s.dot(Math.round(x), Math.round(y), p.ramp('#182848'), 1)
    }
    const zig = (pts: readonly (readonly [number, number])[], g: string) => {
      for (let i = 1; i < pts.length; i++) s.limb(pts[i - 1][0], pts[i - 1][1], 0.9, pts[i][0], pts[i][1], 0.9, yellow, { paint: true, onto: [g] })
    }
    const wings = (far: boolean) => {
      if (far) {
        s.blob([[30, 30], [22, 20], [12, 12], [5, 14], [4, 24], [10, 32], [20, 36]], wingR2, { g: 'wf1', under: true, bevel: 3, bias: 0 })
        s.blob([[32, 38], [22, 42], [14, 48], [16, 54], [26, 52], [32, 45]], wingR2, { g: 'wf2', under: true, bevel: 3 })
        if (!icon) {
          spot(11, 21, 3.2, 'wf1')
          zig(zigzag(8, 29, 21, 25, 4, 1.3), 'wf1')
        }
      } else {
        s.blob([[34, 30], [42, 18], [52, 8], [60, 8], [62, 18], [56, 30], [44, 36]], wingR, { g: 'wn1', bevel: 3 })
        s.blob([[36, 38], [46, 38], [56, 42], [58, 50], [50, 54], [40, 48]], wingR, { g: 'wn2', bevel: 3 })
        if (!icon) {
          spot(54, 17, 3.8, 'wn1')
          spot(51, 46, 2.6, 'wn2')
          zig(zigzag(40, 30, 58, 26, 5, 1.4), 'wn1')
          zig(zigzag(42, 44, 55, 50, 3, 1.1), 'wn2')
        }
      }
    }
    const lanternBody = () => {
      s.limb(33, 38, 2.6, 34, 41, 3, fuzz, { g: 'lneck' })
      s.ellipse(36.5, 47.5, 7, 8.5, lantern, { g: 'lantern', rot: -18, flat: 1 })
      s.ellipse(38.5, 50, 5, 6, lantern, { paint: true, onto: ['lantern'], rot: -18, flat: 2 })
      s.ellipse(34.5, 45, 3.5, 4.5, lantern, { paint: true, onto: ['lantern'], rot: -18, flat: 0 })
      if (!icon)
        for (const dx of [-3.5, 0, 3.5]) s.line(35 + dx * 0.9, 40.5 + Math.abs(dx) * 0.5, 38 + dx * 1.1, 54.5 - Math.abs(dx) * 0.5, p.c('#d8a018'))
      s.ellipse(39.5, 56, 2.6, 1.7, fuzz, { g: 'lcap' })
    }
    const thorax = () => {
      puff(s, [[30, 33, 5], [26.5, 30, 4], [33, 36, 4]], fuzz, { g: 'thorax' })
    }
    const head = () => {
      s.circle(22.5, 26, 5, fuzz, { g: 'head' })
      if (!back) {
        s.ellipse(19.5, 25.5, 3.6, 4, eyeR, { g: 'ceye' })
        s.ellipse(25, 24, 2.2, 2.6, eyeR, { g: 'ceye2', under: true })
        if (!icon) s.dot(18, 23, p.ramp('#ffffff'), 1).dot(19, 23, p.ramp('#b0a0d8'), 1).dot(18, 24, p.ramp('#8070a8'), 1)
      }
    }
    const antennae = () => {
      s.leaf(21, 21, 13, 8, 4.2, fuzz, { g: 'an1' }, -0.8)
      s.leaf(24, 21, 26, 7, 4, fuzz, { g: 'an2' }, 0.8)
      if (!icon) s.shadeLine(20, 19, 14.5, 10, 1).shadeLine(24, 19, 25.5, 9, 1)
    }
    if (back) {
      antennae()
      head()
      wings(false)
      lanternBody()
      thorax()
      wings(true)
      return
    }
    wings(true)
    antennae()
    lanternBody()
    thorax()
    head()
    wings(false)
    // Dangling legs.
    for (const [x, y] of [
      [27, 37],
      [31, 39],
    ])
      s.line(x, y, x - 2, y + 5, p.c('#6c5840'))
  },
}

export const BUG_LINE = { twigling, timberwalk, lumigrub, lanterwing } satisfies Partial<Record<SpeciesId, Recipe>>
