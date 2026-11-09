/**
 * Shore, sea and pond critters:
 * CORKRAB → GALLEOCRAB (bottle crabs), JELLAMP → LUMEDUSA (lamp jellies),
 * TERNLET → TERNADO (terns), PUNCHRIMP, PIKELET → LANCEPIKE (pike),
 * SKIMMET, DARTLET → DARTOAD (dart frogs), PLACOJAW → DUNKMAW (fossil fish).
 */
import type { P3 } from '../canvas'
import { eye, iconEye, type Recipe } from '../kit'
import { finFan } from '../parts'
import type { Ramp } from '../color'

/** A fin fanned out from (bx, by) between angles a0 and a1 (degrees, 0 = right), n spines of length len. */
function fan(s: Parameters<Recipe['draw']>[0], bx: number, by: number, a0: number, a1: number, n: number, len: number, _r0: number, web: Ramp, g: string): void {
  const tips: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / Math.max(1, n - 1)) * Math.PI) / 180
    tips.push([bx + Math.cos(a) * len, by + Math.sin(a) * len])
  }
  finFan(s, bx, by, tips, web, web, g)
}

// ─── Bottle crabs ─────────────────────────────────────────────────────────

const corkrab: Recipe = {
  size: 'S',
  draw(s, p) {
    const glass = p.ramp('WWLD', 'D', 'D')
    const cork = p.m('dark')
    const shell = p.m('mid')
    const back = s.back
    const icon = s.icon
    const bottle = () => {
      s.squircle(38, 50, 13, 8, 2.6, glass, { g: 'bottle' })
      s.limb(24, 50, 4, 18, 50, 3.4, glass, { g: 'neck' })
      s.ellipse(17.5, 50, 1.6, 3.3, cork, { g: 'cork' })
      if (!icon) s.shadeLine(30, 45, 44, 45, -1)
    }
    const crab = () => {
      s.ellipse(14, 53, 5, 4, shell, { g: 'crab' })
      s.circle(9, 47, 3, shell, { g: 'claw1' })
      s.circle(16, 45.5, 2.6, shell, { g: 'claw2' })
      s.limb(12, 49, 0.8, 11, 44, 0.6, shell, { g: 'stalk1' })
      s.limb(15, 49, 0.8, 16, 42, 0.6, shell, { g: 'stalk2' })
      for (const x of [11, 14, 17]) s.limb(x, 56, 0.8, x - 2, 60, 0.5, shell, { g: `leg${x}` })
    }
    if (back) {
      crab()
      bottle()
      return
    }
    bottle()
    crab()
    if (icon) {
      iconEye(s, p, 11, 43)
      return
    }
    s.stamp(p.stamp(['KK', 'KW']), 10, 42)
    s.stamp(p.stamp(['KK', 'KW']), 15, 40)
  },
}

const galleocrab: Recipe = {
  size: 'L',
  front: { k: 0.88 },
  draw(s, p) {
    const hull = p.m('dark')
    const shell = p.m('mid')
    const sail = p.m('pale')
    const back = s.back
    const icon = s.icon
    const legs = () => {
      for (const [x, tx] of [
        [24, 16],
        [30, 24],
        [40, 44],
        [46, 54],
      ] as const)
        s.tube(
          [
            [x, 50, 1.6],
            [(x + tx) / 2, 54, 1.4],
            [tx, 60, 1],
          ],
          shell,
          { g: `leg${x}`, under: true },
        )
    }
    const ship = () => {
      s.limb(36, 34, 1.2, 36, 6, 1, hull, { g: 'mast' })
      s.poly(
        [
          [37, 8],
          [52, 14],
          [50, 28],
          [37, 26],
        ],
        sail,
        { g: 'sail', bevel: 1 },
      )
      if (!icon) s.shadeLine(40, 12, 46, 26, 1)
      s.blob(
        [
          [12, 34],
          [56, 32],
          [52, 48],
          [18, 50],
        ],
        hull,
        { g: 'hull', bevel: 3 },
      )
      if (!icon) for (const y of [38, 42, 46]) s.shadeLine(15, y, 53, y - 1, -1)
    }
    const claws = () => {
      s.limb(18, 46, 3, 10, 40, 2.6, shell, { g: 'arm1' })
      s.ellipse(7, 36, 6, 4.4, shell, { g: 'claw1', rot: -30 })
      if (!icon)
        s.poly(
          [
            [2, 33],
            [6, 37],
            [1, 38],
          ],
          shell,
          { cut: true },
        )
    }
    const face = () => {
      s.limb(21, 34, 1, 19, 26, 0.8, shell, { g: 'stalk1' })
      s.limb(26, 34, 1, 27, 25, 0.8, shell, { g: 'stalk2' })
    }
    if (back) {
      face()
      legs()
      ship()
      claws()
      return
    }
    legs()
    face()
    ship()
    claws()
    if (icon) {
      iconEye(s, p, 19, 24)
      return
    }
    s.stamp(p.stamp(['KKK', 'KWK', 'KKK']), 17.5, 23)
    s.stamp(p.stamp(['KKK', 'KWK', 'KKK']), 25.5, 22)
  },
}

