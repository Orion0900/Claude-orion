/**
 * Mysterious, cold and rare critters:
 * MUSEBOX → PHANTORGAN, GLIMWISP → GLOOMWISP → GRIMWISP, TARSIGHT → TARSEER,
 * NIMBLAMB → CUMULAMB, ERMLET → ERMINARCH, GLACIOX,
 * HOARDLING → GILDRAKE → AURIGON, ALPACKA, COILET → TESLOOM, TULIPOP,
 * SHOOTLING → BAMBRAWL, and the legends CUPRION, ARGENTIDE, AURIGRYPH, SOLIDUS.
 */
import type { P3 } from '../canvas'
import { eye, iconEye, type Recipe } from '../kit'
import { flame, puff } from '../parts'

// ─── Music boxes ──────────────────────────────────────────────────────────

const musebox: Recipe = {
  size: 'S',
  draw(s, p) {
    const wood = p.m('mid')
    const dark = p.m('deep')
    const brass = p.m('pale')
    const back = s.back
    const icon = s.icon
    s.squircle(32, 50, 12, 8, 4, wood, { g: 'box' })
    // The lid hangs open; something peers out from the dark inside.
    s.poly(
      [
        [20, 42],
        [44, 42],
        [40, 30],
        [22, 32],
      ],
      wood,
      { g: 'lid', bevel: 1 },
    )
    s.squircle(32, 43, 10, 2.4, 3, dark, { g: 'inside' })
    s.limb(44, 50, 1, 49, 50, 1, brass, { g: 'key' })
    s.ellipse(50, 50, 1.6, 3, brass, { g: 'key' })
    if (!icon) {
      s.shadeLine(21, 50, 43, 50, 1)
      for (const [x, y] of [[14, 34], [10, 26]] as const) {
        s.circle(x, y, 1.6, dark, { g: `note${x}` })
        s.limb(x + 1.4, y, 0.5, x + 1.4, y - 5, 0.5, dark, { g: `note${x}` })
      }
    }
    if (back) return
    if (icon) {
      iconEye(s, p, 29, 43, 'glow')
      iconEye(s, p, 35, 43, 'glow')
      return
    }
    s.stamp(p.stamp(['WW..WW', 'WL..WL']), 27, 42)
  },
}

const phantorgan: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const wood = p.m('mid')
    const pipe = p.ramp('WLLD')
    const dark = p.m('deep')
    const keys = p.m('white')
    const back = s.back
    const icon = s.icon
    // A row of pipes, tallest in the middle.
    const xs = [12, 18, 24, 30, 36, 42, 48, 54]
    xs.forEach((x, i) => {
      const top = 6 + Math.abs(i - 3.5) * 4
      s.squircle(x, (top + 34) / 2, 2.6, (34 - top) / 2, 3, pipe, { g: `pipe${i}` })
      if (!icon) s.ellipse(x, top + 6, 1.4, 1, dark, { paint: true, onto: [`pipe${i}`] })
    })
    s.squircle(32, 46, 22, 13, 4, wood, { g: 'case' })
    if (!back) {
      s.squircle(32, 51, 18, 3, 4, keys, { g: 'keys' })
      if (!icon) for (let x = 16; x < 48; x += 4) s.shadeLine(x, 49, x, 53, 2)
    }
    if (back) return
    if (icon) {
      iconEye(s, p, 26, 41, 'glow')
      iconEye(s, p, 38, 41, 'glow')
      return
    }
    eye(s, p, 'glow44', 23, 38, { o: 'K', h: 'W' })
    eye(s, p, 'glow44', 36, 38, { o: 'K', h: 'W' })
  },
}

// ─── Wisps ────────────────────────────────────────────────────────────────

function wisp(s: Parameters<Recipe['draw']>[0], p: Parameters<Recipe['draw']>[1], cx: number, cy: number, r: number, g: string): void {
  const outer = p.m('glowMid')
  const core = p.m('glow')
  s.tube(
    [
      [cx + r * 0.3, cy + r * 0.6, r * 0.7],
      [cx + r * 1.4, cy + r * 1.3, r * 0.4],
      [cx + r * 2.1, cy + r * 1.1, r * 0.15],
    ],
    outer,
    { g: `${g}tail` },
  )
  flame(s, cx, cy, r, r * 2.6, outer, core, g)
}

const glimwisp: Recipe = {
  size: 'S',
  front: { dy: -8 },
  draw(s, p) {
    const back = s.back
    const icon = s.icon
    wisp(s, p, 30, 46, 7, 'w')
    if (back) return
    if (icon) {
      iconEye(s, p, 28, 46)
      iconEye(s, p, 33, 46)
      return
    }
    eye(s, p, 'dot3', 26, 45)
    eye(s, p, 'dot3', 32, 45)
  },
}

