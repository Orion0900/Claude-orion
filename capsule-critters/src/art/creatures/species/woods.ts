/**
 * Woodland and roadside critters:
 * GLIMMET → LANTERFLY (glowworms), SPUDLING → TUBERUS (potatoes),
 * PUFFSPORE → MYCOLOSS (mushrooms), JERBOLT → AMPAROO (jerboas),
 * FLITTER → VESPERWING (bats), MAGPENNY → MAGPILFER (magpies).
 */
import type { P3 } from '../canvas'
import { eye, iconEye, type Recipe } from '../kit'
import { puff } from '../parts'

// ─── Glowworms ────────────────────────────────────────────────────────────

const glimmet: Recipe = {
  size: 'S',
  draw(s, p) {
    const hide = p.m('light')
    const band = p.m('mid')
    const glow = p.m('glow')
    const silk = p.m('pale')
    const back = s.back
    const icon = s.icon
    if (!icon) s.limb(26, 2, 0.5, 26, 30, 0.5, silk, { g: 'silk', line: false })
    const segs: [number, number, number][] = [
      [26, 34, 5],
      [29, 41, 5.6],
      [33, 48, 6],
      [38, 54, 6.4],
    ]
    segs.forEach(([x, y, r], i) => s.circle(x, y, r, i === 3 ? glow : i % 2 ? band : hide, { g: `seg${i}` }))
    if (!icon) for (const k of [0, 1, 2]) s.shadeLine(36 + k * 2, 52, 40 + k * 2, 57, -1)
    if (back) return
    if (icon) {
      iconEye(s, p, 24, 33)
      return
    }
    eye(s, p, 'round45', 21, 31)
    s.line(21, 37, 23, 38, p.c('K'))
  },
}

const lanterfly: Recipe = {
  size: 'M',
  draw(s, p) {
    const wing = p.m('light')
    const vein = p.m('mid')
    const body = p.m('dark')
    const lamp = p.m('glow')
    const back = s.back
    const icon = s.icon
    const wings = (far: boolean) => {
      const pts: [number, number][] = far
        ? [
            [32, 26],
            [56, 8],
            [60, 22],
            [50, 34],
          ]
        : [
            [30, 28],
            [6, 12],
            [4, 28],
            [20, 38],
          ]
      s.poly(pts, wing, { g: far ? 'w2' : 'w1', bevel: 3, under: far })
      if (!icon) {
        const [cx, cy] = far ? [50, 22] : [14, 26]
        s.circle(cx, cy, 3, vein, { paint: true, onto: [far ? 'w2' : 'w1'] })
        s.circle(cx + (far ? -6 : 6), cy + 4, 2, vein, { paint: true, onto: [far ? 'w2' : 'w1'] })
      }
    }
    const lantern = () => {
      s.limb(32, 38, 1.2, 32, 42, 1.2, body, { g: 'neck' })
      s.squircle(32, 49, 6, 8, 2.4, lamp, { g: 'lamp' })
      s.ellipse(32, 41.5, 4.5, 1.5, body, { g: 'cap' })
      s.ellipse(32, 57.5, 3, 1.2, body, { g: 'base' })
    }
    const torso = () => {
      s.ellipse(31, 30, 4.5, 8, body, { g: 'torso' })
      s.circle(27, 22, 5, body, { g: 'head' })
      s.tube(
        [
          [25, 18, 0.6],
          [19, 10, 0.5],
          [15, 9, 0.4],
        ],
        body,
        { g: 'ant1' },
      )
      s.tube(
        [
          [28, 17, 0.6],
          [31, 9, 0.5],
          [35, 7, 0.4],
        ],
        body,
        { g: 'ant2', under: true },
      )
    }
    if (back) {
      lantern()
      torso()
      wings(true)
      wings(false)
      return
    }
    wings(true)
    lantern()
    torso()
    wings(false)
    if (icon) {
      iconEye(s, p, 25, 21, 'glow')
      return
    }
    eye(s, p, 'glow44', 22, 19)
  },
}

// ─── Potatoes ─────────────────────────────────────────────────────────────

