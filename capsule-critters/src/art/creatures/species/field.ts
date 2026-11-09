/**
 * Field and forest critters met early on:
 * ROOKLET → ROOKARD → CORVALIER (rooks), MARMLET → MARMOUNT (marmots),
 * GRUBLET → CASKLING → STAGGART (beetles), ANTLET → FORMIDANT (ants).
 */
import type { P3 } from '../canvas'
import { eye, iconEye, type Recipe } from '../kit'

// ─── Rooks ────────────────────────────────────────────────────────────────

const rooklet: Recipe = {
  size: 'S',
  draw(s, p) {
    const plume = p.m('deep')
    const wing = p.m('dark')
    const beak = p.m('pale')
    const leg = p.m('mid')
    const back = s.back
    const icon = s.icon
    const legs = () => {
      s.limb(29, 55, 1, 28, 60, 0.9, leg, { g: 'leg1' })
      s.limb(36, 55, 1, 37, 60, 0.9, leg, { g: 'leg2', under: true })
    }
    const tail = () =>
      s.poly(
        [
          [40, 49],
          [53, 44],
          [54, 50],
          [42, 55],
        ],
        wing,
        { g: 'tail', bevel: 1.5 },
      )
    const body = () => s.ellipse(32, 47, 11.5, 10, plume, { g: 'body' })
    const wingPart = () => {
      s.ellipse(37, 46, 8, 5.5, wing, { g: 'wing', rot: -20 })
      if (!icon) for (const y of [45, 48]) s.shadeLine(33, y, 41, y - 2, 1)
    }
    const head = () => {
      s.circle(22, 35, 8.5, plume, { g: 'head' })
      if (!back)
        s.poly(
          [
            [16, 33],
            [5, 38],
            [16, 41],
          ],
          beak,
          { g: 'beak', bevel: 1 },
        )
      s.ellipse(23, 27.5, 2, 3, plume, { g: 'tuft', rot: 20 })
    }
    if (back) {
      head()
      legs()
      body()
      tail()
      wingPart()
      return
    }
    legs()
    tail()
    body()
    wingPart()
    head()
    if (icon) {
      iconEye(s, p, 19, 33, 'glow')
      return
    }
    eye(s, p, 'white45', 18, 31)
  },
}

const rookard: Recipe = {
  size: 'M',
  draw(s, p) {
    const plume = p.m('deep')
    const wing = p.m('dark')
    const beak = p.m('pale')
    const leg = p.m('mid')
    const back = s.back
    const icon = s.icon
    const legs = () => {
      s.limb(28, 50, 1.3, 27, 59, 1.1, leg, { g: 'leg1' })
      s.ellipse(25, 60, 3, 1.2, leg, { g: 'leg1' })
      s.limb(36, 50, 1.3, 38, 59, 1.1, leg, { g: 'leg2', under: true })
    }
    const tail = () =>
      s.poly(
        [
          [42, 44],
          [58, 38],
          [59, 44],
          [56, 47],
          [44, 51],
        ],
        wing,
        { g: 'tail', bevel: 1.5 },
      )
    const body = () => s.ellipse(33, 40, 12, 13, plume, { g: 'body', rot: 20 })
    const wingPart = () => {
      s.ellipse(39, 38, 10, 6.5, wing, { g: 'wing', rot: -30 })
      if (!icon) for (const k of [0, 3, 6]) s.shadeLine(33 + k, 41 - k, 46 + k, 33 - k, 1)
    }
    const head = () => {
      s.circle(21, 24, 8, plume, { g: 'head' })
      s.poly(
        [
          [22, 17],
          [27, 9],
          [28, 16],
        ],
        plume,
        { g: 'crest', bevel: 1 },
      )
      if (!back)
        s.poly(
          [
            [15, 21],
            [2, 26],
            [15, 29],
          ],
          beak,
          { g: 'beak', bevel: 1 },
        )
    }
    if (back) {
      head()
      legs()
      body()
      tail()
      wingPart()
      return
    }
    legs()
    tail()
    body()
    wingPart()
    head()
    if (icon) {
      iconEye(s, p, 18, 22, 'glow')
      return
    }
    eye(s, p, 'fierce54', 15, 20, { i: 'L' })
  },
}