const gloomwisp: Recipe = {
  size: 'M',
  front: { dy: -6 },
  draw(s, p) {
    const back = s.back
    const icon = s.icon
    wisp(s, p, 18, 26, 3, 'a')
    wisp(s, p, 46, 22, 3, 'b')
    wisp(s, p, 32, 42, 10, 'w')
    if (back) return
    if (icon) {
      iconEye(s, p, 29, 42)
      iconEye(s, p, 35, 42)
      return
    }
    eye(s, p, 'fierce54', 25, 40, { i: 'L' })
    eye(s, p, 'fierce54', 33, 40, { i: 'L' })
  },
}

const grimwisp: Recipe = {
  size: 'L',
  front: { dy: -4 },
  draw(s, p) {
    const dark = p.m('black')
    const back = s.back
    const icon = s.icon
    for (const [x, y] of [
      [10, 30],
      [54, 26],
      [16, 52],
      [50, 50],
    ] as const)
      wisp(s, p, x, y, 2.6, `o${x}`)
    wisp(s, p, 32, 34, 14, 'w')
    // A hood of shadow over the flame.
    s.poly(
      [
        [18, 30],
        [24, 14],
        [32, 8],
        [40, 14],
        [46, 30],
        [40, 26],
        [24, 26],
      ],
      dark,
      { g: 'hood', bevel: 2 },
    )
    if (back) return
    if (icon) {
      iconEye(s, p, 28, 32, 'glow')
      iconEye(s, p, 36, 32, 'glow')
      return
    }
    eye(s, p, 'glow44', 24, 29, { o: 'K', h: 'W' })
    eye(s, p, 'glow44', 35, 29, { o: 'K', h: 'W' })
    // The grin.
    s.stamp(p.stamp(['K........K', '.KWKWKWKK.', '..KKKKKK..']), 27, 37)
  },
}

// ─── Tarsiers ─────────────────────────────────────────────────────────────

const tarsight: Recipe = {
  size: 'S',
  draw(s, p) {
    const fur = p.m('mid')
    const twig = p.m('dark')
    const back = s.back
    const icon = s.icon
    s.limb(6, 57, 1.6, 60, 54, 1.6, twig, { g: 'twig' })
    s.tube(
      [
        [38, 52, 1],
        [44, 58, 0.9],
        [48, 61, 0.6],
      ],
      fur,
      { g: 'tail', under: true },
    )
    s.ellipse(33, 48, 7, 8, fur, { g: 'body' })
    s.limb(28, 50, 1.4, 26, 55, 1.2, fur, { g: 'hand' })
    s.limb(37, 52, 1.6, 38, 55, 1.4, fur, { g: 'foot' })
    s.circle(31, 35, 9, fur, { g: 'head' })
    s.circle(24, 27, 3, fur, { g: 'ear1' })
    s.circle(38, 27, 3, fur, { g: 'ear2' })
    if (back) return
    if (icon) {
      iconEye(s, p, 27, 35, 'glow')
      iconEye(s, p, 35, 35, 'glow')
      return
    }
    eye(s, p, 'big66', 22, 31)
    eye(s, p, 'big66', 33, 31)
    s.stamp(p.stamp(['KK']), 30, 39)
  },
}

const tarseer: Recipe = {
  size: 'M',
  draw(s, p) {
    const fur = p.m('mid')
    const robe = p.m('dark')
    const gem = p.m('glow')
    const twig = p.m('deep')
    const back = s.back
    const icon = s.icon
    s.limb(4, 58, 1.8, 60, 58, 1.8, twig, { g: 'twig' })
    s.tube(
      [
        [42, 52, 1.4],
        [52, 50, 1.2],
        [58, 42, 1],
        [56, 36, 0.8],
      ],
      fur,
      { g: 'tail' },
    )
    s.ellipse(32, 47, 10, 10, robe, { g: 'body' })
    s.limb(24, 44, 1.6, 28, 50, 1.4, fur, { g: 'arm1' })
    s.limb(40, 44, 1.6, 36, 50, 1.4, fur, { g: 'arm2' })
    s.circle(32, 29, 11, fur, { g: 'head' })
    s.circle(22, 20, 3.4, fur, { g: 'ear1' })
    s.circle(42, 20, 3.4, fur, { g: 'ear2' })
    if (back) return
    s.circle(32, 21, 2, gem, { paint: true, onto: ['head'] })
    if (icon) {
      iconEye(s, p, 27, 30, 'glow')
      iconEye(s, p, 37, 30, 'glow')
      return
    }
    eye(s, p, 'big66', 21, 26)
    eye(s, p, 'big66', 35, 26)
    s.stamp(p.stamp(['KK']), 31, 34)
  },
}

// ─── Cloud lambs ──────────────────────────────────────────────────────────