const spudling: Recipe = {
  size: 'S',
  draw(s, p) {
    const skin = p.m('mid')
    const leaf = p.m('light')
    const dark = p.m('dark')
    const back = s.back
    const icon = s.icon
    s.ellipse(27, 58.5, 3.2, 1.8, dark, { g: 'f1' })
    s.ellipse(37, 58.5, 3.2, 1.8, dark, { g: 'f2', under: true })
    s.blob(
      [
        [20, 52],
        [19, 42],
        [25, 34],
        [36, 33],
        [43, 40],
        [44, 52],
        [37, 57],
        [26, 57],
      ],
      skin,
      { g: 'spud', bevel: 4 },
    )
    if (!icon)
      for (const [x, y] of [
        [38, 38],
        [40, 47],
        [33, 53],
      ] as const)
        s.shadePx(x, y, 1)
    s.leaf(31, 33, 25, 22, 3, leaf, { g: 'l1' }, 0.3)
    s.leaf(31, 33, 37, 23, 2.8, leaf, { g: 'l2' }, -0.3)
    if (back) return
    if (icon) {
      iconEye(s, p, 25, 42)
      return
    }
    eye(s, p, 'dot3', 23, 40)
    eye(s, p, 'dot3', 29, 40)
    s.line(24, 47, 28, 47, p.c('K'))
  },
}

const tuberus: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const skin = p.m('mid')
    const leaf = p.m('light')
    const root = p.m('dark')
    const back = s.back
    const icon = s.icon
    const roots = () => {
      for (const [x, tx] of [
        [24, 18],
        [32, 31],
        [42, 46],
      ] as const)
        s.tube(
          [
            [x, 50, 3],
            [(x + tx) / 2, 56, 2.4],
            [tx, 60, 1.6],
          ],
          root,
          { g: `root${x}`, under: true },
        )
    }
    const body = () => {
      s.blob(
        [
          [12, 46],
          [11, 30],
          [19, 18],
          [33, 14],
          [47, 20],
          [53, 34],
          [51, 48],
          [40, 55],
          [22, 55],
        ],
        skin,
        { g: 'body', bevel: 6 },
      )
      if (!icon)
        for (const [x, y] of [
          [40, 24],
          [46, 36],
          [38, 46],
          [24, 46],
        ] as const)
          s.stamp(p.stamp(['DD', 'DD']), x, y)
    }
    const crown = () => {
      s.leaf(30, 15, 20, 2, 4, leaf, { g: 'c1' }, 0.4)
      s.leaf(32, 15, 34, 0, 4, leaf, { g: 'c2' })
      s.leaf(34, 15, 46, 3, 4, leaf, { g: 'c3' }, -0.4)
    }
    const arms = () => s.tube([[16, 34, 3.4], [9, 40, 2.8], [8, 46, 2]], root, { g: 'arm' })
    if (back) {
      crown()
      roots()
      body()
      return
    }
    roots()
    crown()
    body()
    arms()
    if (icon) {
      iconEye(s, p, 22, 27)
      return
    }
    eye(s, p, 'round45', 18, 24)
    eye(s, p, 'round45', 27, 24)
    s.line(20, 34, 28, 34, p.c('K'))
    s.line(21, 35, 27, 35, p.c('D'))
  },
}

// ─── Mushrooms ────────────────────────────────────────────────────────────

const puffspore: Recipe = {
  size: 'S',
  draw(s, p) {
    const cap = p.m('mid')
    const stalk = p.m('pale')
    const spot = p.m('white')
    const back = s.back
    const icon = s.icon
    s.ellipse(32, 59, 5, 2, stalk, { g: 'foot' })
    s.squircle(32, 51, 6, 8, 2.2, stalk, { g: 'stalk' })
    s.ellipse(32, 39, 13, 9, cap, { g: 'cap' })
    if (!icon)
      for (const [x, y, r] of [
        [27, 35, 2],
        [35, 33, 1.6],
        [40, 39, 1.8],
        [25, 41, 1.4],
      ] as const)
        s.circle(x, y, r, spot, { paint: true, onto: ['cap'] })
    if (back) return
    if (icon) {
      iconEye(s, p, 30, 51)
      return
    }
    eye(s, p, 'dot3', 28, 49)
    eye(s, p, 'dot3', 33, 49)
    s.pxs([30, 55, 31, 55], p.c('K'))
  },
}