// ─── Lamp jellies ─────────────────────────────────────────────────────────

function tentacles(s: Parameters<Recipe['draw']>[0], m: ReturnType<Parameters<Recipe['draw']>[1]['m']>, xs: number[], y0: number, len: number): void {
  xs.forEach((x, i) =>
    s.tube(
      [
        [x, y0, 1.1],
        [x + (i % 2 ? 2 : -2), y0 + len * 0.4, 0.9],
        [x + (i % 2 ? -1 : 1), y0 + len * 0.75, 0.7],
        [x + (i % 2 ? 1 : -1), y0 + len, 0.5],
      ],
      m,
      { g: `t${i}`, under: true },
    ),
  )
}

const jellamp: Recipe = {
  size: 'S',
  front: { dy: -6 },
  draw(s, p) {
    const bell = p.ramp('WLLD', 'D', 'K')
    const bulb = p.m('glow')
    const tent = p.m('mid')
    const back = s.back
    const icon = s.icon
    tentacles(s, tent, [24, 29, 35, 40], 46, 14)
    s.ellipse(32, 38, 12, 10, bell, { g: 'bell' })
    s.ellipse(32, 46, 12, 2.2, tent, { g: 'rim' })
    if (!back) s.circle(32, 40, 4.5, bulb, { paint: true, onto: ['bell'] })
    if (back) return
    if (icon) {
      iconEye(s, p, 28, 36)
      iconEye(s, p, 35, 36)
      return
    }
    eye(s, p, 'dot3', 26, 34)
    eye(s, p, 'dot3', 36, 34)
  },
}

const lumedusa: Recipe = {
  size: 'L',
  front: { k: 0.86, dy: -4 },
  draw(s, p) {
    const bell = p.ramp('WLLD', 'D', 'K')
    const bulb = p.m('glow')
    const tent = p.m('mid')
    const back = s.back
    const icon = s.icon
    tentacles(s, tent, [16, 22, 28, 36, 42, 48], 38, 22)
    s.ellipse(32, 26, 20, 15, bell, { g: 'bell' })
    s.ellipse(32, 38, 20, 3, tent, { g: 'rim' })
    // A crown of little lamps.
    for (const [x, y] of [
      [18, 14],
      [26, 9],
      [38, 9],
      [46, 14],
    ] as const) {
      s.limb(x, y + 3, 0.6, x, y + 6, 0.6, tent, { g: `stem${x}` })
      s.circle(x, y, 2.6, bulb, { g: `lamp${x}` })
    }
    if (!back) s.circle(32, 28, 6, bulb, { paint: true, onto: ['bell'] })
    if (back) return
    if (icon) {
      iconEye(s, p, 26, 24)
      iconEye(s, p, 38, 24)
      return
    }
    eye(s, p, 'round45', 22, 21)
    eye(s, p, 'round45', 38, 21)
  },
}

