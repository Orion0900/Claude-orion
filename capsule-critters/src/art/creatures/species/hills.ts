/**
 * Hearth, hill and cave critters:
 * KETTLIN → SAMOVAR (kettles), COALPUP → COALYOTE (ember dogs),
 * BRICKLE → BULWARK (bricks), SETTLING → BADGRAPPLE (badgers),
 * WOMBALL → WOMBATANK (wombats), GILAGRIN, SCARABBLE → BOULDARAB (scarabs),
 * KIDGRUFF → BILLYGRUFF (goats).
 */
import type { P3 } from '../canvas'
import { eye, iconEye, type Recipe } from '../kit'
import { flame, puff } from '../parts'

// ─── Kettles ──────────────────────────────────────────────────────────────

const kettlin: Recipe = {
  size: 'S',
  draw(s, p) {
    const metal = p.ramp('WLDD', 'K', 'K')
    const dark = p.m('dark')
    const steam = p.ramp('WWWL', 'L', 'L')
    const back = s.back
    const icon = s.icon
    s.ellipse(27, 59, 3, 1.6, dark, { g: 'f1' })
    s.ellipse(37, 59, 3, 1.6, dark, { g: 'f2', under: true })
    s.ring(32, 36, 7, 5, 1.6, dark, { g: 'handle' })
    s.squircle(32, 48, 11, 10, 2.4, metal, { g: 'pot' })
    s.ellipse(32, 39, 7, 2, dark, { g: 'lid' })
    s.circle(32, 37, 1.6, dark, { g: 'knob' })
    if (!back)
      s.tube(
        [
          [23, 49, 2.4],
          [17, 45, 1.8],
          [14, 41, 1.4],
        ],
        metal,
        { g: 'spout' },
      )
    if (!icon) puff(s, [[12, 36, 2.4], [10, 32, 2], [13, 29, 1.6]], steam, { g: 'steam', line: false })
    if (back) return
    if (icon) {
      iconEye(s, p, 29, 46)
      return
    }
    eye(s, p, 'round45', 27, 44)
    eye(s, p, 'round45', 34, 44)
    s.line(29, 52, 33, 52, p.c('K'))
  },
}

const samovar: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const metal = p.ramp('WLDD', 'K', 'K')
    const dark = p.m('dark')
    const fire = p.m('glowMid')
    const steam = p.ramp('WWWL', 'L', 'L')
    const back = s.back
    const icon = s.icon
    s.squircle(32, 58, 12, 3, 2.4, dark, { g: 'base' })
    s.limb(32, 50, 4, 32, 56, 5, dark, { g: 'foot' })
    s.squircle(32, 36, 15, 16, 2.6, metal, { g: 'urn' })
    if (!icon) for (const y of [26, 46]) s.ellipse(32, y, 15, 1.6, dark, { paint: true, onto: ['urn'] })
    // Handles like arms.
    s.ring(14, 34, 4, 6, 1.6, dark, { g: 'h1' })
    s.ring(50, 34, 4, 6, 1.6, dark, { g: 'h2', under: true })
    // A crown-shaped lid with a little chimney of fire.
    s.poly(
      [
        [20, 21],
        [22, 13],
        [26, 18],
        [32, 10],
        [38, 18],
        [42, 13],
        [44, 21],
      ],
      dark,
      { g: 'crown', bevel: 1 },
    )
    flame(s, 32, 6, 2.6, 7, fire, p.m('glow'), 'fire')
    if (!back) {
      s.limb(32, 47, 1.6, 22, 50, 1.4, dark, { g: 'tap' })
      s.ellipse(21, 50, 1.6, 2, dark, { g: 'tap' })
    }
    if (!icon) puff(s, [[50, 14, 3], [54, 9, 2.6], [58, 5, 2]], steam, { g: 'steam', line: false })
    if (back) return
    if (icon) {
      iconEye(s, p, 28, 33)
      return
    }
    eye(s, p, 'fierce54', 22, 30)
    eye(s, p, 'fierce54', 33, 30)
    s.line(26, 40, 36, 40, p.c('K'))
  },
}

// ─── Ember dogs ───────────────────────────────────────────────────────────

