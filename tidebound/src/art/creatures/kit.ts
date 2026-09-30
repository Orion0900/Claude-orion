/**
 * The toolkit every species recipe uses: the palette context (which applies
 * the shiny recolour to every colour a recipe asks for), the recipe type,
 * and small pixel-precise stamps for eyes and other facial details.
 */
import { fromRows, hex, type Pixels, type Rgba } from '../../core/pixels'
import type { Canvas } from './canvas'
import { glow, makeRecolor, ramp, ramp3, type Ramp, type RampOpts, type Recolor, type ShinySpec } from './color'

export type SizeClass = 'S' | 'M' | 'L'

export interface Recipe {
  size: SizeClass
  /** Draws the beast. Check `s.view` for front / back / icon differences. */
  draw(s: Canvas, p: Pal): void
  /** Front-view framing: scale about the ground anchor (32, 60), and pixel shifts. */
  front?: { k?: number; dx?: number; dy?: number }
  /**
   * Back-view framing tweaks. The back is framed automatically (scaled up to
   * fill the frame, centred, cropped at the bottom); `k` multiplies that
   * scale, `dx` shifts it, `dy` crops more (+) or less (−).
   */
  back?: { k?: number; dx?: number; dy?: number }
  /** Icon framing override: scale and shifts. */
  icon?: { k?: number; dx?: number; dy?: number }
  shiny: ShinySpec
}

/** Palette context: every colour goes through here so shiny recolours apply everywhere. */
export class Pal {
  readonly rc: Recolor
  readonly shiny: boolean
  private readonly cache = new Map<string, Ramp>()

  constructor(spec: ShinySpec | undefined, shiny: boolean) {
    this.shiny = shiny
    this.rc = shiny ? makeRecolor(spec) : (c) => c
  }

  c(s: string): Rgba {
    return this.rc(hex(s))
  }

  private opts(o: RampOpts): RampOpts {
    const m = (v: string | Rgba | undefined) => (v === undefined ? undefined : this.rc(typeof v === 'number' ? v : hex(v)))
    return { ...o, hiC: m(o.hiC), shC: m(o.shC), deepC: m(o.deepC), lineC: m(o.lineC), outC: m(o.outC) }
  }

  /** A generated four-tone ramp from one base colour. */
  ramp(base: string, o: RampOpts = {}): Ramp {
    const key = `r${base}${JSON.stringify(o)}`
    let r = this.cache.get(key)
    if (!r) {
      r = ramp(this.c(base), this.opts(o))
      this.cache.set(key, r)
    }
    return r
  }

  /** A ramp from explicit highlight, base and shade. */
  ramp3(hi: string, base: string, sh: string, o: RampOpts = {}): Ramp {
    const key = `3${hi}${base}${sh}${JSON.stringify(o)}`
    let r = this.cache.get(key)
    if (!r) {
      r = ramp3(this.c(hi), this.c(base), this.c(sh), this.opts(o))
      this.cache.set(key, r)
    }
    return r
  }

  /** A ramp for glowing parts: bright core, no dark falloff. */
  glow(core: string, mid: string, edge: string, out?: string): Ramp {
    const key = `g${core}${mid}${edge}${out ?? ''}`
    let r = this.cache.get(key)
    if (!r) {
      r = glow(this.c(core), this.c(mid), this.c(edge), out === undefined ? undefined : this.c(out))
      this.cache.set(key, r)
    }
    return r
  }

  /** Builds a stamp from rows with palette letters mapped through the recolour. */
  stamp(rows: readonly string[], colours: Readonly<Record<string, string>>): Pixels {
    const pal: Record<string, Rgba> = {}
    for (const [k, v] of Object.entries(colours)) pal[k] = this.c(v)
    return fromRows(rows, pal)
  }
}

/**
 * Eye stamps, drawn for a beast facing left (pupils lean toward the foe, the
 * highlight sits top-left). Letters: o rim, p pupil, i iris, j iris shade,
 * w white, h highlight.
 */