// ─── Terns ────────────────────────────────────────────────────────────────

const ternlet: Recipe = {
  size: 'S',
  draw(s, p) {
    const white = p.m('white')
    const cap = p.m('deep')
    const wing = p.m('light')
    const beak = p.m('mid')
    const back = s.back
    const icon = s.icon
    s.limb(31, 55, 0.8, 30, 60, 0.7, beak, { g: 'leg1' })
    s.limb(35, 55, 0.8, 36, 60, 0.7, beak, { g: 'leg2', under: true })
    s.poly(
      [
        [40, 48],
        [56, 42],
        [50, 48],
        [57, 51],
        [41, 53],
      ],
      wing,
      { g: 'tail', bevel: 0.8 },
    )
    s.ellipse(33, 48, 10, 7.5, white, { g: 'body' })
    s.ellipse(37, 46, 9, 4, wing, { g: 'wing', rot: -15 })
    s.circle(23, 40, 6.5, white, { g: 'head' })
    s.ellipse(25, 36, 6, 3.6, cap, { paint: true, onto: ['head'] })
    if (!back)
      s.poly(
        [
          [18, 40],
          [7, 43],
          [18, 44],
        ],
        beak,
        { g: 'beak', bevel: 0.8 },
      )
    if (back) return
    if (icon) {
      iconEye(s, p, 21, 38)
      return
    }
    eye(s, p, 'dot3', 20, 37)
  },
}

const ternado: Recipe = {
  size: 'L',
  front: { dy: -4 },
  draw(s, p) {
    const white = p.m('white')
    const cap = p.m('deep')
    const wing = p.m('light')
    const gust = p.ramp('WWLL', 'L', 'D')
    const beak = p.m('mid')
    const back = s.back
    const icon = s.icon
    // A spiral of wind and spray under it.
    if (!icon)
      for (let k = 0; k < 3; k++)
        s.ring(32, 56 - k * 2, 14 - k * 4, 3 - k * 0.6, 1.4, gust, { g: `gust${k}`, line: false })
    const wings = (far: boolean) => {
      const pts: [number, number][] = far
        ? [
            [36, 30],
            [60, 10],
            [62, 18],
            [46, 36],
          ]
        : [
            [30, 32],
            [4, 16],
            [2, 24],
            [22, 40],
          ]
      s.poly(pts, wing, { g: far ? 'w2' : 'w1', bevel: 1.5, under: far })
      if (!icon) s.shadeLine(far ? 44 : 22, far ? 30 : 34, far ? 58 : 6, far ? 14 : 20, 1)
    }
    const body = () => {
      s.ellipse(33, 36, 10, 9, white, { g: 'body' })
      s.poly(
        [
          [40, 38],
          [54, 46],
          [48, 44],
          [52, 52],
          [40, 42],
        ],
        wing,
        { g: 'tail', bevel: 0.8 },
      )
    }
    const head = () => {
      s.circle(23, 26, 7, white, { g: 'head' })
      s.ellipse(25, 22, 6.5, 4, cap, { paint: true, onto: ['head'] })
      if (!back)
        s.poly(
          [
            [17, 26],
            [4, 30],
            [17, 31],
          ],
          beak,
          { g: 'beak', bevel: 0.8 },
        )
    }
    if (back) {
      head()
      body()
      wings(true)
      wings(false)
      return
    }
    wings(true)
    body()
    head()
    wings(false)
    if (icon) {
      iconEye(s, p, 21, 24)
      return
    }
    eye(s, p, 'fierce54', 17, 22, { i: 'L' })
  },
}

// ─── Mantis shrimp ────────────────────────────────────────────────────────