const nimblamb: Recipe = {
  size: 'S',
  draw(s, p) {
    const wool = p.ramp('WWWL', 'L', 'D')
    const face = p.m('mid')
    const back = s.back
    const icon = s.icon
    for (const x of [25, 30, 36, 41]) s.limb(x, 53, 1.3, x, 60, 1.2, face, { g: `leg${x}`, under: x === 30 || x === 41 })
    puff(
      s,
      [
        [27, 46, 6],
        [34, 43, 6.5],
        [40, 47, 5.6],
        [32, 51, 6],
        [24, 52, 4.6],
        [41, 53, 4.6],
      ],
      wool,
      { g: 'wool' },
    )
    s.ellipse(20, 44, 5, 5.5, face, { g: 'head' })
    s.ellipse(16, 41, 3, 1.6, face, { g: 'ear', rot: 30 })
    puff(s, [[21, 38, 3], [25, 39, 2.6]], wool, { g: 'tuft' })
    if (back) return
    if (icon) {
      iconEye(s, p, 18, 44)
      return
    }
    eye(s, p, 'sleepy53', 15, 43)
  },
}

const cumulamb: Recipe = {
  size: 'L',
  front: { dy: -6 },
  draw(s, p) {
    const wool = p.ramp('WWWL', 'L', 'D')
    const face = p.m('mid')
    const star = p.m('glow')
    const back = s.back
    const icon = s.icon
    puff(
      s,
      [
        [16, 40, 9],
        [27, 32, 11],
        [40, 30, 11],
        [50, 38, 9],
        [33, 44, 11],
        [20, 50, 7],
        [46, 50, 7],
      ],
      wool,
      { g: 'wool' },
    )
    for (const x of [24, 34, 42]) s.limb(x, 54, 1.6, x, 60, 1.4, face, { g: `leg${x}`, under: true })
    s.ellipse(13, 32, 7, 7.5, face, { g: 'head' })
    s.ellipse(8, 27, 4, 2, face, { g: 'ear', rot: 30 })
    puff(s, [[14, 24, 4], [19, 25, 3.6]], wool, { g: 'tuft' })
    if (!icon) for (const [x, y] of [[56, 18], [6, 50]] as const) s.circle(x, y, 1.6, star, { g: `star${x}` })
    if (back) return
    if (icon) {
      iconEye(s, p, 11, 32)
      return
    }
    eye(s, p, 'sleepy53', 7, 30)
  },
}

// ─── Ermines ──────────────────────────────────────────────────────────────

const ermlet: Recipe = {
  size: 'S',
  draw(s, p) {
    const fur = p.m('white')
    const tip = p.m('black')
    const back = s.back
    const icon = s.icon
    const tail: P3[] = [
      [42, 50, 2],
      [50, 46, 1.8],
      [55, 40, 1.6],
    ]
    s.tube(tail, fur, { g: 'tail' })
    s.circle(56, 38, 2.4, tip, { g: 'tip' })
    s.limb(28, 52, 1.6, 26, 59, 1.4, fur, { g: 'lf' })
    s.limb(40, 52, 1.6, 41, 59, 1.4, fur, { g: 'lh', under: true })
    s.tube(
      [
        [42, 50, 4.5],
        [34, 49, 4.8],
        [26, 46, 4.4],
      ],
      fur,
      { g: 'body' },
    )
    s.ellipse(20, 40, 6, 5, fur, { g: 'head' })
    s.circle(22, 34.5, 1.8, fur, { g: 'ear' })
    if (back) return
    if (icon) {
      iconEye(s, p, 18, 39)
      return
    }
    eye(s, p, 'dot3', 17, 38)
    s.stamp(p.stamp(['K']), 14, 42)
  },
}

const erminarch: Recipe = {
  size: 'M',
  draw(s, p) {
    const fur = p.m('white')
    const tip = p.m('black')
    const crest = p.m('glowMid')
    const back = s.back
    const icon = s.icon
    s.tube(
      [
        [44, 44, 2.6],
        [53, 40, 2.4],
        [58, 32, 2],
      ],
      fur,
      { g: 'tail' },
    )
    s.circle(58.5, 29.5, 3, tip, { g: 'tip' })
    s.limb(26, 48, 2, 23, 59, 1.6, fur, { g: 'lf' })
    s.limb(40, 48, 2, 42, 59, 1.6, fur, { g: 'lh', under: true })
    s.tube(
      [
        [44, 44, 6],
        [34, 43, 6.5],
        [24, 38, 5.5],
      ],
      fur,
      { g: 'body' },
    )
    // A royal ruff spotted with black.
    s.ellipse(25, 38, 8, 5, fur, { g: 'ruff' })
    if (!icon) for (const [x, y] of [[21, 37], [26, 40], [30, 37]] as const) s.stamp(p.stamp(['K', 'K']), x, y)
    s.ellipse(18, 28, 6.5, 5.5, fur, { g: 'head' })
    s.circle(21, 22.5, 2, fur, { g: 'ear' })
    s.poly(
      [
        [15, 23],
        [17, 18],
        [19, 21],
        [21, 17],
        [23, 22],
      ],
      crest,
      { g: 'crown', bevel: 0.5 },
    )
    if (back) return
    if (icon) {
      iconEye(s, p, 16, 27)
      return
    }
    eye(s, p, 'narrow53', 12, 26)
    s.stamp(p.stamp(['K']), 12, 31)
  },
}