const mycoloss: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const cap = p.m('mid')
    const stalk = p.m('pale')
    const spot = p.m('white')
    const gill = p.m('dark')
    const back = s.back
    const icon = s.icon
    const legs = () => {
      s.ellipse(25, 59, 5, 2.2, stalk, { g: 'f1' })
      s.ellipse(39, 59, 5, 2.2, stalk, { g: 'f2', under: true })
    }
    const stem = () => {
      s.squircle(32, 46, 10, 13, 2.2, stalk, { g: 'stalk' })
      s.limb(23, 42, 3, 15, 50, 2.4, stalk, { g: 'arm1' })
      s.limb(41, 42, 3, 49, 50, 2.4, stalk, { g: 'arm2', under: true })
    }
    const capPart = () => {
      s.ellipse(32, 30, 4 + 22, 5, gill, { g: 'gill' })
      s.ellipse(32, 22, 26, 14, cap, { g: 'cap' })
      if (!icon)
        for (const [x, y, r] of [
          [20, 18, 3.4],
          [33, 12, 3],
          [45, 19, 3.2],
          [27, 26, 2],
          [41, 27, 2.2],
        ] as const)
          s.circle(x, y, r, spot, { paint: true, onto: ['cap'] })
      if (!icon) puff(s, [[56, 10, 2], [59, 6, 1.6], [53, 5, 1.4]], spot, { g: 'spores', line: false })
    }
    if (back) {
      legs()
      stem()
      capPart()
      return
    }
    legs()
    stem()
    capPart()
    if (icon) {
      iconEye(s, p, 28, 42)
      return
    }
    eye(s, p, 'round45', 24, 39)
    eye(s, p, 'round45', 33, 39)
    s.line(27, 49, 33, 49, p.c('K'))
  },
}

// ─── Jerboas ──────────────────────────────────────────────────────────────

const jerbolt: Recipe = {
  size: 'S',
  draw(s, p) {
    const fur = p.m('light')
    const belly = p.m('white')
    const dark = p.m('dark')
    const spark = p.m('glow')
    const back = s.back
    const icon = s.icon
    const tailPath: P3[] = [
      [38, 53, 1.2],
      [47, 50, 1],
      [53, 42, 0.9],
      [55, 34, 0.8],
    ]
    const tail = () => {
      s.tube(tailPath, dark, { g: 'tail' })
      s.circle(55, 31, 3.4, spark, { g: 'spark' })
      if (!icon) s.pxs([52, 27, 58, 28, 59, 33, 51, 34], p.c('L'))
    }
    const feet = () => {
      s.ellipse(37, 54, 5, 5.5, fur, { g: 'thigh' })
      s.ellipse(31, 59.5, 6, 1.6, fur, { g: 'thigh' })
    }
    const body = () => {
      s.ellipse(31, 49, 7.5, 7, fur, { g: 'body' })
      if (!back) s.ellipse(28, 51, 4.5, 4.5, belly, { paint: true, onto: ['body'] })
    }
    const head = () => {
      s.leaf(25, 36, 29, 16, 4.5, fur, { g: 'ear2' }, -0.1)
      s.circle(22, 40, 6.5, fur, { g: 'head' })
      s.leaf(21, 35, 17, 15, 4.5, fur, { g: 'ear1' }, 0.1)
      if (!icon) s.leaf(20, 33, 17.5, 19, 2, belly, { paint: true, onto: ['ear1'] }, 0.1)
      if (!back) s.ellipse(17.5, 43, 3.6, 2.8, belly, { paint: true, onto: ['head'] })
    }
    if (back) {
      head()
      body()
      feet()
      tail()
      return
    }
    tail()
    body()
    feet()
    head()
    s.limb(26, 47, 1.2, 23, 52, 1, fur, { g: 'arm' })
    if (icon) {
      iconEye(s, p, 19, 39)
      return
    }
    eye(s, p, 'round56', 16, 36)
    s.pxs([13, 42], p.c('K'))
  },
}

