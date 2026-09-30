/**
 * ZAPPET → LEMURGE: static lemurs.
 */
import type { SpeciesId } from '../../../data/dex'
import type { P3 } from '../canvas'
import { eye, iconEye, type Recipe } from '../kit'
import { spiral, stripes, zigzag } from '../parts'

const zappet: Recipe = {
  size: 'S',
  front: { k: 0.88 },
  shiny: { hue: 150, sat: 0.9, band: [30, 70] },
  draw(s, p) {
    const fur = p.ramp3('#c8c8d0', '#a8a8b0', '#7c7c88', { deepC: '#606068' })
    const white = p.ramp('#f0f0f0', { sh: 0.1, deep: 0.22 })
    const black = p.ramp3('#585860', '#303038', '#202028')
    const volt = p.ramp3('#fff8a0', '#f8d028', '#c89810')
    const back = s.back
    const icon = s.icon
    const tailPath: P3[] = [
      [40, 49, 2.6],
      [48, 45, 2.5],
      [53, 36, 2.4],
      [53, 26, 2.3],
      [48, 18.5, 2.2],
      [41.5, 18, 2],
      [39.5, 23, 1.8],
      [43, 26.5, 1.6],
    ]
    const tail = () => {
      s.tube(tailPath, volt, { g: 'tail' })
      stripes(s, tailPath, 7, 3.2, black, ['tail'], { zig: 1.2 })
    }
    const legs = (far: boolean) => {
      if (far) {
        s.limb(25, 52, 2, 23.5, 58.5, 1.8, fur, { g: 'lf2', under: true })
        s.limb(40, 52, 2.2, 42.5, 58.5, 1.8, fur, { g: 'lh2', under: true })
      } else {
        s.limb(21, 51, 2.3, 18.5, 58.5, 2, fur, { g: 'lf1' })
        s.ellipse(17.5, 59, 2.6, 1.6, fur, { g: 'lf1' })
        s.ellipse(37, 52, 5, 5.5, fur, { g: 'lh1' })
        s.ellipse(36.5, 59, 3.4, 1.6, fur, { g: 'lh1' })
      }
    }
    const body = () => {
      s.ellipse(31, 49, 11, 7.5, fur, { g: 'body', rot: -8 })
      if (!back) s.ellipse(25, 52, 6, 4.5, white, { paint: true, onto: ['body'] })
    }
    const head = () => {
      s.circle(26.5, 34, 2.7, fur, { g: 'ear2' })
      s.ellipse(19, 41, 9, 8.5, fur, { g: 'head' })
      if (!back) s.ellipse(15.5, 43, 7.2, 6.5, white, { paint: true, onto: ['head'] })
      s.circle(23, 34.5, 3, fur, { g: 'ear1' })
      // Spiky static tuft.
      for (const [x, y, tx, ty] of [
        [16, 34, 13, 27],
        [19, 33.5, 19, 26],
        [22, 34, 25, 28],
      ] as const)
        s.limb(x, y, 2, tx, ty, 0.5, fur, { g: 'head' })
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
      iconEye(s, p, 18.5, 41, 'iris', { i: '#f8a820', p: '#201008' })
      iconEye(s, p, 12, 41, 'iris', { i: '#f8a820', p: '#201008' })
      return
    }
    const ec = { o: '#202028', i: '#f8a820', j: '#d07010', p: '#201008', h: '#ffffff' }
    eye(s, p, 'iris66', 15.5, 38, ec)
    s.stamp(p.stamp(['.oo', 'ohi', 'opi', 'ojj', '.oo'], ec), 10, 38.5)
    s.stamp(p.stamp(['oo', 'oo'], { o: '#202028' }), 11.5, 45)
    s.pxs([12, 48, 13, 48.5], p.c('#606068'))
  },
}