const glaciox: Recipe = {
  size: 'L',
  draw(s, p) {
    const coat = p.m('mid')
    const ice = p.ramp('WWLD', 'D', 'K')
    const dark = p.m('deep')
    const back = s.back
    const icon = s.icon
    for (const [x, g, u] of [
      [22, 'l1', false],
      [30, 'l2', true],
      [42, 'l3', false],
      [50, 'l4', true],
    ] as const)
      s.limb(x, 48, 3, x, 59, 2.6, dark, { g, under: u })
    s.ellipse(36, 40, 20, 13, coat, { g: 'body' })
    // A shaggy skirt of fur.
    if (!icon) for (let x = 20; x < 54; x += 4) s.limb(x, 48, 1.6, x - 1, 54, 1, coat, { g: `shag${x}` })
    s.ellipse(16, 38, 8, 8, coat, { g: 'head' })
    s.tube(
      [
        [14, 31, 2.6],
        [8, 30, 2.2],
        [5, 36, 1.6],
        [7, 41, 0.8],
      ],
      ice,
      { g: 'horn1' },
    )
    s.tube(
      [
        [20, 31, 2.6],
        [26, 28, 2.2],
        [29, 34, 1.6],
        [27, 39, 0.8],
      ],
      ice,
      { g: 'horn2' },
    )
    if (!icon) for (const x of [24, 34, 44]) s.poly([[x - 1.5, 27], [x + 1.5, 27], [x, 22]], ice, { g: `cicle${x}` })
    if (back) return
    if (icon) {
      iconEye(s, p, 14, 39, 'glow')
      return
    }
    eye(s, p, 'narrow53', 10, 38, { i: 'L' })
  },
}

// ─── Drakes ───────────────────────────────────────────────────────────────

const hoardling: Recipe = {
  size: 'S',
  draw(s, p) {
    const scale = p.m('mid')
    const belly = p.m('pale')
    const coin = p.m('glowMid')
    const wing = p.m('dark')
    const back = s.back
    const icon = s.icon
    // A little hoard to sit on.
    for (const [x, y] of [
      [20, 58],
      [27, 59],
      [34, 58],
      [41, 59],
      [24, 55],
      [31, 55],
      [38, 55],
    ] as const)
      s.ellipse(x, y, 4, 1.6, coin, { g: `c${x}${y}` })
    s.tube(
      [
        [40, 50, 3],
        [48, 51, 2.2],
        [53, 46, 1.2],
      ],
      scale,
      { g: 'tail' },
    )
    s.poly(
      [
        [36, 40],
        [48, 30],
        [46, 40],
        [40, 44],
      ],
      wing,
      { g: 'wing', bevel: 1 },
    )
    s.ellipse(32, 47, 9, 8, scale, { g: 'body' })
    if (!back) s.ellipse(30, 49, 5, 5.5, belly, { paint: true, onto: ['body'] })
    s.circle(24, 36, 7.5, scale, { g: 'head' })
    s.limb(27, 30, 1.4, 31, 25, 0.6, belly, { g: 'horn' })
    if (back) return
    if (icon) {
      iconEye(s, p, 21, 35)
      return
    }
    eye(s, p, 'round56', 18, 32)
    s.stamp(p.stamp(['K']), 17, 40)
    s.line(18, 41, 21, 42, p.c('K'))
  },
}

const gildrake: Recipe = {
  size: 'M',
  draw(s, p) {
    const scale = p.m('mid')
    const belly = p.m('pale')
    const wing = p.m('dark')
    const back = s.back
    const icon = s.icon
    const legs = (far: boolean) => {
      if (far) {
        s.limb(26, 46, 2.4, 25, 59, 2, scale, { g: 'lf2', under: true })
        s.limb(40, 46, 2.6, 42, 59, 2.1, scale, { g: 'lh2', under: true })
      } else {
        s.limb(22, 46, 2.6, 19, 59.5, 2.2, scale, { g: 'lf1' })
        s.ellipse(37, 46, 5, 6, scale, { g: 'lh1' })
        s.limb(37, 50, 2.4, 36, 59.5, 2.1, scale, { g: 'lh1' })
      }
    }
    const body = () => {
      s.tube(
        [
          [42, 44, 4],
          [52, 46, 3],
          [60, 40, 1.6],
        ],
        scale,
        { g: 'tail' },
      )
      s.ellipse(31, 41, 12, 7.5, scale, { g: 'body' })
      if (!back) s.ellipse(28, 45, 8, 3, belly, { paint: true, onto: ['body'] })
      s.poly(
        [
          [32, 34],
          [44, 18],
          [50, 24],
          [44, 34],
        ],
        wing,
        { g: 'wing', bevel: 1 },
      )
    }
    const head = () => {
      s.tube(
        [
          [24, 38, 4],
          [19, 30, 3.4],
          [16, 24, 3],
        ],
        scale,
        { g: 'neck' },
      )
      s.ellipse(13, 22, 6, 4.5, scale, { g: 'head' })
      s.limb(16, 18, 1.4, 22, 12, 0.6, belly, { g: 'horn1' })
      s.limb(13, 18, 1.2, 15, 12, 0.6, belly, { g: 'horn2' })
    }
    if (back) {
      head()
      legs(true)
      body()
      legs(false)
      return
    }
    legs(true)
    body()
    legs(false)
    head()
    if (icon) {
      iconEye(s, p, 11, 21)
      return
    }
    eye(s, p, 'fierce54', 8, 19)
    s.line(4, 25, 10, 25, p.c('K'))
  },
}