const coalpup: Recipe = {
  size: 'S',
  draw(s, p) {
    const soot = p.m('deep')
    const ember = p.m('glowMid')
    const back = s.back
    const icon = s.icon
    const legs = (far: boolean) => {
      if (far) {
        s.limb(25, 52, 2, 24, 59, 1.8, soot, { g: 'lf2', under: true })
        s.limb(40, 52, 2.2, 41, 59, 1.9, soot, { g: 'lh2', under: true })
      } else {
        s.limb(21, 52, 2.3, 19, 59.5, 2, soot, { g: 'lf1' })
        s.limb(36, 52, 2.4, 35, 59.5, 2.1, soot, { g: 'lh1' })
      }
    }
    const tail = () => {
      s.tube(
        [
          [41, 46, 2.6],
          [47, 41, 2.2],
          [50, 35, 1.6],
        ],
        soot,
        { g: 'tail' },
      )
      flame(s, 50.5, 33, 2, 5, ember, p.m('glow'), 'tflame', 0.3)
    }
    const body = () => {
      s.ellipse(31, 48, 11, 7.5, soot, { g: 'body' })
      if (!icon) for (const [x, y] of [[30, 44], [35, 46], [27, 47]] as const) s.stamp(p.stamp(['L']), x, y)
    }
    const head = () => {
      s.limb(23, 33, 2.4, 25, 26, 0.8, soot, { g: 'ear2' })
      s.circle(19, 38, 7.5, soot, { g: 'head' })
      s.limb(15, 33, 2.4, 13, 26, 0.8, soot, { g: 'ear1' })
      if (!back) s.ellipse(13, 41, 4, 3, soot, { g: 'snout' })
    }
    if (back) {
      head()
      legs(true)
      body()
      legs(false)
      tail()
      return
    }
    legs(true)
    tail()
    body()
    legs(false)
    head()
    if (icon) {
      iconEye(s, p, 17, 37, 'glow')
      return
    }
    eye(s, p, 'glow44', 15, 35, { o: 'K', h: 'W' })
    s.stamp(p.stamp(['KK']), 9, 40)
  },
}

const coalyote: Recipe = {
  size: 'L',
  draw(s, p) {
    const soot = p.m('deep')
    const ember = p.m('glowMid')
    const back = s.back
    const icon = s.icon
    const legs = (far: boolean) => {
      if (far) {
        s.limb(24, 44, 2.6, 21, 59, 2.2, soot, { g: 'lf2', under: true })
        s.limb(46, 44, 2.8, 48, 59, 2.3, soot, { g: 'lh2', under: true })
      } else {
        s.limb(19, 44, 2.9, 15, 59.5, 2.4, soot, { g: 'lf1' })
        s.ellipse(41, 44, 6, 7, soot, { g: 'lh1' })
        s.limb(41, 48, 2.6, 41, 59.5, 2.3, soot, { g: 'lh1' })
      }
    }
    const tail = () =>
      s.tube(
        [
          [48, 38, 3.4],
          [55, 42, 3],
          [60, 49, 2.2],
        ],
        soot,
        { g: 'tail' },
      )
    const body = () => {
      s.ellipse(32, 38, 17, 9, soot, { g: 'body', rot: -4 })
      // Embers along the spine.
      for (const [x, y, lean] of [
        [22, 28, -0.3],
        [30, 27, 0],
        [38, 27, 0.2],
        [46, 29, 0.4],
      ] as const)
        flame(s, x, y, 2.4, 7, ember, p.m('glow'), `spine${x}`, lean)
    }
    const head = () => {
      s.limb(18, 24, 2.8, 21, 13, 0.8, soot, { g: 'ear2' })
      s.ellipse(14, 28, 7.5, 7, soot, { g: 'head' })
      s.limb(11, 23, 2.8, 9, 12, 0.8, soot, { g: 'ear1' })
      if (!back) s.ellipse(6, 32, 5, 3.2, soot, { g: 'snout', rot: 15 })
    }
    if (back) {
      head()
      legs(true)
      body()
      tail()
      legs(false)
      return
    }
    legs(true)
    tail()
    body()
    legs(false)
    head()
    if (icon) {
      iconEye(s, p, 12, 26, 'glow')
      return
    }
    eye(s, p, 'fierce54', 9, 24, { o: 'K', i: 'W', p: 'L', h: 'W' })
    s.stamp(p.stamp(['KK']), 1.5, 31)
    s.line(3, 35, 8, 35, p.c('K'))
  },
}

