/**
 * The three partners from PROF. STERLING's lab:
 * PANDLE → FLAREPAW → PYRONDA (fire red pandas),
 * DIPPLE → BILLOW → PLATYPHOON (water platypuses),
 * SPROTH → MOSSLOTH → GROVELOTH (plant sloths).
 */
import type { P3 } from '../canvas'
import { eye, iconEye, type Recipe } from '../kit'
import { flame, puff, stripes } from '../parts'

// ─── Red pandas ───────────────────────────────────────────────────────────

const pandle: Recipe = {
  size: 'S',
  draw(s, p) {
    const fur = p.m('mid')
    const cream = p.m('white')
    const sock = p.m('deep')
    const ring = p.m('dark')
    const back = s.back
    const icon = s.icon
    const path: P3[] = [
      [41, 52, 3.8],
      [49, 49, 4.6],
      [54, 41, 4.8],
      [53, 33, 4.4],
      [48, 28, 3.6],
    ]
    const tail = () => {
      s.tube(path, fur, { g: 'tail' })
      if (!icon) stripes(s, path, 5.5, 2.2, ring, ['tail'])
      flame(s, 46.5, 27, 2.6, 7.5, p.m('glowMid'), p.m('glow'), 'flame', -0.2)
    }
    const legs = (far: boolean) => {
      if (far) {
        s.limb(27, 52, 2.4, 26, 59, 2.2, sock, { g: 'lf2', under: true })
        s.limb(40, 52, 2.6, 41.5, 59, 2.3, sock, { g: 'lh2', under: true })
      } else {
        s.limb(22, 51, 2.7, 20.5, 59, 2.5, sock, { g: 'lf1' })
        s.ellipse(36.5, 52, 5, 5.2, fur, { g: 'lh1' })
        s.limb(36, 55, 2.6, 35, 59.3, 2.5, sock, { g: 'lh1' })
      }
    }
    const body = () => {
      s.ellipse(32, 48, 11.5, 8, fur, { g: 'body' })
      if (!back) s.ellipse(29, 54, 8, 3, sock, { paint: true, onto: ['body'] })
    }
    const head = () => {
      s.circle(27.5, 27, 3.8, fur, { g: 'ear2' })
      s.circle(20, 36, 10.5, fur, { g: 'head' })
      s.circle(15, 27.5, 4, fur, { g: 'ear1' })
      if (!icon) {
        s.circle(15, 27.5, 2.2, cream, { paint: true, onto: ['ear1'] })
        s.circle(27.5, 27, 2, cream, { paint: true, onto: ['ear2'] })
      }
      if (!back) {
        s.ellipse(13.5, 40.5, 5.5, 4.4, cream, { paint: true, onto: ['head'] })
        s.ellipse(23.5, 41.5, 3.4, 3, cream, { paint: true, onto: ['head'] })
        if (!icon) {
          s.ellipse(17.5, 31.5, 2.2, 1.3, cream, { paint: true, onto: ['head'] })
          s.ellipse(11.5, 32.5, 1.6, 1.2, cream, { paint: true, onto: ['head'] })
        }
      }
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
      iconEye(s, p, 16, 35)
      return
    }
    eye(s, p, 'round45', 15, 32)
    eye(s, p, 'dot3', 9.5, 33)
    s.stamp(p.stamp(['KKK', '.K.']), 8, 39)
    s.line(10, 43, 12, 44, p.c('K'))
    s.line(12, 44, 14, 43, p.c('K'))
  },
}