const corvalier: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const plume = p.m('deep')
    const wing = p.m('dark')
    const plate = p.m('light')
    const beak = p.m('pale')
    const leg = p.m('mid')
    const back = s.back
    const icon = s.icon
    const wings = (far: boolean) => {
      const pts: [number, number][] = far
        ? [
            [38, 30],
            [58, 8],
            [62, 18],
            [58, 30],
            [46, 40],
          ]
        : [
            [30, 30],
            [6, 10],
            [3, 22],
            [10, 34],
            [26, 42],
          ]
      s.poly(pts, wing, { g: far ? 'wing2' : 'wing1', bevel: 2, under: far })
      if (!icon) for (let k = 0; k < 3; k++) s.shadeLine(far ? 44 + k * 4 : 24 - k * 5, 34 - k * 2, far ? 56 + k * 1 : 10 - k * 1, 18 + k * 5, 1)
    }
    const legs = () => {
      s.limb(30, 48, 2, 28, 59, 1.6, leg, { g: 'leg1' })
      s.limb(37, 48, 2, 39, 59, 1.6, leg, { g: 'leg2', under: true })
      if (!icon) for (const x of [24, 27, 30]) s.limb(28, 59, 0.8, x, 61, 0.4, plate, { g: `t${x}` })
    }
    const body = () => {
      s.ellipse(33, 38, 11, 14, plume, { g: 'body' })
      if (!back) {
        s.ellipse(29, 38, 7, 10, plate, { paint: true, onto: ['body'] })
        if (!icon) for (const y of [33, 38, 43]) s.shadeLine(24, y, 34, y + 1, 1)
      }
    }
    const head = () => {
      s.circle(26, 20, 7.5, plume, { g: 'head' })
      s.ellipse(29, 13, 6, 2, plate, { g: 'plume', rot: -30 })
      s.ellipse(34, 9, 5, 1.8, plate, { g: 'plume2', rot: -50 })
      if (!back)
        s.poly(
          [
            [20, 18],
            [7, 23],
            [20, 25],
          ],
          beak,
          { g: 'beak', bevel: 1 },
        )
    }
    if (back) {
      head()
      wings(true)
      legs()
      body()
      wings(false)
      return
    }
    wings(true)
    legs()
    body()
    head()
    wings(false)
    if (icon) {
      iconEye(s, p, 23, 18, 'glow')
      return
    }
    eye(s, p, 'fierce54', 20, 16, { i: 'L' })
  },
}

// ─── Marmots ──────────────────────────────────────────────────────────────

const marmlet: Recipe = {
  size: 'S',
  draw(s, p) {
    const fur = p.m('mid')
    const belly = p.m('pale')
    const dark = p.m('dark')
    const back = s.back
    const icon = s.icon
    const tail = () => s.ellipse(44, 55, 5, 3, dark, { g: 'tail', rot: -20 })
    const feet = () => {
      s.ellipse(27, 59, 4, 2, fur, { g: 'f1' })
      s.ellipse(38, 59, 4, 2, fur, { g: 'f2', under: true })
    }
    const body = () => {
      s.ellipse(33, 48, 10.5, 12, fur, { g: 'body' })
      if (!back) s.ellipse(30, 50, 6.5, 8.5, belly, { paint: true, onto: ['body'] })
    }
    const arms = () => {
      s.limb(26, 43, 2.2, 23, 47, 1.8, fur, { g: 'arm1' })
      s.limb(33, 43, 2, 28, 47, 1.7, fur, { g: 'arm2' })
    }
    const head = () => {
      s.circle(23, 31, 3, fur, { g: 'ear2' })
      s.circle(30, 33, 3, fur, { g: 'ear1', under: true })
      s.ellipse(25, 37, 9, 8, fur, { g: 'head' })
      if (!back) s.ellipse(19, 40, 5, 4, belly, { paint: true, onto: ['head'] })
    }
    if (back) {
      head()
      feet()
      body()
      tail()
      return
    }
    feet()
    tail()
    body()
    head()
    arms()
    if (icon) {
      iconEye(s, p, 21, 36)
      return
    }
    eye(s, p, 'round45', 19, 33)
    eye(s, p, 'dot2', 14, 35)
    s.stamp(p.stamp(['KK']), 13, 38)
    s.stamp(p.stamp(['KKK', 'KWK', 'KWK']), 16, 42)
  },
}