// ─── Bricks ───────────────────────────────────────────────────────────────

const brickle: Recipe = {
  size: 'S',
  draw(s, p) {
    const brick = p.m('mid')
    const dark = p.m('dark')
    const back = s.back
    const icon = s.icon
    s.limb(26, 55, 1.8, 25, 60, 1.6, dark, { g: 'f1' })
    s.limb(38, 55, 1.8, 39, 60, 1.6, dark, { g: 'f2', under: true })
    s.squircle(32, 46, 14, 9, 4, brick, { g: 'brick' })
    if (!icon) {
      s.shadeLine(18, 46, 46, 46, 1)
      s.shadeLine(26, 37, 26, 46, 1)
      s.shadeLine(38, 46, 38, 55, 1)
    }
    s.limb(19, 46, 1.6, 14, 50, 1.4, dark, { g: 'arm' })
    if (back) return
    if (icon) {
      iconEye(s, p, 28, 41)
      return
    }
    eye(s, p, 'narrow53', 23, 40)
    eye(s, p, 'narrow53', 31, 40)
    s.line(25, 50, 30, 50, p.c('K'))
  },
}

const bulwark: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const brick = p.m('mid')
    const dark = p.m('dark')
    const back = s.back
    const icon = s.icon
    s.limb(24, 50, 4, 23, 59, 3.6, dark, { g: 'leg1' })
    s.limb(40, 50, 4, 41, 59, 3.6, dark, { g: 'leg2', under: true })
    // A rampart: a wall with battlements on top.
    s.squircle(32, 36, 18, 16, 4, brick, { g: 'wall' })
    for (const x of [16, 26, 36, 46]) s.squircle(x + 2, 18, 3.6, 3.6, 4, brick, { g: `merlon${x}` })
    if (!icon)
      for (let y = 26; y < 52; y += 6) {
        s.shadeLine(15, y, 49, y, 1)
        for (let x = 20 + ((y / 6) % 2) * 6; x < 48; x += 12) s.shadeLine(x, y - 6, x, y, 1)
      }
    s.tube([[14, 32, 4], [7, 40, 3.6], [6, 48, 3]], dark, { g: 'arm1' })
    s.tube([[50, 32, 4], [56, 40, 3.6], [57, 48, 3]], dark, { g: 'arm2', under: true })
    if (back) return
    if (icon) {
      iconEye(s, p, 28, 31)
      return
    }
    s.stamp(p.stamp(['KKKKKKKKKKKKKKKK', 'KWWKKKKKKKKWWKKK']), 22, 30)
    s.line(26, 40, 36, 40, p.c('K'))
  },
}

// ─── Badgers ──────────────────────────────────────────────────────────────

const settling: Recipe = {
  size: 'S',
  draw(s, p) {
    const fur = p.m('mid')
    const white = p.m('white')
    const black = p.m('deep')
    const claw = p.m('white')
    const back = s.back
    const icon = s.icon
    s.limb(24, 52, 2.4, 22, 59, 2.2, black, { g: 'lf' })
    s.limb(40, 52, 2.4, 41, 59, 2.2, black, { g: 'lh', under: true })
    if (!icon) for (const dx of [0, 2]) s.limb(20 + dx, 59, 0.7, 18 + dx, 61, 0.4, claw, { g: `c${dx}` })
    s.ellipse(33, 48, 12, 8, fur, { g: 'body' })
    s.ellipse(20, 44, 8, 6.5, white, { g: 'head' })
    // Two black stripes over the eyes.
    s.ellipse(21, 42, 7, 1.6, black, { paint: true, onto: ['head'], rot: -6 })
    s.ellipse(21, 46.5, 7, 1.4, black, { paint: true, onto: ['head'], rot: 4 })
    s.circle(25, 38, 2, black, { g: 'ear' })
    if (back) return
    if (icon) {
      iconEye(s, p, 18, 42, 'glow')
      return
    }
    eye(s, p, 'dot2', 16, 41)
    s.stamp(p.stamp(['KK']), 12, 45)
  },
}

