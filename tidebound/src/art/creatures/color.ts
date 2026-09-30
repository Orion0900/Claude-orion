/**
 * Colour ramps for creature art. Every material on a beast is a Ramp: four
 * tones lit from the top left (highlight, base, shade, deep shade), plus a
 * darker line colour for edges inside the sprite and the outline colour for
 * its silhouette. Shades drift toward blue-violet and highlights toward warm
 * yellow, the way pixel artists hue-shift, so shading never looks muddy.
 */
import { channels, hex, rgba, type Rgba } from '../../core/pixels'

export interface Ramp {
  /** Highlight, base, shade, deep shade. */
  readonly t: readonly [Rgba, Rgba, Rgba, Rgba]
  /** Internal edge line drawn where this part overlaps another. */
  readonly line: Rgba
  /** 1px silhouette outline next to this part. */
  readonly out: Rgba
}

export function rgbToHsl(c: Rgba): [number, number, number] {
  const [r8, g8, b8] = channels(c)
  const r = r8 / 255
  const g = g8 / 255
  const b = b8 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return [h, s, l]
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

export function hslToRgb(h: number, s: number, l: number): Rgba {
  h = (((h % 360) + 360) % 360) / 360
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  if (s === 0) {
    const v = Math.round(l * 255)
    return rgba(v, v, v)
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return rgba(
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  )
}

/** Moves hue h toward target by up to `amt` degrees along the shorter arc. */
export function hueToward(h: number, target: number, amt: number): number {
  let d = (((target - h) % 360) + 540) % 360 - 180
  if (Math.abs(d) <= amt) return target
  return h + Math.sign(d) * amt
}

export function col(c: string | Rgba): Rgba {
  return typeof c === 'number' ? c : hex(c)
}

/** Chroma: the spread between the strongest and weakest channel, 0..1. */
export function chroma(c: Rgba): number {
  const [r, g, b] = channels(c)
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255
}

/** Relative luminance-ish lightness 0..1, for picking contrasting details. */
export function luma(c: Rgba): number {
  const [r, g, b] = channels(c)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

const SHADE_HUE = 250
const LIGHT_HUE = 55

/** Hue-shifted lighter / darker variants of one colour. */
export function lighten(c: Rgba, amt: number): Rgba {
  const [h, s, l] = rgbToHsl(c)
  const hs = s < 0.08 ? h : hueToward(h, LIGHT_HUE, 10 * amt * 2)
  return hslToRgb(hs, s * (1 - amt * 0.25), l + (1 - l) * amt)
}

export function darken(c: Rgba, amt: number): Rgba {
  const [h, s, l] = rgbToHsl(c)
  const hs = hueToward(h, SHADE_HUE, 34 * amt)
  const ss = s < 0.06 ? s + 0.06 * amt : Math.min(1, s + (1 - s) * 0.25 * amt + 0.04)
  return hslToRgb(hs, ss, l * (1 - amt))
}

export interface RampOpts {
  /** How far the highlight goes toward white (0..1). */
  hi?: number
  /** Darkening of the shade and deep tones (fractions of lightness lost). */
  sh?: number
  deep?: number
  /** Explicit tones override the generated ones. */
  hiC?: string | Rgba
  shC?: string | Rgba
  deepC?: string | Rgba
  lineC?: string | Rgba
  outC?: string | Rgba
}

/** A four-tone ramp generated from one base colour. */
export function ramp(base: string | Rgba, o: RampOpts = {}): Ramp {
  const b = col(base)
  const hi = o.hiC !== undefined ? col(o.hiC) : lighten(b, o.hi ?? 0.42)
  const sh = o.shC !== undefined ? col(o.shC) : darken(b, o.sh ?? 0.2)
  const deep = o.deepC !== undefined ? col(o.deepC) : darken(b, o.deep ?? 0.38)
  const [, , l] = rgbToHsl(b)
  const line = o.lineC !== undefined ? col(o.lineC) : darken(deep, Math.min(0.62, Math.max(0.3, 1 - 0.2 / Math.max(0.05, rgbToHsl(deep)[2]))))
  const out = o.outC !== undefined ? col(o.outC) : outlineOf(b, l)
  return { t: [hi, b, sh, deep], line, out }
}

/** A ramp from explicit highlight, base and shade; deep and lines derived. */
export function ramp3(hi: string | Rgba, base: string | Rgba, sh: string | Rgba, o: RampOpts = {}): Ramp {
  const s = col(sh)
  return ramp(base, { hiC: hi, shC: s, deepC: o.deepC ?? darken(s, o.deep ?? 0.22), ...o })
}

function outlineOf(base: Rgba, l: number): Rgba {
  const [h, s] = rgbToHsl(base)
  const hs = hueToward(h, SHADE_HUE, 30)
  const target = Math.min(0.16, 0.08 + l * 0.08)
  return hslToRgb(hs, s < 0.08 ? 0.12 : Math.min(0.75, s * 0.7 + 0.12), target)
}

/** A flat ramp for glowing things: all tones bright, no dark falloff. */
export function glow(core: string | Rgba, mid: string | Rgba, edge: string | Rgba, out?: string | Rgba): Ramp {
  const e = col(edge)
  return { t: [col(core), col(core), col(mid), e], line: darken(e, 0.35), out: out !== undefined ? col(out) : darken(e, 0.55) }
}

/** Shiny recolour: a function applied to every colour a recipe asks for. */
export type Recolor = (c: Rgba) => Rgba

export interface ShinySpec {
  /** Rotate the hue of saturated colours by this many degrees. */
  hue?: number
  /** Saturation multiplier for rotated colours. */
  sat?: number
  /** Lightness shift for rotated colours (-1..1). */
  light?: number
  /** Colours below this chroma (max−min channel, 0..1) keep their hue: greys, creams, whites. */
  minSat?: number
  /** Exact replacements for specific base colours, checked first. */
  map?: Readonly<Record<string, string>>
  /** Only rotate colours whose hue lies in [from, to) (degrees, may wrap). */
  band?: readonly [number, number]
}

function inBand(h: number, band: readonly [number, number]): boolean {
  const [a, b] = band
  return a <= b ? h >= a && h < b : h >= a || h < b
}

export function makeRecolor(spec: ShinySpec | undefined): Recolor {
  if (!spec) return (c) => c
  const map = new Map<number, Rgba>()
  for (const [k, v] of Object.entries(spec.map ?? {})) map.set(hex(k), hex(v))
  const minSat = spec.minSat ?? 0.16
  return (c) => {
    const m = map.get(c)
    if (m !== undefined) return m
    const [h, s, l] = rgbToHsl(c)
    if (chroma(c) < minSat) return c
    if (spec.band && !inBand(h, spec.band)) return c
    return hslToRgb(h + (spec.hue ?? 0), s * (spec.sat ?? 1), l + (spec.light ?? 0) * (spec.light! > 0 ? 1 - l : l))
  }
}