const marmount: Recipe = {
  size: 'M',
  draw(s, p) {
    const fur = p.m('mid')
    const belly = p.m('pale')
    const dark = p.m('dark')
    const rock = p.m('light')
    const back = s.back
    const icon = s.icon
    const stone = () =>
      s.blob(
        [
          [12, 61],
          [14, 53],
          [26, 49],
          [46, 50],
          [54, 56],
          [52, 61],
        ],
        rock,
        { g: 'rock', bevel: 2.5 },
      )
    const tail = () => s.ellipse(47, 46, 7, 4, dark, { g: 'tail', rot: -40 })
    const body = () => {
      s.ellipse(33, 38, 12, 15, fur, { g: 'body' })
      if (!back) s.ellipse(29, 41, 7.5, 11, belly, { paint: true, onto: ['body'] })
      s.ellipse(27, 51.5, 5, 2.4, fur, { g: 'f1' })
      s.ellipse(39, 51.5, 5, 2.4, fur, { g: 'f2' })
    }
    const arms = () => {
      s.limb(26, 31, 2.8, 20, 25, 2.2, fur, { g: 'arm1' })
      s.limb(35, 31, 2.6, 27, 25, 2, fur, { g: 'arm2' })
    }
    const head = () => {
      s.circle(24, 13, 3.4, fur, { g: 'ear2' })
      s.circle(33, 15, 3.4, fur, { g: 'ear1', under: true })
      s.ellipse(26, 20, 9.5, 8.5, fur, { g: 'head' })
      if (!back) s.ellipse(20, 23, 5.5, 4.4, belly, { paint: true, onto: ['head'] })
    }
    if (back) {
      stone()
      head()
      body()
      tail()
      return
    }
    stone()
    tail()
    body()
    head()
    arms()
    if (icon) {
      iconEye(s, p, 22, 18)
      return
    }
    eye(s, p, 'round45', 19, 16)
    eye(s, p, 'dot2', 14, 18)
    s.stamp(p.stamp(['KK']), 13.5, 21)
    s.stamp(p.stamp(['KKK', 'KWK', 'KWK']), 16, 25)
  },
}

// ─── Beetles ──────────────────────────────────────────────────────────────

const grublet: Recipe = {
  size: 'S',
  draw(s, p) {
    const hide = p.m('light')
    const band = p.m('mid')
    const head = p.m('mid')
    const back = s.back
    const icon = s.icon
    const segs: [number, number, number][] = [
      [47, 54, 5],
      [41, 53, 6],
      [34, 51, 6.6],
      [27, 49, 6.8],
    ]
    const body = () => {
      segs.forEach(([x, y, r], i) => s.circle(x, y, r, i % 2 ? band : hide, { g: `seg${i}` }))
      if (!icon) for (const [x] of segs) s.limb(x, 58, 0.9, x - 1, 61, 0.7, band, { g: `leg${x}`, under: true })
    }
    const headPart = () => {
      s.circle(19, 44, 7.5, head, { g: 'head' })
      s.limb(17, 37, 0.8, 13, 31, 0.6, head, { g: 'ant1' })
      s.limb(21, 37, 0.8, 24, 31, 0.6, head, { g: 'ant2', under: true })
      s.circle(13, 31, 1.3, head, { g: 'ant1' })
      s.circle(24, 31, 1.3, head, { g: 'ant2' })
    }
    if (back) {
      headPart()
      body()
      return
    }
    body()
    headPart()
    if (icon) {
      iconEye(s, p, 16, 43)
      return
    }
    eye(s, p, 'round45', 14, 40)
    s.line(12, 48, 15, 49, p.c('K'))
  },
}

const caskling: Recipe = {
  size: 'M',
  draw(s, p) {
    const shell = p.m('mid')
    const hoop = p.m('dark')
    const back = s.back
    const icon = s.icon
    s.squircle(32, 40, 12, 19, 2.6, shell, { g: 'cask' })
    for (const y of [27, 40, 53]) s.ellipse(32, y, 12.5, 2, hoop, { paint: true, onto: ['cask'] })
    s.limb(33, 20, 1.5, 37, 13, 1, shell, { g: 'stalk' })
    if (back || icon) {
      if (icon) iconEye(s, p, 26, 34, 'glow')
      return
    }
    // Eyes peeking out of a slit in the casing.
    s.stamp(p.stamp(['KKKKKKKKKK', 'KWKKKKWKKK', 'KKKKKKKKKK']), 21, 32)
  },
}

const staggart: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const shell = p.m('mid')
    const dark = p.m('deep')
    const horn = p.m('dark')
    const back = s.back
    const icon = s.icon
    const legs = () => {
      s.limb(28, 46, 2.2, 24, 59, 1.8, dark, { g: 'leg1' })
      s.limb(38, 46, 2.2, 41, 59, 1.8, dark, { g: 'leg2', under: true })
    }
    const arms = (far: boolean) => {
      if (far) s.limb(38, 30, 2, 44, 38, 1.6, dark, { g: 'arm2', under: true })
      else s.limb(26, 30, 2.2, 18, 38, 1.8, dark, { g: 'arm1' })
    }
    const body = () => {
      s.ellipse(33, 38, 11, 13, shell, { g: 'shell' })
      if (!icon) s.shadeLine(33, 27, 34, 50, 2)
    }
    const head = () => {
      s.ellipse(27, 22, 8, 6.5, dark, { g: 'head' })
      // The great antler jaws.
      s.tube(
        [
          [24, 18, 2],
          [16, 10, 1.8],
          [10, 4, 1.2],
          [6, 6, 0.8],
        ],
        horn,
        { g: 'jaw1' },
      )
      s.tube(
        [
          [30, 17, 2],
          [36, 8, 1.8],
          [42, 3, 1.2],
          [46, 6, 0.8],
        ],
        horn,
        { g: 'jaw2' },
      )
      if (!icon) {
        s.limb(14, 9, 0.8, 10, 12, 0.6, horn, { g: 'jaw1' })
        s.limb(38, 7, 0.8, 41, 11, 0.6, horn, { g: 'jaw2' })
      }
    }
    if (back) {
      arms(true)
      legs()
      body()
      head()
      arms(false)
      return
    }
    arms(true)
    legs()
    body()
    head()
    arms(false)
    if (icon) {
      iconEye(s, p, 24, 22, 'glow')
      return
    }
    eye(s, p, 'glow33', 21, 20)
    eye(s, p, 'glow33', 28, 20)
  },
}