const badgrapple: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const fur = p.m('mid')
    const white = p.m('white')
    const black = p.m('deep')
    const belt = p.m('glowMid')
    const back = s.back
    const icon = s.icon
    s.limb(26, 48, 4.4, 23, 59, 3.6, black, { g: 'leg1' })
    s.limb(40, 48, 4.4, 42, 59, 3.6, black, { g: 'leg2', under: true })
    s.ellipse(33, 36, 15, 15, fur, { g: 'body' })
    if (!back) s.ellipse(29, 40, 9, 9, white, { paint: true, onto: ['body'] })
    s.squircle(33, 48, 15, 3, 3, belt, { g: 'belt' })
    s.tube([[20, 30, 5], [11, 36, 4], [9, 44, 3.6]], black, { g: 'arm1' })
    s.tube([[46, 30, 5], [54, 36, 4], [55, 44, 3.6]], black, { g: 'arm2', under: true })
    s.ellipse(27, 17, 9, 7.5, white, { g: 'head' })
    s.ellipse(28, 15, 8.5, 1.8, black, { paint: true, onto: ['head'], rot: -6 })
    s.ellipse(28, 20, 8.5, 1.6, black, { paint: true, onto: ['head'], rot: 4 })
    s.circle(33, 10, 2.4, black, { g: 'ear' })
    if (back) return
    if (icon) {
      iconEye(s, p, 23, 15, 'glow')
      return
    }
    eye(s, p, 'fierce54', 20, 13, { i: 'W' })
    s.stamp(p.stamp(['KK']), 18, 19)
    s.line(21, 23, 27, 23, p.c('K'))
  },
}

// ─── Wombats ──────────────────────────────────────────────────────────────

const womball: Recipe = {
  size: 'S',
  draw(s, p) {
    const fur = p.m('mid')
    const dark = p.m('dark')
    const back = s.back
    const icon = s.icon
    s.ellipse(25, 58.5, 3.4, 2, dark, { g: 'f1' })
    s.ellipse(39, 58.5, 3.4, 2, dark, { g: 'f2', under: true })
    s.circle(34, 47, 11, fur, { g: 'body' })
    // That famous square rump.
    s.squircle(43, 48, 5, 8, 3, dark, { g: 'rump' })
    s.ellipse(22, 46, 8, 7, fur, { g: 'head' })
    s.circle(22, 39.5, 2.2, fur, { g: 'ear1' })
    s.circle(27, 40, 2, fur, { g: 'ear2', under: true })
    if (!back) s.ellipse(16.5, 48, 3.6, 3, dark, { g: 'nose' })
    if (back) return
    if (icon) {
      iconEye(s, p, 20, 44)
      return
    }
    eye(s, p, 'dot3', 19, 43)
  },
}

const wombatank: Recipe = {
  size: 'L',
  front: { k: 0.88 },
  draw(s, p) {
    const fur = p.m('mid')
    const dark = p.m('dark')
    const armor = p.m('light')
    const back = s.back
    const icon = s.icon
    for (const [x, g] of [
      [20, 'f1'],
      [46, 'f2'],
    ] as const)
      s.squircle(x, 57, 6, 4, 2.6, dark, { g })
    s.ellipse(34, 44, 22, 13, fur, { g: 'body' })
    // A plated back like a castle gate.
    s.squircle(38, 32, 16, 9, 3, armor, { g: 'plate' })
    if (!icon) {
      for (const x of [30, 38, 46]) s.shadeLine(x, 24, x, 40, 1)
      s.shadeLine(23, 32, 53, 32, 1)
    }
    s.ellipse(15, 42, 11, 9, fur, { g: 'head' })
    s.circle(17, 33, 3, fur, { g: 'ear1' })
    if (!back) s.ellipse(7, 45, 4.6, 4, dark, { g: 'nose' })
    if (back) return
    if (icon) {
      iconEye(s, p, 13, 39)
      return
    }
    eye(s, p, 'narrow53', 10, 38)
  },
}