const aurigon: Recipe = {
  size: 'L',
  draw(s, p) {
    const scale = p.m('mid')
    const belly = p.m('pale')
    const wing = p.m('dark')
    const back = s.back
    const icon = s.icon
    const wings = (far: boolean) => {
      const pts: [number, number][] = far
        ? [
            [38, 30],
            [60, 4],
            [63, 16],
            [58, 26],
            [48, 34],
          ]
        : [
            [32, 30],
            [8, 6],
            [4, 18],
            [12, 30],
            [28, 38],
          ]
      s.poly(pts, wing, { g: far ? 'w2' : 'w1', bevel: 2, under: far })
      if (!icon) for (let k = 0; k < 3; k++) s.shadeLine(far ? 42 + k * 5 : 28 - k * 6, 32 - k * 2, far ? 58 : 8, far ? 8 + k * 6 : 10 + k * 6, 1)
    }
    const legs = () => {
      s.limb(28, 46, 3.4, 26, 59, 2.6, scale, { g: 'leg1' })
      s.limb(38, 46, 3.4, 40, 59, 2.6, scale, { g: 'leg2', under: true })
    }
    const body = () => {
      s.tube(
        [
          [40, 48, 4.6],
          [50, 54, 3.6],
          [58, 56, 2],
        ],
        scale,
        { g: 'tail' },
      )
      s.ellipse(33, 38, 11, 13, scale, { g: 'body' })
      if (!back) s.ellipse(30, 41, 6.5, 9, belly, { paint: true, onto: ['body'] })
    }
    const head = () => {
      s.ellipse(24, 18, 7.5, 6, scale, { g: 'head' })
      s.tube(
        [
          [26, 14, 1.6],
          [32, 8, 1.2],
          [38, 8, 0.6],
        ],
        belly,
        { g: 'horn1' },
      )
      s.tube(
        [
          [22, 13, 1.4],
          [24, 6, 1],
          [28, 3, 0.5],
        ],
        belly,
        { g: 'horn2' },
      )
      if (!back) s.ellipse(17, 21, 4, 3, scale, { g: 'snout' })
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
      iconEye(s, p, 22, 17)
      return
    }
    eye(s, p, 'fierce54', 18, 15, { i: 'L' })
    s.line(13, 23, 19, 23, p.c('K'))
  },
}

// ─── Alpaca ───────────────────────────────────────────────────────────────

const alpacka: Recipe = {
  size: 'M',
  draw(s, p) {
    const wool = p.ramp('WWLL', 'D', 'K')
    const face = p.m('light')
    const bag = p.m('dark')
    const back = s.back
    const icon = s.icon
    for (const [x, g, u] of [
      [24, 'l1', false],
      [29, 'l2', true],
      [40, 'l3', false],
      [45, 'l4', true],
    ] as const)
      s.limb(x, 48, 2, x, 59.5, 1.7, face, { g, under: u })
    puff(
      s,
      [
        [26, 42, 7],
        [35, 40, 8],
        [44, 43, 7],
        [33, 47, 7],
      ],
      wool,
      { g: 'body' },
    )
    // Saddle bags.
    s.squircle(36, 46, 6, 5, 3, bag, { g: 'bag' })
    if (!icon) s.shadeLine(31, 44, 41, 44, -1)
    s.tube(
      [
        [22, 40, 4],
        [20, 30, 3.4],
        [19, 22, 3.2],
      ],
      wool,
      { g: 'neck' },
    )
    s.ellipse(16, 20, 5, 5, face, { g: 'head' })
    puff(s, [[17, 14, 3.4], [21, 15, 2.8]], wool, { g: 'tuft' })
    s.leaf(19, 16, 22, 10, 2, face, { g: 'ear' }, -0.2)
    if (back) return
    if (icon) {
      iconEye(s, p, 14, 19)
      return
    }
    eye(s, p, 'sleepy53', 11, 18)
    s.stamp(p.stamp(['K.K']), 10, 23)
  },
}

// ─── Coils ────────────────────────────────────────────────────────────────