const flarepaw: Recipe = {
  size: 'M',
  draw(s, p) {
    const fur = p.m('mid')
    const cream = p.m('white')
    const sock = p.m('deep')
    const ring = p.m('glowMid')
    const back = s.back
    const icon = s.icon
    const path: P3[] = [
      [44, 44, 4.4],
      [52, 42, 5.2],
      [57, 33, 5.4],
      [55, 23, 5],
      [49, 18, 4],
    ]
    const tail = () => {
      s.tube(path, fur, { g: 'tail' })
      if (!icon) stripes(s, path, 6.5, 2.6, ring, ['tail'])
      flame(s, 47.5, 16, 3, 9, p.m('glowMid'), p.m('glow'), 'tflame', -0.3)
    }
    const pawFlame = (x: number, g: string) => flame(s, x, 57, 2.2, 6, p.m('glowMid'), p.m('glow'), g, 0.4)
    const legs = (far: boolean) => {
      if (far) {
        s.limb(25, 46, 2.8, 23, 59, 2.4, sock, { g: 'lf2', under: true })
        s.limb(43, 47, 3, 45, 59, 2.5, sock, { g: 'lh2', under: true })
      } else {
        s.limb(20, 45, 3.2, 17, 59, 2.8, sock, { g: 'lf1' })
        s.ellipse(39, 47, 6, 6.5, fur, { g: 'lh1' })
        s.limb(38, 51, 3, 37, 59.5, 2.7, sock, { g: 'lh1' })
        if (!icon) {
          pawFlame(16, 'pf1')
          pawFlame(36.5, 'pf2')
        }
      }
    }
    const body = () => {
      s.ellipse(32, 42, 15, 9, fur, { g: 'body', rot: -6 })
      if (!back) s.ellipse(27, 48, 10, 3.4, sock, { paint: true, onto: ['body'] })
    }
    const head = () => {
      s.limb(21, 22, 3.2, 24, 13, 1.2, fur, { g: 'ear2' })
      s.ellipse(17, 28, 9.5, 8.5, fur, { g: 'head' })
      s.limb(12, 22, 3.4, 11, 12.5, 1.2, fur, { g: 'ear1' })
      if (!icon) s.limb(12, 20, 1.6, 11.3, 15, 0.6, cream, { paint: true, onto: ['ear1'] })
      if (!back) {
        s.ellipse(9, 31.5, 5.4, 4, cream, { paint: true, onto: ['head'] })
        s.ellipse(20, 33, 3.6, 3, cream, { paint: true, onto: ['head'] })
        if (!icon) s.ellipse(14, 23.5, 2.6, 1.3, cream, { paint: true, onto: ['head'] })
      }
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
      iconEye(s, p, 11, 27)
      return
    }
    eye(s, p, 'fierce54', 10.5, 25)
    eye(s, p, 'dot2', 5.5, 26.5)
    s.stamp(p.stamp(['KK', 'KK']), 3.5, 30)
    s.line(5, 34, 9, 34.5, p.c('K'))
  },
}