// ─── Gila ─────────────────────────────────────────────────────────────────

const gilagrin: Recipe = {
  size: 'M',
  draw(s, p) {
    const skin = p.m('light')
    const rock = p.m('mid')
    const back = s.back
    const icon = s.icon
    s.blob(
      [
        [8, 61],
        [12, 54],
        [30, 50],
        [54, 52],
        [58, 61],
      ],
      rock,
      { g: 'rock', bevel: 2 },
    )
    const tail: P3[] = [
      [44, 47, 4.6],
      [52, 47, 3.6],
      [58, 50, 2.4],
    ]
    s.tube(tail, skin, { g: 'tail' })
    s.ellipse(32, 46, 14, 5.5, skin, { g: 'body' })
    s.limb(24, 48, 2.2, 20, 51, 1.8, skin, { g: 'lf' })
    s.limb(38, 49, 2.2, 42, 51, 1.8, skin, { g: 'lh' })
    s.ellipse(15, 43, 8, 5, skin, { g: 'head' })
    if (!icon)
      for (const [x, y] of [
        [30, 43],
        [36, 45],
        [42, 44],
        [26, 47],
        [49, 47],
        [20, 41],
      ] as const)
        s.stamp(p.stamp(['DD', 'DD']), x, y)
    if (back) return
    if (icon) {
      iconEye(s, p, 13, 41)
      return
    }
    eye(s, p, 'sleepy53', 11, 40)
    // The smug grin.
    s.line(7, 46, 17, 47, p.c('K'))
    s.line(17, 47, 19, 45, p.c('K'))
  },
}

// ─── Scarabs ──────────────────────────────────────────────────────────────

const scarabble: Recipe = {
  size: 'S',
  draw(s, p) {
    const shell = p.m('mid')
    const dark = p.m('dark')
    const mud = p.ramp('LDDK')
    const back = s.back
    const icon = s.icon
    s.circle(18, 49, 10, mud, { g: 'ball' })
    if (!icon) for (const [x, y] of [[15, 45], [21, 52], [14, 53]] as const) s.shadePx(x, y, 1)
    for (const x of [33, 38, 43]) s.limb(x, 52, 0.9, x + 1, 59, 0.7, dark, { g: `leg${x}`, under: true })
    s.ellipse(40, 47, 9, 7, shell, { g: 'shell' })
    if (!icon) s.shadeLine(40, 40, 41, 54, 1)
    s.ellipse(30, 48, 4.5, 4, dark, { g: 'head' })
    s.limb(28, 47, 1, 24, 44, 0.8, dark, { g: 'arm' })
    if (back) return
    if (icon) {
      iconEye(s, p, 29, 46, 'glow')
      return
    }
    eye(s, p, 'glow33', 28, 45)
  },
}

const bouldarab: Recipe = {
  size: 'L',
  front: { k: 0.88 },
  draw(s, p) {
    const shell = p.m('mid')
    const dark = p.m('dark')
    const rock = p.m('light')
    const back = s.back
    const icon = s.icon
    s.circle(14, 42, 14, rock, { g: 'boulder' })
    if (!icon) for (const [x1, y1, x2, y2] of [[8, 36, 13, 40], [16, 46, 20, 44], [9, 48, 12, 51]]) s.shadeLine(x1, y1, x2, y2, 1)
    for (const x of [34, 42, 50]) s.limb(x, 48, 1.6, x + 1, 59, 1.2, dark, { g: `leg${x}`, under: true })
    s.ellipse(43, 40, 15, 11, shell, { g: 'shell' })
    if (!icon) s.shadeLine(43, 29, 44, 51, 1)
    s.ellipse(29, 41, 6.5, 6, dark, { g: 'head' })
    s.tube(
      [
        [27, 36, 2],
        [27, 28, 1.4],
        [30, 24, 0.8],
      ],
      dark,
      { g: 'horn' },
    )
    s.limb(27, 44, 2, 25, 47, 1.6, dark, { g: 'arm' })
    if (back) return
    if (icon) {
      iconEye(s, p, 26, 40, 'glow')
      return
    }
    eye(s, p, 'glow44', 24, 38)
  },
}