const coilet: Recipe = {
  size: 'S',
  draw(s, p) {
    const copper = p.ramp('WLDD', 'K', 'K')
    const bulb = p.m('glow')
    const base = p.m('deep')
    const back = s.back
    const icon = s.icon
    s.squircle(32, 58, 8, 2.6, 3, base, { g: 'base' })
    for (let i = 0; i < 5; i++) s.ellipse(32, 54 - i * 3.6, 7.5, 2, copper, { g: `ring${i}` })
    s.limb(32, 37, 1.4, 32, 32, 1.4, base, { g: 'neck' })
    s.circle(32, 27, 6.5, bulb, { g: 'bulb' })
    if (!icon) for (const [x1, y1, x2, y2] of [[24, 22, 21, 19], [40, 22, 43, 19], [32, 19, 32, 15]]) s.line(x1, y1, x2, y2, p.c('D'))
    if (back) return
    if (icon) {
      iconEye(s, p, 30, 27)
      iconEye(s, p, 34, 27)
      return
    }
    eye(s, p, 'dot3', 28, 25)
    eye(s, p, 'dot3', 34, 25)
  },
}

const tesloom: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const copper = p.ramp('WLDD', 'K', 'K')
    const stone = p.m('light')
    const arc = p.m('glow')
    const back = s.back
    const icon = s.icon
    s.squircle(32, 55, 15, 6, 3, stone, { g: 'base' })
    if (!icon) for (const x of [22, 32, 42]) s.shadeLine(x, 50, x, 60, 1)
    for (let i = 0; i < 7; i++) s.ellipse(32, 46 - i * 3.6, 9 - i * 0.5, 2, copper, { g: `ring${i}` })
    s.ring(32, 14, 13, 5, 3.4, copper, { g: 'torus' })
    if (!icon) {
      for (const [x1, y1, x2, y2] of [[19, 12, 8, 4], [45, 12, 56, 6], [32, 9, 33, 1], [21, 17, 12, 22]]) {
        s.line(x1, y1, (x1 + x2) / 2 + 2, (y1 + y2) / 2 - 2, p.c('W'))
        s.line((x1 + x2) / 2 + 2, (y1 + y2) / 2 - 2, x2, y2, p.c('W'))
      }
      s.circle(32, 14, 3, arc, { g: 'core' })
    }
    if (back) return
    if (icon) {
      iconEye(s, p, 28, 52)
      iconEye(s, p, 36, 52)
      return
    }
    eye(s, p, 'narrow53', 24, 52)
    eye(s, p, 'narrow53', 35, 52)
  },
}

// ─── Plants ───────────────────────────────────────────────────────────────

const tulipop: Recipe = {
  size: 'M',
  draw(s, p) {
    const petal = p.m('mid')
    const leaf = p.m('light')
    const bulb = p.m('pale')
    const back = s.back
    const icon = s.icon
    s.ellipse(32, 56, 8, 5, bulb, { g: 'bulb' })
    s.limb(32, 52, 1.4, 32, 36, 1.4, leaf, { g: 'stem' })
    s.leaf(32, 48, 18, 40, 4, leaf, { g: 'l1' }, 0.4)
    s.leaf(32, 46, 46, 38, 4, leaf, { g: 'l2' }, -0.4)
    // The bloom: three cupped petals.
    s.leaf(32, 38, 22, 18, 7, petal, { g: 'p1' }, 0.3)
    s.leaf(32, 38, 42, 18, 7, petal, { g: 'p2' }, -0.3)
    s.squircle(32, 28, 8, 11, 2.4, petal, { g: 'p3' })
    if (back) return
    if (icon) {
      iconEye(s, p, 29, 28)
      iconEye(s, p, 35, 28)
      return
    }
    eye(s, p, 'round45', 26, 25)
    eye(s, p, 'round45', 34, 25)
    s.line(30, 33, 34, 33, p.c('K'))
  },
}

const shootling: Recipe = {
  size: 'S',
  draw(s, p) {
    const stalk = p.m('light')
    const node = p.m('mid')
    const leaf = p.m('mid')
    const back = s.back
    const icon = s.icon
    s.ellipse(27, 59, 3, 1.6, node, { g: 'f1' })
    s.ellipse(37, 59, 3, 1.6, node, { g: 'f2', under: true })
    s.squircle(32, 46, 7, 13, 3, stalk, { g: 'stalk' })
    for (const y of [40, 50]) s.ellipse(32, y, 7.4, 1.4, node, { paint: true, onto: ['stalk'] })
    s.poly(
      [
        [26, 34],
        [32, 22],
        [38, 34],
      ],
      stalk,
      { g: 'tip', bevel: 1 },
    )
    s.leaf(37, 38, 48, 32, 3, leaf, { g: 'l1' }, -0.3)
    s.leaf(27, 46, 16, 42, 3, leaf, { g: 'l2' }, 0.3)
    if (back) return
    if (icon) {
      iconEye(s, p, 29, 44)
      iconEye(s, p, 35, 44)
      return
    }
    eye(s, p, 'dot3', 28, 43)
    eye(s, p, 'dot3', 34, 43)
    s.line(30, 47, 33, 47, p.c('K'))
  },
}