const pyronda: Recipe = {
  size: 'L',
  front: { k: 0.86 },
  draw(s, p) {
    const fur = p.m('mid')
    const cream = p.m('white')
    const sock = p.m('deep')
    const ring = p.m('glowMid')
    const back = s.back
    const icon = s.icon
    const path: P3[] = [
      [40, 50, 5],
      [50, 50, 6],
      [58, 41, 6.2],
      [58, 29, 5.8],
      [52, 21, 4.8],
    ]
    const tail = () => {
      s.tube(path, fur, { g: 'tail' })
      if (!icon) stripes(s, path, 7, 3, ring, ['tail'])
      flame(s, 50.5, 18, 3.6, 11, p.m('glowMid'), p.m('glow'), 'tflame', -0.3)
    }
    const mane = () => {
      for (const [x, y, lean] of [
        [16, 18, -0.6],
        [21, 14, -0.2],
        [27, 15, 0.2],
        [31, 20, 0.5],
      ] as const)
        flame(s, x, y, 3, 9, p.m('glowMid'), p.m('glow'), `mane${x}`, lean)
    }
    const legs = () => {
      s.limb(33, 48, 5, 33, 59, 3.4, sock, { g: 'leg2', under: true })
      s.ellipse(27, 50, 7, 8, fur, { g: 'thigh' })
      s.limb(25, 54, 3.6, 23, 59.5, 3.4, sock, { g: 'thigh' })
      s.ellipse(21, 60, 4.5, 1.8, sock, { g: 'thigh' })
    }
    const body = () => {
      s.ellipse(29, 38, 11, 14, fur, { g: 'body', rot: 8 })
      if (!back) s.ellipse(25, 41, 6.5, 10, cream, { paint: true, onto: ['body'], rot: 8 })
    }
    const arms = (far: boolean) => {
      if (far) s.limb(34, 31, 3.4, 40, 22, 2.8, sock, { g: 'arm2', under: true })
      else {
        s.limb(22, 31, 3.8, 13, 26, 3.2, sock, { g: 'arm1' })
        if (!icon) flame(s, 11, 24, 2.8, 8, p.m('glowMid'), p.m('glow'), 'fist', -0.4)
      }
    }
    const head = () => {
      s.limb(27, 11, 3.2, 31, 3, 1.2, fur, { g: 'ear2' })
      s.ellipse(22, 17, 9.5, 8.5, fur, { g: 'head' })
      s.limb(17, 11, 3.2, 15, 2.5, 1.2, fur, { g: 'ear1' })
      if (!back) {
        s.ellipse(14.5, 20.5, 5.4, 4, cream, { paint: true, onto: ['head'] })
        s.ellipse(25, 22, 3.4, 2.8, cream, { paint: true, onto: ['head'] })
        if (!icon) s.ellipse(19.5, 12.5, 2.6, 1.3, cream, { paint: true, onto: ['head'] })
      }
    }
    if (back) {
      mane()
      head()
      arms(true)
      legs()
      body()
      arms(false)
      tail()
      return
    }
    tail()
    arms(true)
    legs()
    body()
    mane()
    head()
    arms(false)
    if (icon) {
      iconEye(s, p, 16, 16)
      return
    }
    eye(s, p, 'fierce54', 16, 14)
    eye(s, p, 'dot2', 10.5, 15.5)
    s.stamp(p.stamp(['KK', 'KK']), 8.5, 19)
    s.line(10, 23.5, 15, 23.5, p.c('K'))
    s.pxs([14, 24.5], p.c('W'))
  },
}

// ─── Platypuses ───────────────────────────────────────────────────────────