const amparoo: Recipe = {
  size: 'M',
  draw(s, p) {
    const fur = p.m('light')
    const belly = p.m('white')
    const dark = p.m('dark')
    const spark = p.m('glow')
    const back = s.back
    const icon = s.icon
    const tail = () => {
      s.tube(
        [
          [40, 46, 3],
          [50, 52, 2.4],
          [58, 58, 1.6],
        ],
        fur,
        { g: 'tail' },
      )
      s.circle(59, 58, 2.6, spark, { g: 'spark' })
    }
    const legs = () => {
      s.ellipse(36, 48, 7, 8, fur, { g: 'thigh' })
      s.ellipse(28, 59.5, 9, 2, dark, { g: 'thigh' })
      // Springs coiled round the shin.
      if (!icon) for (const y of [52, 55]) s.ellipse(33, y, 3.5, 1, dark, { paint: true, onto: ['thigh'] })
    }
    const body = () => {
      s.ellipse(31, 36, 9, 13, fur, { g: 'body', rot: 12 })
      if (!back) s.ellipse(28, 38, 5, 9, belly, { paint: true, onto: ['body'], rot: 12 })
    }
    const arms = () => {
      s.limb(25, 30, 2.4, 17, 32, 2, fur, { g: 'arm1' })
      s.circle(15.5, 32, 3, dark, { g: 'fist1' })
      s.limb(31, 30, 2.2, 23, 27, 1.8, fur, { g: 'arm2' })
      s.circle(21.5, 26.5, 2.8, dark, { g: 'fist2' })
    }
    const head = () => {
      s.leaf(29, 14, 35, -2, 4.5, fur, { g: 'ear2' }, -0.1)
      s.ellipse(25, 18, 7, 6.5, fur, { g: 'head' })
      s.leaf(24, 13, 21, -3, 4.5, fur, { g: 'ear1' }, 0.1)
      if (!back) s.ellipse(19.5, 21, 3.6, 3, belly, { paint: true, onto: ['head'] })
    }
    if (back) {
      head()
      body()
      legs()
      tail()
      return
    }
    tail()
    legs()
    body()
    head()
    arms()
    if (icon) {
      iconEye(s, p, 21, 17)
      return
    }
    eye(s, p, 'fierce54', 18, 15)
    s.pxs([15, 21], p.c('K'))
  },
}

// ─── Bats ─────────────────────────────────────────────────────────────────

function batWings(s: Parameters<Recipe['draw']>[0], m: ReturnType<Parameters<Recipe['draw']>[1]['m']>, k: number, cy: number, icon: boolean): void {
  for (const side of [-1, 1]) {
    const pts: [number, number][] = [
      [32 + side * 4, cy - 4],
      [32 + side * 26 * k, cy - 14 * k],
      [32 + side * 30 * k, cy + 2],
      [32 + side * 22 * k, cy + 2 + 6 * k],
      [32 + side * 14 * k, cy + 4],
      [32 + side * 6, cy + 6],
    ]
    s.poly(pts, m, { g: side < 0 ? 'w1' : 'w2', bevel: 1.5 })
    if (!icon) s.shadeLine(32 + side * 6, cy - 2, 32 + side * 26 * k, cy - 12 * k, 1)
  }
}

const flitter: Recipe = {
  size: 'S',
  front: { dy: -10 },
  draw(s, p) {
    const fur = p.m('mid')
    const wing = p.m('dark')
    const back = s.back
    const icon = s.icon
    batWings(s, wing, 0.8, 40, icon)
    s.circle(32, 42, 8, fur, { g: 'body' })
    s.leaf(27, 36, 23, 25, 3.2, fur, { g: 'ear1' }, 0.2)
    s.leaf(37, 36, 41, 25, 3.2, fur, { g: 'ear2' }, -0.2)
    if (back) return
    if (icon) {
      iconEye(s, p, 29, 41, 'glow')
      iconEye(s, p, 35, 41, 'glow')
      return
    }
    eye(s, p, 'round45', 26, 38)
    eye(s, p, 'round45', 34, 38)
    s.stamp(p.stamp(['W.W']), 30, 46)
  },
}

const vesperwing: Recipe = {
  size: 'L',
  front: { dy: -6 },
  draw(s, p) {
    const fur = p.m('mid')
    const wing = p.m('deep')
    const moon = p.m('pale')
    const back = s.back
    const icon = s.icon
    batWings(s, wing, 1.05, 34, icon)
    if (!icon) {
      s.ellipse(14, 34, 3, 2, moon, { paint: true, onto: ['w1'] })
      s.ellipse(50, 34, 3, 2, moon, { paint: true, onto: ['w2'] })
    }
    s.ellipse(32, 38, 8, 11, fur, { g: 'body' })
    s.circle(32, 26, 7, fur, { g: 'head' })
    s.leaf(28, 22, 22, 9, 3.6, fur, { g: 'ear1' }, 0.2)
    s.leaf(36, 22, 42, 9, 3.6, fur, { g: 'ear2' }, -0.2)
    s.limb(28, 48, 1.4, 27, 55, 1, wing, { g: 'leg1' })
    s.limb(36, 48, 1.4, 37, 55, 1, wing, { g: 'leg2' })
    if (back) return
    if (icon) {
      iconEye(s, p, 29, 25, 'glow')
      iconEye(s, p, 35, 25, 'glow')
      return
    }
    eye(s, p, 'fierce54', 25, 23, { i: 'L' })
    s.stamp(p.stamp(['oo...', '.ooo.', 'oiho.', '.oooo'].map((r) => r.split('').reverse().join('')), { o: 'K', i: 'L', h: 'W' }), 34, 23)
    s.stamp(p.stamp(['W.W']), 30, 30)
  },
}