const bambrawl: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const stalk = p.m('light')
    const node = p.m('mid')
    const band = p.m('dark')
    const back = s.back
    const icon = s.icon
    // A bamboo staff held across the body.
    s.limb(6, 50, 1.8, 56, 14, 1.8, node, { g: 'staff' })
    if (!icon) for (const t of [0.25, 0.5, 0.75]) s.shadePx(6 + 50 * t, 50 - 36 * t, 2)
    s.limb(27, 46, 3.4, 25, 59, 2.8, stalk, { g: 'leg1' })
    s.limb(37, 46, 3.4, 40, 59, 2.8, stalk, { g: 'leg2', under: true })
    s.squircle(32, 34, 10, 14, 3, stalk, { g: 'body' })
    for (const y of [28, 40]) s.ellipse(32, y, 10.5, 1.6, node, { paint: true, onto: ['body'] })
    s.limb(24, 30, 2.6, 18, 38, 2.2, stalk, { g: 'arm1' })
    s.limb(40, 30, 2.6, 44, 22, 2.2, stalk, { g: 'arm2' })
    s.circle(32, 14, 7.5, stalk, { g: 'head' })
    s.ellipse(32, 11, 8, 2, band, { paint: true, onto: ['head'] })
    s.leaf(38, 11, 48, 6, 2.2, node, { g: 'tie1' }, -0.2)
    s.leaf(38, 11, 46, 14, 2, node, { g: 'tie2' }, 0.2)
    if (back) return
    if (icon) {
      iconEye(s, p, 29, 15)
      iconEye(s, p, 35, 15)
      return
    }
    eye(s, p, 'fierce54', 25, 13)
    eye(s, p, 'fierce54', 33, 13)
    s.line(29, 20, 35, 20, p.c('K'))
  },
}

// ─── Legends ──────────────────────────────────────────────────────────────

const cuprion: Recipe = {
  size: 'L',
  draw(s, p) {
    const metal = p.ramp('WLDD', 'K', 'K')
    const mane = p.m('dark')
    const spark = p.m('glow')
    const back = s.back
    const icon = s.icon
    const legs = (far: boolean) => {
      if (far) {
        s.limb(24, 44, 3, 22, 59, 2.6, metal, { g: 'lf2', under: true })
        s.limb(46, 44, 3, 48, 59, 2.6, metal, { g: 'lh2', under: true })
      } else {
        s.limb(19, 44, 3.4, 15, 59.5, 2.8, metal, { g: 'lf1' })
        s.ellipse(42, 44, 6.5, 7.5, metal, { g: 'lh1' })
        s.limb(42, 48, 3, 42, 59.5, 2.6, metal, { g: 'lh1' })
      }
    }
    const body = () => {
      s.tube(
        [
          [48, 38, 2.4],
          [56, 34, 2],
          [60, 26, 1.6],
        ],
        metal,
        { g: 'tail' },
      )
      s.circle(60, 24, 3, spark, { g: 'tuft' })
      s.ellipse(33, 38, 16, 9, metal, { g: 'body' })
      if (!icon)
        for (const [x1, y1, x2, y2] of [
          [24, 34, 30, 34],
          [30, 34, 30, 40],
          [36, 36, 44, 36],
          [40, 36, 40, 42],
        ])
          s.line(x1, y1, x2, y2, p.c('K'))
    }
    const head = () => {
      // A mane of copper wire.
      for (let i = 0; i < 9; i++) {
        const a = (-150 + i * 30) * (Math.PI / 180)
        s.limb(18, 26, 2.4, 18 + Math.cos(a) * 14, 26 + Math.sin(a) * 14, 0.8, mane, { g: `m${i}` })
      }
      s.circle(16, 27, 8, metal, { g: 'head' })
      if (!back) s.ellipse(10, 30, 4.6, 3.6, metal, { g: 'snout' })
    }
    if (back) {
      head()
      legs(true)
      body()
      legs(false)
      return
    }
    legs(true)
    body()
    legs(false)
    head()
    if (icon) {
      iconEye(s, p, 14, 25, 'glow')
      return
    }
    eye(s, p, 'glow44', 11, 23, { o: 'K', h: 'W' })
    s.stamp(p.stamp(['KK']), 6, 29)
    s.line(7, 33, 12, 33, p.c('K'))
  },
}

const argentide: Recipe = {
  size: 'L',
  front: { dy: -2 },
  draw(s, p) {
    const scale = p.ramp('WWLD', 'D', 'K')
    const fin = p.m('mid')
    const moon = p.m('glow')
    const back = s.back
    const icon = s.icon
    const coil: P3[] = [[44, 58, 3], [54, 52, 4.4], [56, 40, 5], [48, 32, 5.4], [36, 34, 5.6], [30, 44, 5.4], [36, 52, 5], [26, 56, 4.4], [16, 50, 4.6], [14, 36, 4.6], [18, 22, 4.4]]
    s.tube(coil, scale, { g: 'body' }, 3)
    if (!icon) for (const [x, y] of [[56, 42], [44, 34], [32, 46], [16, 44]] as const) s.poly([[x, y - 4], [x + 6, y - 9], [x + 4, y - 2]], fin, { g: `fin${x}${y}`, bevel: 0.8 })
    s.ellipse(16, 17, 7, 5.5, scale, { g: 'head' })
    s.circle(17, 11, 2.6, moon, { g: 'moon' })
    if (!back) s.ellipse(9, 20, 4, 2.6, scale, { g: 'snout' })
    if (back) return
    if (icon) {
      iconEye(s, p, 13, 16)
      return
    }
    eye(s, p, 'iris45', 10, 14, { i: 'L' })
  },
}