const lemurge: Recipe = {
  size: 'M',
  front: { k: 0.86 },
  shiny: { hue: 150, sat: 0.9, band: [30, 70] },
  draw(s, p) {
    const fur = p.ramp3('#b8b8c8', '#9898a8', '#6c6c7c', { deepC: '#505060' })
    const white = p.ramp('#e8e8f0', { sh: 0.1, deep: 0.22 })
    const black = p.ramp3('#484850', '#282830', '#18181e')
    const volt = p.ramp3('#fffcc8', '#ffe040', '#c8a018')
    const spark = p.glow('#ffffff', '#fff070', '#f8c820', '#8a5c08')
    const back = s.back
    const icon = s.icon

    // The tail coils into a tight clock-spring spiral behind the body.
    const coil: P3[] = [[37, 47, 2.4], [44, 50, 2.3], ...spiral(48.5, 34, 13, 2.5, 100, -440, 2.2, 1.3, 40)]
    const tail = () => {
      s.tube(coil, volt, { g: 'tail' }, 2)
      stripes(s, coil, 6.5, 2.8, black, ['tail'])
    }
    const legs = (far: boolean) => {
      if (far) s.tube([[36, 44, 3], [40.5, 51, 2.4], [39, 58.5, 2]], fur, { g: 'lg2', under: true })
      else {
        s.tube([[30, 44, 3.4], [25, 51, 2.6], [27, 58.5, 2.2]], fur, { g: 'lg1' })
        s.ellipse(25.5, 59.3, 3.2, 1.6, fur, { g: 'lg1' })
      }
    }
    const body = () => {
      s.ellipse(33, 36, 7.5, 11.5, fur, { g: 'body', rot: -8 })
      if (!back) s.ellipse(30, 37, 4.5, 9, white, { paint: true, onto: ['body'], rot: -8 })
    }
    const arms = (far: boolean) => {
      if (far) {
        s.tube([[36, 28.5, 2.4], [30, 22, 2], [20, 22, 1.8]], fur, { g: 'arm2', under: true })
        s.circle(18.5, 22, 2.3, black, { g: 'hand2', under: true })
      } else {
        s.tube([[29, 30, 2.6], [22, 36, 2.2], [14, 36, 1.9]], fur, { g: 'arm1' })
        s.circle(12.5, 36, 2.4, black, { g: 'hand1' })
      }
    }
    const head = () => {
      s.circle(27, 17, 7.5, fur, { g: 'head' })
      if (!back) {
        s.ellipse(24, 19, 6, 5.2, white, { paint: true, onto: ['head'] })
        s.ellipse(22, 18.5, 5, 3.2, black, { paint: true, onto: ['head'] })
        s.ellipse(18.5, 20.5, 3.2, 2.6, black, { g: 'snout' })
      }
      for (const [x, y, tx, ty] of [
        [24, 11, 20, 2],
        [27.5, 10, 28, 0],
        [31, 11, 35, 3],
        [33, 14, 39, 9],
      ] as const)
        s.limb(x, y, 2.2, tx, ty, 0.6, fur, { g: 'crest' })
      if (!icon)
        for (const [x, y] of [
          [20, 3],
          [28, 1],
          [35, 4],
          [38.5, 9],
        ])
          s.dot(x, y, spark, 1)
    }
    const sparks = () => {
      const pts = zigzag(15, 24, 12, 34, 4, 1.8)
      for (let i = 1; i < pts.length; i++) s.limb(pts[i - 1][0], pts[i - 1][1], 1, pts[i][0], pts[i][1], 1, spark, { g: 'bolt', flat: 2 })
      if (!icon) {
        s.dot(10, 27, spark, 1).dot(9, 28, spark, 2).dot(17, 30, spark, 1).dot(8, 33, spark, 2)
        s.dot(15, 19, spark, 2).dot(21, 38, spark, 2)
      }
    }
    if (back) {
      arms(false)
      head()
      legs(false)
      body()
      legs(true)
      arms(true)
      tail()
      return
    }
    tail()
    arms(true)
    legs(true)
    body()
    legs(false)
    head()
    arms(false)
    sparks()
    if (icon) {
      iconEye(s, p, 24.5, 17.5, 'glow', { i: '#f8a820' })
      return
    }
    s.stamp(p.stamp(['oooo.', 'ohiio', '.ooo.'], { o: '#101014', i: '#f8a820', h: '#ffffff' }), 22, 16)
    s.stamp(p.stamp(['ooo', 'hio'], { o: '#101014', i: '#f8a820', h: '#ffffff' }), 17.5, 16.5)
  },
}

export const LEMUR_LINE = { zappet, lemurge } satisfies Partial<Record<SpeciesId, Recipe>>