// ─── Goats ────────────────────────────────────────────────────────────────

const kidgruff: Recipe = {
  size: 'S',
  draw(s, p) {
    const fur = p.m('light')
    const dark = p.m('dark')
    const horn = p.m('pale')
    const back = s.back
    const icon = s.icon
    const legs = (far: boolean) => {
      if (far) {
        s.limb(26, 51, 1.6, 25, 59, 1.4, fur, { g: 'lf2', under: true })
        s.limb(39, 51, 1.6, 40, 59, 1.4, fur, { g: 'lh2', under: true })
      } else {
        s.limb(22, 51, 1.8, 20, 59.5, 1.5, fur, { g: 'lf1' })
        s.limb(35, 51, 1.8, 35, 59.5, 1.5, fur, { g: 'lh1' })
        for (const x of [20, 35]) s.ellipse(x, 60, 1.8, 1, dark, { g: `hoof${x}` })
      }
    }
    const body = () => {
      s.ellipse(31, 47, 10, 6.5, fur, { g: 'body' })
      s.ellipse(41, 43, 2, 1.6, fur, { g: 'tail' })
    }
    const head = () => {
      s.ellipse(20, 38, 6, 5.5, fur, { g: 'head', rot: 20 })
      s.ellipse(26, 36, 3.6, 1.6, fur, { g: 'ear', rot: -20 })
      s.limb(19, 33, 1.2, 21, 29, 0.8, horn, { g: 'horn1' })
      s.limb(22, 34, 1.2, 25, 30, 0.8, horn, { g: 'horn2' })
      if (!back) s.ellipse(15, 42, 3, 2.4, fur, { g: 'snout' })
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
      iconEye(s, p, 18, 37)
      return
    }
    eye(s, p, 'round45', 16, 35)
    s.stamp(p.stamp(['K']), 13, 42)
  },
}

const billygruff: Recipe = {
  size: 'L',
  draw(s, p) {
    const fur = p.m('light')
    const dark = p.m('dark')
    const horn = p.m('pale')
    const beard = p.m('white')
    const back = s.back
    const icon = s.icon
    const legs = (far: boolean) => {
      if (far) {
        s.limb(24, 44, 2.6, 22, 59, 2, fur, { g: 'lf2', under: true })
        s.limb(44, 44, 2.6, 46, 59, 2, fur, { g: 'lh2', under: true })
      } else {
        s.limb(19, 44, 2.8, 16, 59.5, 2.2, fur, { g: 'lf1' })
        s.limb(40, 44, 2.8, 40, 59.5, 2.2, fur, { g: 'lh1' })
        for (const x of [16, 40]) s.ellipse(x, 60, 2.4, 1.2, dark, { g: `hoof${x}` })
      }
    }
    const body = () => s.ellipse(32, 38, 16, 9, fur, { g: 'body' })
    const head = () => {
      // Great curling horns.
      s.tube(
        [
          [21, 21, 2.6],
          [28, 13, 2.4],
          [36, 14, 2],
          [38, 22, 1.6],
          [34, 26, 1],
        ],
        horn,
        { g: 'horn' },
      )
      if (!icon) for (const [x, y] of [[25, 16], [31, 12], [36, 17]] as const) s.shadePx(x, y, 1)
      s.ellipse(17, 26, 6.5, 6, fur, { g: 'head', rot: 25 })
      if (!back) {
        s.ellipse(11, 31, 3.6, 3, fur, { g: 'snout' })
        s.poly(
          [
            [12, 33],
            [16, 34],
            [13, 42],
          ],
          beard,
          { g: 'beard', bevel: 0.8 },
        )
      }
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
      iconEye(s, p, 15, 24)
      return
    }
    eye(s, p, 'fierce54', 12, 22)
    s.stamp(p.stamp(['K']), 8, 30)
  },
}

export const HILLS_RECIPES = { kettlin, samovar, coalpup, coalyote, brickle, bulwark, settling, badgrapple, womball, wombatank, gilagrin, scarabble, bouldarab, kidgruff, billygruff }