const dipple: Recipe = {
  size: 'S',
  draw(s, p) {
    const fur = p.m('mid')
    const belly = p.m('pale')
    const bill = p.m('dark')
    const tailM = p.m('dark')
    const water = p.m('glowMid')
    const back = s.back
    const icon = s.icon
    const tail = () => {
      s.ellipse(49, 53, 8, 4, tailM, { g: 'tail', rot: -10 })
      if (!icon) {
        s.shadeLine(45, 52, 52, 51, 1)
        s.shadeLine(46, 55, 53, 54, 1)
      }
    }
    const feet = () => {
      s.ellipse(26, 59, 4, 1.6, bill, { g: 'ff', under: true })
      s.ellipse(40, 59.5, 4.4, 1.6, bill, { g: 'hf', under: true })
    }
    const body = () => {
      s.squircle(35, 51, 13, 8, 2.4, fur, { g: 'body' })
      if (!back) s.ellipse(32, 56, 9, 3, belly, { paint: true, onto: ['body'] })
      // A curl of water riding on its back.
      s.tube(
        [
          [33, 43, 2.2],
          [37, 39, 2.4],
          [42, 39, 2],
          [43, 42.5, 1.4],
        ],
        water,
        { g: 'curl' },
      )
    }
    const head = () => {
      s.circle(24, 46, 8, fur, { g: 'head' })
      s.ellipse(13.5, 49, 7.5, 3.4, bill, { g: 'bill', rot: 6 })
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
    if (icon) {
      iconEye(s, p, 22, 44)
      return
    }
    eye(s, p, 'bead33', 21, 42)
    s.pxs([9, 47, 11, 47], p.c('L'))
  },
}

const billow: Recipe = {
  size: 'M',
  draw(s, p) {
    const fur = p.m('mid')
    const belly = p.m('pale')
    const bill = p.m('dark')
    const water = p.m('glowMid')
    const back = s.back
    const icon = s.icon
    const tail = () => {
      s.ellipse(52, 50, 10, 5, bill, { g: 'tail', rot: -20 })
      if (!icon) for (let i = 0; i < 3; i++) s.shadeLine(46 + i * 2, 47 + i, 55 + i * 2, 46 - i, 1)
    }
    const fin = () =>
      s.poly(
        [
          [28, 34],
          [35, 22],
          [38, 26],
          [42, 20],
          [44, 36],
        ],
        water,
        { g: 'fin', bevel: 1.5 },
      )
    const legs = (far: boolean) => {
      if (far) {
        s.limb(26, 48, 3, 24, 58, 2.6, fur, { g: 'lf2', under: true })
        s.limb(44, 48, 3.2, 46, 58, 2.8, fur, { g: 'lh2', under: true })
      } else {
        s.limb(22, 48, 3.4, 19, 58, 3, fur, { g: 'lf1' })
        s.ellipse(17.5, 59.5, 4.8, 1.8, bill, { g: 'lf1' })
        s.limb(40, 48, 3.6, 39, 58, 3.2, fur, { g: 'lh1' })
        s.ellipse(38, 59.5, 5, 1.8, bill, { g: 'lh1' })
      }
    }
    const body = () => {
      s.squircle(34, 43, 15, 10, 2.4, fur, { g: 'body' })
      if (!back) s.ellipse(30, 49, 11, 3.6, belly, { paint: true, onto: ['body'] })
    }
    const head = () => {
      s.circle(19, 35, 8.5, fur, { g: 'head' })
      s.ellipse(8, 38.5, 8, 3.6, bill, { g: 'bill', rot: 10 })
    }
    if (back) {
      head()
      legs(true)
      body()
      fin()
      legs(false)
      tail()
      return
    }
    legs(true)
    tail()
    fin()
    body()
    legs(false)
    head()
    if (icon) {
      iconEye(s, p, 17, 32)
      return
    }
    eye(s, p, 'round45', 15.5, 30)
    s.pxs([3, 36, 5, 36], p.c('L'))
  },
}

const platyphoon: Recipe = {
  size: 'L',
  front: { k: 0.84 },
  draw(s, p) {
    const fur = p.m('mid')
    const belly = p.m('pale')
    const bill = p.m('dark')
    const water = p.m('glowMid')
    const spur = p.m('white')
    const back = s.back
    const icon = s.icon
    const tail = () => s.ellipse(44, 56, 15, 5.5, bill, { g: 'tail', rot: -8 })
    const swirl = () =>
      s.tube(
        [
          [26, 10, 2],
          [33, 5, 2.6],
          [40, 9, 2.4],
          [38, 15, 2],
          [33, 14, 1.6],
        ],
        water,
        { g: 'swirl' },
      )
    const legs = () => {
      s.limb(36, 46, 5, 37, 57, 3.6, fur, { g: 'leg2', under: true })
      s.ellipse(27, 49, 7.5, 8, fur, { g: 'thigh' })
      s.limb(25, 53, 4, 23, 58.5, 3.4, fur, { g: 'thigh' })
      s.ellipse(20, 60, 6, 2, bill, { g: 'thigh' })
      if (!icon) s.limb(29, 56, 1.6, 33, 58, 0.5, spur, { g: 'spur' })
    }
    const body = () => {
      s.ellipse(30, 36, 13, 15, fur, { g: 'body', rot: 6 })
      if (!back) s.ellipse(26, 39, 7.5, 11, belly, { paint: true, onto: ['body'], rot: 6 })
    }
    const arms = (far: boolean) => {
      if (far) s.limb(38, 30, 3.6, 44, 38, 3, fur, { g: 'arm2', under: true })
      else {
        s.limb(22, 30, 4, 15, 37, 3.4, fur, { g: 'arm1' })
        s.ellipse(13, 38.5, 3.8, 2.6, bill, { g: 'arm1' })
      }
    }
    const head = () => {
      s.circle(25, 17, 8.5, fur, { g: 'head' })
      s.ellipse(13, 20, 9, 3.8, bill, { g: 'bill', rot: 8 })
    }
    if (back) {
      head()
      swirl()
      arms(true)
      legs()
      body()
      arms(false)
      tail()
      return
    }
    tail()
    arms(true)
    legs()
    body()
    swirl()
    head()
    arms(false)
    if (icon) {
      iconEye(s, p, 22, 14)
      return
    }
    eye(s, p, 'fierce54', 19.5, 12)
    s.pxs([7, 18, 9, 18], p.c('L'))
  },
}

// ─── Sloths ───────────────────────────────────────────────────────────────

const sproth: Recipe = {
  size: 'S',
  draw(s, p) {
    const fur = p.m('mid')
    const face = p.m('pale')
    const mask = p.m('dark')
    const leaf = p.m('light')
    const claw = p.m('white')
    const back = s.back
    const icon = s.icon
    const sprout = () => {
      s.limb(25, 27, 0.9, 25.5, 21, 0.8, mask, { g: 'stem' })
      s.leaf(25.5, 21.5, 18.5, 18, 3.2, leaf, { g: 'leaf1' }, 0.4)
      s.leaf(25.5, 21.5, 32, 17, 3, leaf, { g: 'leaf2' }, -0.4)
    }
    const body = () => {
      s.ellipse(33, 48, 11, 11, fur, { g: 'body' })
      s.ellipse(27, 59, 4, 2, fur, { g: 'foot1' })
      s.ellipse(39, 59, 4, 2, fur, { g: 'foot2', under: true })
    }
    const arms = () => {
      s.limb(25, 44, 3, 21, 54, 2.6, fur, { g: 'arm1' })
      if (!icon)
        for (const dx of [0, 2]) s.limb(19.5 + dx, 55, 0.9, 18.5 + dx, 58.5, 0.5, claw, { g: `claw${dx}` })
    }
    const head = () => {
      s.circle(25, 35, 9.5, fur, { g: 'head' })
      if (!back) {
        s.ellipse(22, 37, 7, 5.6, face, { paint: true, onto: ['head'] })
        if (!icon) {
          s.ellipse(18.5, 36, 2.6, 1.6, mask, { paint: true, onto: ['head'], rot: 20 })
          s.ellipse(25.5, 36, 2.6, 1.6, mask, { paint: true, onto: ['head'], rot: -20 })
        }
      }
    }
    if (back) {
      sprout()
      head()
      body()
      return
    }
    body()
    head()
    sprout()
    arms()
    if (icon) {
      iconEye(s, p, 21, 36)
      return
    }
    eye(s, p, 'dot2', 18, 35)
    eye(s, p, 'dot2', 24.5, 35)
    s.stamp(p.stamp(['KK']), 20.5, 39)
    s.line(19, 41, 21, 42, p.c('K'))
    s.line(21, 42, 23, 41, p.c('K'))
  },
}

const mossloth: Recipe = {
  size: 'M',
  draw(s, p) {
    const fur = p.m('mid')
    const face = p.m('pale')
    const mask = p.m('dark')
    const moss = p.m('light')
    const bloom = p.m('white')
    const claw = p.m('white')
    const back = s.back
    const icon = s.icon
    const mossy = () => {
      puff(
        s,
        [
          [30, 24, 4],
          [36, 25, 4.4],
          [41, 29, 4],
          [44, 35, 3.6],
        ],
        moss,
        { g: 'moss' },
      )
      if (!icon) for (const [x, y] of [[33, 21], [42, 27]] as const) puff(s, [[x, y, 1.6]], bloom, { g: `fl${x}` })
    }
    const body = () => {
      s.ellipse(34, 42, 13, 15, fur, { g: 'body' })
      s.ellipse(27, 58.5, 5, 2.2, fur, { g: 'foot1' })
      s.ellipse(41, 58.5, 5, 2.2, fur, { g: 'foot2', under: true })
    }
    const arms = (far: boolean) => {
      if (far) s.limb(40, 34, 3.4, 47, 46, 3, fur, { g: 'arm2', under: true })
      else {
        s.limb(25, 34, 3.8, 17, 47, 3.2, fur, { g: 'arm1' })
        if (!icon) for (const dx of [0, 2, 4]) s.limb(14 + dx, 48, 1, 12 + dx, 53, 0.5, claw, { g: `claw${dx}` })
      }
    }
    const head = () => {
      s.circle(22, 23, 9.5, fur, { g: 'head' })
      if (!back) {
        s.ellipse(19, 25, 7, 5.8, face, { paint: true, onto: ['head'] })
        if (!icon) {
          s.ellipse(15.5, 24, 3, 1.8, mask, { paint: true, onto: ['head'], rot: 20 })
          s.ellipse(22.5, 24, 3, 1.8, mask, { paint: true, onto: ['head'], rot: -20 })
        }
      }
    }
    if (back) {
      head()
      arms(true)
      body()
      mossy()
      arms(false)
      return
    }
    arms(true)
    body()
    mossy()
    head()
    arms(false)
    if (icon) {
      iconEye(s, p, 18, 24)
      return
    }
    eye(s, p, 'dot2', 15, 23)
    eye(s, p, 'dot2', 21.5, 23)
    s.stamp(p.stamp(['KK']), 17.5, 27)
    s.line(16, 29.5, 20, 29.5, p.c('K'))
  },
}

const groveloth: Recipe = {
  size: 'L',
  front: { k: 0.84 },
  draw(s, p) {
    const fur = p.m('mid')
    const face = p.m('pale')
    const mask = p.m('dark')
    const fern = p.m('light')
    const cap = p.m('white')
    const claw = p.m('white')
    const back = s.back
    const icon = s.icon
    const ferns = () => {
      for (const [x, y, tx, ty] of [
        [30, 30, 24, 14],
        [36, 28, 36, 10],
        [42, 30, 50, 14],
        [47, 35, 58, 24],
      ] as const)
        s.leaf(x, y, tx, ty, 4.2, fern, { g: `fern${x}` }, 0.3)
      if (!icon) {
        s.ellipse(52, 38, 3.2, 2, cap, { g: 'mush1' })
        s.limb(52, 39, 0.9, 52, 42, 0.9, cap, { g: 'mush1' })
        s.ellipse(28, 31, 2.6, 1.6, cap, { g: 'mush2' })
      }
    }
    const legs = (far: boolean) => {
      if (far) {
        s.limb(26, 46, 4, 23, 58, 3.4, fur, { g: 'lf2', under: true })
        s.limb(48, 46, 4.4, 50, 58, 3.6, fur, { g: 'lh2', under: true })
      } else {
        s.limb(20, 44, 4.6, 14, 57, 3.8, fur, { g: 'lf1' })
        if (!icon) for (const dx of [0, 2.5, 5]) s.limb(10 + dx, 57, 1.2, 8 + dx, 61, 0.6, claw, { g: `claw${dx}` })
        s.ellipse(43, 47, 7, 8, fur, { g: 'lh1' })
        s.limb(43, 52, 4, 42, 59, 3.4, fur, { g: 'lh1' })
      }
    }
    const body = () => s.squircle(36, 40, 18, 12, 2.2, fur, { g: 'body' })
    const head = () => {
      s.circle(15, 32, 9.5, fur, { g: 'head' })
      if (!back) {
        s.ellipse(12, 34, 7, 5.8, face, { paint: true, onto: ['head'] })
        if (!icon) {
          s.ellipse(8.5, 33, 3, 1.8, mask, { paint: true, onto: ['head'], rot: 20 })
          s.ellipse(15.5, 33, 3, 1.8, mask, { paint: true, onto: ['head'], rot: -20 })
        }
      }
    }
    if (back) {
      head()
      legs(true)
      body()
      ferns()
      legs(false)
      return
    }
    legs(true)
    ferns()
    body()
    legs(false)
    head()
    if (icon) {
      iconEye(s, p, 11, 33)
      return
    }
    eye(s, p, 'dot2', 8, 32)
    eye(s, p, 'dot2', 14.5, 32)
    s.stamp(p.stamp(['KK']), 10.5, 36)
    s.line(9, 38.5, 13, 38.5, p.c('K'))
  },
}

export const STARTER_RECIPES = { pandle, flarepaw, pyronda, dipple, billow, platyphoon, sproth, mossloth, groveloth }