// ─── Ants ─────────────────────────────────────────────────────────────────

const antlet: Recipe = {
  size: 'S',
  draw(s, p) {
    const shell = p.m('mid')
    const dark = p.m('dark')
    const back = s.back
    const icon = s.icon
    const legs = () => {
      for (const [x, tx] of [
        [28, 22],
        [33, 33],
        [37, 43],
      ] as const)
        s.tube(
          [
            [x, 50, 0.9],
            [(x + tx) / 2, 52, 0.8],
            [tx, 60, 0.6],
          ],
          dark,
          { g: `leg${x}`, under: true },
        )
    }
    const body = () => {
      s.ellipse(44, 49, 7, 6, shell, { g: 'abdomen' })
      s.ellipse(33, 49, 4.5, 4, shell, { g: 'thorax' })
    }
    const head = () => {
      s.circle(22, 44, 7.5, shell, { g: 'head' })
      s.tube(
        [
          [21, 37, 0.7],
          [18, 30, 0.6],
          [13, 28, 0.5],
        ],
        dark,
        { g: 'ant1' },
      )
      s.tube(
        [
          [25, 37, 0.7],
          [27, 30, 0.6],
          [32, 28, 0.5],
        ],
        dark,
        { g: 'ant2', under: true },
      )
      if (!back) s.ellipse(15.5, 48, 2.6, 1.6, dark, { g: 'jaw' })
    }
    if (back) {
      head()
      legs()
      body()
      return
    }
    legs()
    body()
    head()
    if (icon) {
      iconEye(s, p, 19, 42)
      return
    }
    eye(s, p, 'round45', 17, 40)
  },
}

const formidant: Recipe = {
  size: 'M',
  draw(s, p) {
    const shell = p.m('mid')
    const dark = p.m('dark')
    const acid = p.m('glowMid')
    const back = s.back
    const icon = s.icon
    const path: P3[] = [
      [40, 40, 6],
      [47, 46, 8],
      [50, 54, 7],
    ]
    const abdomen = () => {
      s.tube(path, shell, { g: 'abdomen' })
      if (!icon) {
        s.circle(52, 60, 1.6, acid, { g: 'drop' })
        for (const y of [44, 50]) s.shadeLine(42, y, 54, y + 2, 1)
      }
    }
    const legs = () => {
      s.limb(30, 44, 2, 26, 59, 1.6, dark, { g: 'leg1' })
      s.limb(36, 44, 2, 38, 59, 1.6, dark, { g: 'leg2', under: true })
    }
    const torso = () => s.ellipse(32, 33, 7, 10, shell, { g: 'torso', rot: 10 })
    const arms = () => {
      s.limb(28, 28, 1.8, 20, 34, 1.4, dark, { g: 'arm1' })
      s.limb(20, 34, 1.4, 16, 30, 1.2, dark, { g: 'arm1' })
    }
    const head = () => {
      s.circle(26, 17, 7.5, shell, { g: 'head' })
      s.tube(
        [
          [25, 10, 0.8],
          [21, 3, 0.7],
          [15, 2, 0.6],
        ],
        dark,
        { g: 'ant1' },
      )
      s.tube(
        [
          [29, 10, 0.8],
          [33, 3, 0.7],
          [38, 2, 0.6],
        ],
        dark,
        { g: 'ant2', under: true },
      )
      if (!back) {
        s.poly(
          [
            [20, 19],
            [11, 22],
            [17, 24],
          ],
          dark,
          { g: 'jaw1', bevel: 0.8 },
        )
        s.poly(
          [
            [22, 22],
            [14, 27],
            [21, 26],
          ],
          dark,
          { g: 'jaw2', bevel: 0.8 },
        )
      }
    }
    if (back) {
      head()
      legs()
      torso()
      abdomen()
      return
    }
    abdomen()
    legs()
    torso()
    arms()
    head()
    if (icon) {
      iconEye(s, p, 23, 15)
      return
    }
    eye(s, p, 'fierce54', 20, 13)
  },
}

export const FIELD_RECIPES = { rooklet, rookard, corvalier, marmlet, marmount, grublet, caskling, staggart, antlet, formidant }