const aurigryph: Recipe = {
  size: 'L',
  draw(s, p) {
    const fur = p.m('mid')
    const feather = p.m('light')
    const beak = p.m('pale')
    const halo = p.m('glow')
    const back = s.back
    const icon = s.icon
    if (!icon) s.ring(26, 18, 13, 13, 1.6, halo, { g: 'halo', line: false })
    const wings = (far: boolean) => {
      const pts: [number, number][] = far
        ? [
            [38, 30],
            [58, 6],
            [63, 14],
            [56, 30],
          ]
        : [
            [34, 32],
            [52, 2],
            [60, 8],
            [50, 32],
          ]
      s.poly(pts, feather, { g: far ? 'w2' : 'w1', bevel: 2, under: far })
      if (!icon) for (let k = 0; k < 3; k++) s.shadeLine(far ? 44 + k * 4 : 40 + k * 4, 30, far ? 56 + k : 52 + k * 2, 10 + k * 5, 1)
    }
    const legs = () => {
      s.limb(24, 46, 3, 20, 59, 2.4, feather, { g: 'lf' })
      s.limb(42, 46, 3.4, 44, 59, 2.8, fur, { g: 'lh', under: true })
    }
    const body = () => {
      s.tube(
        [
          [46, 42, 2],
          [54, 46, 1.6],
          [58, 52, 1.2],
        ],
        fur,
        { g: 'tail' },
      )
      s.ellipse(33, 40, 13, 8, fur, { g: 'body' })
    }
    const head = () => {
      s.ellipse(24, 30, 7, 9, feather, { g: 'chest' })
      s.circle(24, 18, 7, feather, { g: 'head' })
      if (!back)
        s.poly(
          [
            [18, 16],
            [10, 22],
            [18, 23],
          ],
          beak,
          { g: 'beak', bevel: 0.8 },
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
      iconEye(s, p, 21, 16)
      return
    }
    eye(s, p, 'fierce54', 18, 14, { i: 'L' })
  },
}

const solidus: Recipe = {
  size: 'L',
  front: { dy: -2 },
  draw(s, p) {
    const gold = p.m('glowMid')
    const scale = p.m('mid')
    const belly = p.m('pale')
    const back = s.back
    const icon = s.icon
    // The great coin it coils around.
    s.circle(34, 32, 20, gold, { g: 'coin', flat: 0 })
    s.ring(34, 32, 20, 20, 2, scale, { g: 'rim', line: false })
    if (!icon) {
      s.ring(34, 32, 13, 13, 0.8, scale, { g: 'inner', line: false })
      for (let a = 0; a < 360; a += 30) s.shadePx(34 + Math.cos((a * Math.PI) / 180) * 17, 32 + Math.sin((a * Math.PI) / 180) * 17, 1)
    }
    const coil: P3[] = [[56, 58, 2], [50, 54, 3.6], [40, 56, 4.4], [26, 54, 4.6], [14, 46, 4.6], [10, 32, 4.4], [14, 18, 4]]
    s.tube(coil, scale, { g: 'body' }, 3)
    if (!back) s.tube(coil.map(([x, y, r]) => [x, y + r * 0.3, r * 0.5] as const), belly, { g: 'belly', paint: true, onto: ['body'] }, 3)
    s.ellipse(17, 13, 7, 5.5, scale, { g: 'head' })
    s.poly(
      [
        [12, 9],
        [14, 3],
        [17, 7],
        [20, 2],
        [22, 8],
      ],
      gold,
      { g: 'crown', bevel: 0.5 },
    )
    if (!back) s.ellipse(10, 16, 4, 2.6, scale, { g: 'snout' })
    if (back) return
    if (icon) {
      iconEye(s, p, 15, 12)
      return
    }
    eye(s, p, 'iris45', 12, 10, { i: 'L' })
  },
}

export const MYSTIC_RECIPES = {
  musebox,
  phantorgan,
  glimwisp,
  gloomwisp,
  grimwisp,
  tarsight,
  tarseer,
  nimblamb,
  cumulamb,
  ermlet,
  erminarch,
  glaciox,
  hoardling,
  gildrake,
  aurigon,
  alpacka,
  coilet,
  tesloom,
  tulipop,
  shootling,
  bambrawl,
  cuprion,
  argentide,
  aurigryph,
  solidus,
}