const punchrimp: Recipe = {
  size: 'M',
  draw(s, p) {
    const shell = p.m('mid')
    const plate = p.m('light')
    const club = p.m('dark')
    const back = s.back
    const icon = s.icon
    const tail = () => {
      const path: P3[] = [
        [36, 44, 5],
        [42, 52, 4.4],
        [48, 57, 3.4],
      ]
      s.tube(path, shell, { g: 'tail' })
      fan(s, 50, 58, 0, 70, 3, 6, 0.8, plate, 'fan')
      if (!icon) for (const k of [0, 1, 2]) s.shadeLine(35 + k * 5, 42 + k * 5, 40 + k * 5, 46 + k * 5, 1)
    }
    const legs = () => {
      for (const x of [30, 34, 38]) s.limb(x, 48, 1, x - 2, 59, 0.8, club, { g: `leg${x}`, under: true })
    }
    const body = () => {
      s.ellipse(31, 36, 8, 12, shell, { g: 'body', rot: 15 })
      if (!icon) for (const y of [30, 35, 40]) s.shadeLine(25, y, 36, y + 2, 1)
    }
    const arms = () => {
      s.limb(26, 30, 2, 18, 32, 1.6, shell, { g: 'arm1' })
      s.circle(14, 32, 4.4, club, { g: 'club1' })
      s.limb(31, 30, 1.8, 24, 24, 1.4, shell, { g: 'arm2' })
      s.circle(21, 21, 3.8, club, { g: 'club2' })
    }
    const head = () => {
      s.ellipse(27, 20, 5, 4.5, shell, { g: 'head' })
      s.limb(25, 17, 0.8, 22, 10, 0.7, shell, { g: 'stalk1' })
      s.limb(29, 17, 0.8, 30, 9, 0.7, shell, { g: 'stalk2' })
      s.circle(22, 9, 2.4, plate, { g: 'e1' })
      s.circle(30, 8, 2.4, plate, { g: 'e2' })
    }
    if (back) {
      head()
      legs()
      body()
      tail()
      return
    }
    tail()
    legs()
    body()
    head()
    arms()
    if (icon) {
      iconEye(s, p, 22, 9)
      iconEye(s, p, 30, 8)
      return
    }
    s.stamp(p.stamp(['KK', 'KK']), 21, 8)
    s.stamp(p.stamp(['KK', 'KK']), 29, 7)
  },
}

// ─── Pike ─────────────────────────────────────────────────────────────────

const pikelet: Recipe = {
  size: 'S',
  front: { dy: -8 },
  draw(s, p) {
    const scale = p.m('mid')
    const belly = p.m('pale')
    const fin = p.m('light')
    const back = s.back
    const icon = s.icon
    fan(s, 46, 46, -40, 40, 4, 8, 0.8, fin, 'tailfin')
    s.poly(
      [
        [30, 39],
        [38, 32],
        [40, 40],
      ],
      fin,
      { g: 'dorsal', bevel: 0.8 },
    )
    s.ellipse(32, 46, 14, 7, scale, { g: 'body' })
    if (!back) s.ellipse(30, 50, 10, 3, belly, { paint: true, onto: ['body'] })
    s.poly(
      [
        [30, 49],
        [26, 56],
        [34, 52],
      ],
      fin,
      { g: 'pec', bevel: 0.6 },
    )
    if (!icon) for (const x of [32, 37, 42]) s.shadeLine(x, 41, x - 2, 47, 1)
    if (back) return
    if (icon) {
      iconEye(s, p, 23, 44)
      return
    }
    eye(s, p, 'round56', 20, 41)
    s.line(18, 50, 21, 49, p.c('K'))
  },
}