// ─── Magpies ──────────────────────────────────────────────────────────────

const magpenny: Recipe = {
  size: 'S',
  draw(s, p) {
    const black = p.m('deep')
    const white = p.m('white')
    const coin = p.m('glowMid')
    const leg = p.m('mid')
    const back = s.back
    const icon = s.icon
    s.limb(31, 55, 0.9, 30, 60, 0.8, leg, { g: 'leg1' })
    s.limb(36, 55, 0.9, 37, 60, 0.8, leg, { g: 'leg2', under: true })
    s.poly(
      [
        [40, 48],
        [58, 54],
        [57, 57],
        [41, 53],
      ],
      black,
      { g: 'tail', bevel: 1 },
    )
    s.ellipse(33, 47, 9.5, 8, black, { g: 'body' })
    if (!back) s.ellipse(30, 50, 6, 5, white, { paint: true, onto: ['body'] })
    s.ellipse(38, 44, 6, 3.6, white, { paint: true, onto: ['body'], rot: -20 })
    s.circle(24, 38, 6.5, black, { g: 'head' })
    if (!back) {
      s.poly(
        [
          [19, 37],
          [11, 40],
          [19, 42],
        ],
        black,
        { g: 'beak', bevel: 0.8 },
      )
      if (!icon) s.circle(11, 42, 2.6, coin, { g: 'coin' })
    }
    if (back) return
    if (icon) {
      iconEye(s, p, 22, 37, 'glow')
      return
    }
    eye(s, p, 'white45', 20, 34)
  },
}

const magpilfer: Recipe = {
  size: 'M',
  draw(s, p) {
    const black = p.m('deep')
    const white = p.m('white')
    const sheen = p.m('dark')
    const coin = p.m('glowMid')
    const leg = p.m('mid')
    const back = s.back
    const icon = s.icon
    const legs = () => {
      s.limb(30, 50, 1.2, 28, 59, 1, leg, { g: 'leg1' })
      s.limb(36, 50, 1.2, 38, 59, 1, leg, { g: 'leg2', under: true })
      if (!icon) s.circle(26, 60, 2.6, coin, { g: 'coin1' })
    }
    const tail = () => {
      s.poly(
        [
          [40, 42],
          [62, 52],
          [61, 56],
          [41, 48],
        ],
        sheen,
        { g: 'tail', bevel: 1 },
      )
      if (!icon) s.shadeLine(44, 45, 60, 53, 1)
    }
    const body = () => {
      s.ellipse(33, 41, 10, 10, black, { g: 'body' })
      if (!back) s.ellipse(30, 45, 6.5, 6, white, { paint: true, onto: ['body'] })
      s.ellipse(39, 38, 7, 4, white, { paint: true, onto: ['body'], rot: -30 })
    }
    const head = () => {
      s.circle(23, 27, 7.5, black, { g: 'head' })
      if (!back) {
        s.ellipse(21, 26, 6, 2.4, sheen, { paint: true, onto: ['head'] })
        s.poly(
          [
            [17, 27],
            [6, 31],
            [17, 32],
          ],
          black,
          { g: 'beak', bevel: 0.8 },
        )
      }
    }
    if (back) {
      head()
      legs()
      body()
      tail()
      return
    }
    legs()
    tail()
    body()
    head()
    if (icon) {
      iconEye(s, p, 20, 26, 'glow')
      return
    }
    eye(s, p, 'white45', 17, 24)
  },
}

export const WOODS_RECIPES = { glimmet, lanterfly, spudling, tuberus, puffspore, mycoloss, jerbolt, amparoo, flitter, vesperwing, magpenny, magpilfer }