export const EYES = {
  /** 2×2 bead. */
  bead2: ['hp', 'pp'],
  /** 2×3 tall bead. */
  bead3: ['hp', 'pp', 'pp'],
  /** 3×3 bead. */
  bead33: ['hpp', 'ppp', '.p.'],
  /** 3×4 bead. */
  bead34: ['.p.', 'hpp', 'ppp', '.p.'],
  /** 4×4 round bead. */
  bead44: ['.pp.', 'phpp', 'pppp', '.pp.'],
  /** 4×5 big friendly dark eye. */
  round45: ['.pp.', 'phhp', 'phpp', 'pppp', '.pp.'],
  /** 5×6 big friendly dark eye with a second glint. */
  round56: ['.ppp.', 'phhpp', 'phppp', 'ppppp', 'pppwp', '.ppp.'],
  /** 3×4 coloured eye, pupil leaning left. */
  iris34: ['.o.', 'ohi', 'opi', '.o.'],
  /** 4×5 coloured iris with a dark rim. */
  iris45: ['.oo.', 'ohio', 'opio', 'opjo', '.oo.'],
  /** 5×6 coloured iris, large. */
  iris56: ['.ooo.', 'ohpio', 'oppio', 'oppio', 'ojjjo', '.ooo.'],
  /** 6×6 huge round iris (lemurs). */
  iris66: ['.oooo.', 'ohhiio', 'ohppio', 'oppiio', 'ojjjjo', '.oooo.'],
  /** Narrow determined eye, 5×3: heavy lid across the top. */
  narrow53: ['ooooo', 'ohpio', '.ooo.'],
  /** Fierce slanted eye 5×4 (brow slopes down toward the snout). */
  fierce54: ['oo...', 'ohoo.', 'oppio', '.ooo.'],
  /** Glowing eye 4×4: bright core, no pupil. */
  glow44: ['.oo.', 'ohio', 'oiio', '.oo.'],
  /** Glowing eye 3×3. */
  glow33: ['ooo', 'ohi', 'ooo'],
  /** Sleepy half-closed eye, 5×3. */
  sleepy53: ['.ooo.', 'ohppo', '.ooo.'],
  /** Closed happy arc, 5×2. */
  closed52: ['.ooo.', 'o...o'],
} as const

export type EyeKind = keyof typeof EYES

export interface EyeColours {
  o?: string
  p?: string
  i?: string
  j?: string
  w?: string
  h?: string
}

/** Places an eye stamp with its top-left at design (x, y). */
export function eye(s: Canvas, p: Pal, kind: EyeKind, x: number, y: number, c: EyeColours = {}): void {
  const rows = EYES[kind]
  const pal: Record<string, string> = {
    o: c.o ?? '#201820',
    p: c.p ?? '#181420',
    i: c.i ?? '#f0a020',
    j: c.j ?? darkerHex(c.i ?? '#f0a020'),
    w: c.w ?? '#ffffff',
    h: c.h ?? '#ffffff',
  }
  s.stamp(p.stamp(rows, pal), x, y)
}

function darkerHex(h: string): string {
  const v = hex(h)
  const r = Math.round(((v >>> 24) & 255) * 0.72)
  const g = Math.round(((v >>> 16) & 255) * 0.62)
  const b = Math.round(((v >>> 8) & 255) * 0.62)
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
}

/**
 * A tiny eye for party icons, centred on the design-space centre of the
 * front sprite's eye: 'dark' (black bead with a glint), 'iris' (coloured with
 * a pupil), 'glow' (a bright slit), 'slit' (sleepy or narrow line).
 */
export function iconEye(s: Canvas, p: Pal, x: number, y: number, kind: 'dark' | 'iris' | 'glow' | 'slit', c: EyeColours = {}): void {
  const rows: Record<typeof kind, string[]> = {
    dark: ['hp', 'pp'],
    iris: ['hi', 'ip'],
    glow: ['ii'],
    slit: ['pp'],
  }
  const pal: Record<string, string> = { p: c.p ?? '#181420', i: c.i ?? '#f0a020', h: c.h ?? '#ffffff' }
  s.stampC(p.stamp(rows[kind], pal), x, y)
}