const lancepike: Recipe = {
  size: 'L',
  front: { dy: -6 },
  draw(s, p) {
    const scale = p.m('mid')
    const belly = p.m('pale')
    const fin = p.m('light')
    const lance = p.m('dark')
    const back = s.back
    const icon = s.icon
    fan(s, 56, 40, -45, 45, 5, 10, 1, fin, 'tailfin')
    s.poly(
      [
        [40, 32],
        [50, 24],
        [50, 34],
      ],
      fin,
      { g: 'dorsal', bevel: 0.8 },
    )
    s.ellipse(34, 40, 21, 8, scale, { g: 'body' })
    if (!back) s.ellipse(32, 45, 15, 3, belly, { paint: true, onto: ['body'] })
    s.poly(
      [
        [16, 37],
        [0, 40],
        [16, 43],
      ],
      lance,
      { g: 'lance', bevel: 0.5 },
    )
    s.poly(
      [
        [30, 44],
        [24, 54],
        [36, 48],
      ],
      fin,
      { g: 'pec', bevel: 0.6 },
    )
    if (!icon) for (const x of [30, 36, 42, 48]) s.shadeLine(x, 34, x - 3, 42, 1)
    if (back) return
    if (icon) {
      iconEye(s, p, 21, 38)
      return
    }
    eye(s, p, 'fierce54', 18, 36)
    s.line(13, 42, 18, 42, p.c('K'))
  },
}

// ─── Pond skater ──────────────────────────────────────────────────────────

const skimmet: Recipe = {
  size: 'M',
  draw(s, p) {
    const body = p.m('mid')
    const leg = p.m('dark')
    const ripple = p.ramp('WWLL', 'L', 'L')
    const back = s.back
    const icon = s.icon
    if (!icon)
      for (const [x, w] of [
        [8, 6],
        [24, 5],
        [42, 5],
        [58, 6],
      ] as const)
        s.ring(x, 59, w, 1.4, 0.8, ripple, { g: `rip${x}`, line: false })
    for (const [x, y, tx, ty] of [
      [26, 46, 8, 58],
      [30, 47, 24, 58],
      [36, 47, 42, 58],
      [40, 46, 58, 58],
    ] as const)
      s.tube(
        [
          [x, y, 0.9],
          [(x + tx) / 2, y - 6, 0.8],
          [tx, ty, 0.6],
        ],
        leg,
        { g: `leg${x}` },
      )
    s.ellipse(36, 45, 10, 4, body, { g: 'body' })
    s.circle(24, 43, 4.5, body, { g: 'head' })
    s.limb(22, 40, 0.6, 16, 34, 0.5, leg, { g: 'ant1' })
    s.limb(24, 39, 0.6, 22, 32, 0.5, leg, { g: 'ant2' })
    if (back) return
    if (icon) {
      iconEye(s, p, 22, 42)
      return
    }
    eye(s, p, 'round45', 19, 40)
  },
}

// ─── Dart frogs ───────────────────────────────────────────────────────────

const dartlet: Recipe = {
  size: 'S',
  draw(s, p) {
    const skin = p.m('light')
    const spot = p.m('deep')
    const back = s.back
    const icon = s.icon
    s.ellipse(40, 55, 7, 5, skin, { g: 'leg2', under: true })
    s.ellipse(32, 52, 10, 7.5, skin, { g: 'body' })
    if (!icon)
      for (const [x, y, r] of [
        [33, 48, 2],
        [38, 52, 1.6],
        [29, 54, 1.4],
      ] as const)
        s.circle(x, y, r, spot, { paint: true, onto: ['body'] })
    s.ellipse(26, 56, 5, 4, skin, { g: 'leg1' })
    s.ellipse(22, 59.5, 4, 1.4, skin, { g: 'leg1' })
    s.circle(23, 46, 6, skin, { g: 'head' })
    s.circle(21, 41, 3, skin, { g: 'bump1' })
    s.circle(27, 41.5, 2.8, skin, { g: 'bump2' })
    if (back) return
    if (icon) {
      iconEye(s, p, 21, 41)
      return
    }
    eye(s, p, 'round45', 19, 39)
    s.line(17, 49, 23, 50, p.c('K'))
  },
}

