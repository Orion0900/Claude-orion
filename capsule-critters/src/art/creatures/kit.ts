/**
 * The toolkit every critter recipe uses, in four shades. Each material is a
 * ramp of those shades lit from the top left — highlight, base, shade, deep
 * shade — plus the line and outline shades. The canvas lights and quantises
 * each part; recipes only say which material a part is made of.
 */
import { fromRows, type Pixels, type Rgba } from '../../core/pixels'
import type { Canvas } from './canvas'
import type { Ramp } from './color'

/** The four shades as RGBA, lightest first; they are mapped to 0–3 at the end. */
export const W: Rgba = 0xf8f8f8ff
export const L: Rgba = 0xa8a8a8ff
export const D: Rgba = 0x585858ff
export const K: Rgba = 0x101010ff
export const SHADES = [W, L, D, K] as const

export type SizeClass = 'S' | 'M' | 'L'

/**
 * Materials from lightest to darkest. `white` stays almost entirely the
 * lightest shade (snowy fur, bellies); `black` is near solid black with a
 * dark-grey sheen; `glow` never darkens (flames, lamps, light).
 */
export const MATS = {
  white: { t: [W, W, W, L], line: D, out: K },
  pale: { t: [W, W, L, L], line: D, out: K },
  light: { t: [W, L, L, D], line: K, out: K },
  mid: { t: [L, L, D, D], line: K, out: K },
  shiny: { t: [W, L, D, D], line: K, out: K },
  dark: { t: [L, D, D, K], line: K, out: K },
  deep: { t: [L, D, K, K], line: K, out: K },
  black: { t: [D, K, K, K], line: K, out: K },
  glow: { t: [W, W, W, L], line: L, out: D },
  glowMid: { t: [W, W, L, L], line: L, out: D },
} as const satisfies Record<string, Ramp>

export type Mat = keyof typeof MATS

export interface Recipe {
  size: SizeClass
  /** Draws the critter. Check `s.view` for front / back / icon differences. */
  draw(s: Canvas, p: Pal): void
  /** Front framing: scale about the frame, and pixel shifts. */
  front?: { k?: number; dx?: number; dy?: number }
  /** Back framing tweaks (scale multiplier, shifts, extra crop). */
  back?: { k?: number; dx?: number; dy?: number }
  icon?: { k?: number; dx?: number; dy?: number }
}

const SHADE_LETTER: Readonly<Record<string, Rgba>> = { W, L, D, K, w: W, l: L, d: D, k: K }

/** Palette context: materials and stamps in the four shades. */
export class Pal {
  m(name: Mat): Ramp {
    return MATS[name]
  }

  /** A one-off ramp: four tones plus line and outline shades, by letter. */
  ramp(tones: string, line = 'K', out = 'K'): Ramp {
    const t = [...tones].map((c) => SHADE_LETTER[c]) as [Rgba, Rgba, Rgba, Rgba]
    return { t, line: SHADE_LETTER[line], out: SHADE_LETTER[out] }
  }

  /** A shade by letter (W L D K). */
  c(letter: string): Rgba {
    const v = SHADE_LETTER[letter]
    if (v === undefined) throw new Error(`unknown shade ${letter}`)
    return v
  }

  /**
   * Builds a stamp from rows. Letters W L D K are shades; '.' is clear; other
   * letters are looked up in `key` (also shade letters).
   */
  stamp(rows: readonly string[], key: Readonly<Record<string, string>> = {}): Pixels {
    const pal: Record<string, Rgba> = { W, L, D, K }
    for (const [k, v] of Object.entries(key)) pal[k] = SHADE_LETTER[v]
    return fromRows(rows, pal)
  }
}

/**
 * Eye stamps for a critter facing left (the glint sits top-left). Letters:
 * o rim, p pupil, i iris, w white, h highlight.
 */
export const EYES = {
  dot2: ['hp', 'pp'],
  dot3: ['hp', 'pp', 'pp'],
  bead33: ['.p.', 'hpp', '.p.'],
  bead44: ['.pp.', 'phpp', 'pppp', '.pp.'],
  round45: ['.pp.', 'phhp', 'phpp', 'pppp', '.pp.'],
  round56: ['.ppp.', 'phhpp', 'phppp', 'ppppp', 'pppwp', '.ppp.'],
  big66: ['.pppp.', 'phhppp', 'phhppp', 'pppppp', 'ppppwp', '.pppp.'],
  white45: ['.oo.', 'ohwo', 'owpo', 'owpo', '.oo.'],
  white56: ['.ooo.', 'ohwwo', 'owppo', 'owppo', 'owwwo', '.ooo.'],
  iris45: ['.oo.', 'ohio', 'opio', 'oiio', '.oo.'],
  iris56: ['.ooo.', 'ohpio', 'oppio', 'oppio', 'oiiio', '.ooo.'],
  narrow53: ['ooooo', 'ohpio', '.ooo.'],
  fierce54: ['oo...', 'ohoo.', 'oppio', '.ooo.'],
  glow44: ['.oo.', 'ohho', 'ohho', '.oo.'],
  glow33: ['ooo', 'oho', 'ooo'],
  sleepy53: ['.ooo.', 'ohppo', '.ooo.'],
  closed52: ['.ooo.', 'o...o'],
} as const

export type EyeKind = keyof typeof EYES

export interface EyeShades {
  o?: string
  p?: string
  i?: string
  w?: string
  h?: string
}

/** Places an eye stamp with its top-left at design (x, y). */
export function eye(s: Canvas, p: Pal, kind: EyeKind, x: number, y: number, c: EyeShades = {}): void {
  const key = { o: c.o ?? 'K', p: c.p ?? 'K', i: c.i ?? 'D', w: c.w ?? 'W', h: c.h ?? 'W' }
  s.stamp(p.stamp(EYES[kind], key), x, y)
}

/** A tiny eye for party icons, centred on (x, y): 'dark' a black bead, 'glow' a pale one. */
export function iconEye(s: Canvas, p: Pal, x: number, y: number, kind: 'dark' | 'glow' = 'dark'): void {
  s.stampC(p.stamp(kind === 'dark' ? ['K'] : ['W']), x, y)
}