const dartoad: Recipe = {
  size: 'M',
  draw(s, p) {
    const skin = p.m('light')
    const spot = p.m('deep')
    const throat = p.m('white')
    const back = s.back
    const icon = s.icon
    s.ellipse(44, 52, 9, 7, skin, { g: 'leg2', under: true })
    s.ellipse(34, 44, 15, 12, skin, { g: 'body' })
    if (!icon)
      for (const [x, y, r] of [
        [36, 37, 3],
        [44, 43, 2.4],
        [31, 46, 2],
        [40, 50, 2],
        [26, 38, 1.6],
      ] as const)
        s.circle(x, y, r, spot, { paint: true, onto: ['body'] })
    s.ellipse(24, 52, 8, 6, skin, { g: 'leg1' })
    s.ellipse(17, 59, 6, 2, skin, { g: 'leg1' })
    s.limb(20, 44, 3, 14, 52, 2.4, skin, { g: 'arm' })
    s.ellipse(20, 34, 10, 8, skin, { g: 'head' })
    if (!back) s.ellipse(17, 39, 7, 3, throat, { paint: true, onto: ['head'] })
    s.circle(16, 27, 3.6, skin, { g: 'bump1' })
    s.circle(25, 27.5, 3.4, skin, { g: 'bump2' })
    if (back) return
    if (icon) {
      iconEye(s, p, 16, 27)
      return
    }
    eye(s, p, 'fierce54', 13, 25, { i: 'L' })
    s.line(10, 36, 22, 37, p.c('K'))
  },
}

// ─── Fossil fish ──────────────────────────────────────────────────────────

const placojaw: Recipe = {
  size: 'M',
  front: { dy: -6 },
  draw(s, p) {
    const scale = p.m('mid')
    const plate = p.m('light')
    const fin = p.m('dark')
    const back = s.back
    const icon = s.icon
    fan(s, 50, 42, -40, 40, 4, 9, 0.8, fin, 'tailfin')
    s.ellipse(36, 42, 15, 8, scale, { g: 'body' })
    s.squircle(22, 40, 10, 9, 2.4, plate, { g: 'head' })
    if (!icon) {
      s.shadeLine(22, 32, 22, 48, 1)
      s.shadeLine(15, 40, 29, 40, 1)
    }
    if (!back)
      s.poly(
        [
          [12, 44],
          [22, 46],
          [14, 50],
        ],
        plate,
        { g: 'jaw', bevel: 0.6 },
      )
    if (back) return
    if (icon) {
      iconEye(s, p, 18, 37)
      return
    }
    eye(s, p, 'white45', 16, 34)
  },
}

const dunkmaw: Recipe = {
  size: 'L',
  front: { k: 0.88, dy: -4 },
  draw(s, p) {
    const scale = p.m('mid')
    const plate = p.m('light')
    const fin = p.m('dark')
    const mouth = p.m('black')
    const back = s.back
    const icon = s.icon
    fan(s, 58, 36, -45, 45, 5, 12, 1, fin, 'tailfin')
    s.poly(
      [
        [40, 28],
        [50, 18],
        [52, 30],
      ],
      fin,
      { g: 'dorsal', bevel: 1 },
    )
    s.ellipse(40, 38, 20, 11, scale, { g: 'body' })
    s.squircle(19, 36, 14, 13, 2.4, plate, { g: 'head' })
    if (!icon) for (const [x1, y1, x2, y2] of [[19, 24, 19, 48], [8, 34, 30, 34], [26, 26, 30, 46]]) s.shadeLine(x1, y1, x2, y2, 1)
    if (!back) {
      s.poly(
        [
          [6, 40],
          [26, 42],
          [24, 50],
          [8, 50],
        ],
        mouth,
        { g: 'mouth', bevel: 1 },
      )
      s.poly(
        [
          [5, 38],
          [28, 40],
          [10, 44],
        ],
        plate,
        { g: 'fang', bevel: 0.5 },
      )
    }
    if (back) return
    if (icon) {
      iconEye(s, p, 14, 31)
      return
    }
    eye(s, p, 'fierce54', 11, 28, { i: 'L' })
  },
}

export const WATER_RECIPES = {
  corkrab,
  galleocrab,
  jellamp,
  lumedusa,
  ternlet,
  ternado,
  punchrimp,
  pikelet,
  lancepike,
  skimmet,
  dartlet,
  dartoad,
  placojaw,
  dunkmaw,
}
