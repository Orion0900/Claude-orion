/**
 * Just enough colour maths for the caption renderer: the pale core of a
 * neon word and see-through versions of a style's colours. Anything it
 * can't parse (a named colour, say) is passed through untouched, so a
 * style can still use any CSS colour.
 */

export type RGBA = [number, number, number, number]

const NAMED: Record<string, RGBA> = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
}

export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase()
  if (NAMED[s]) return [...NAMED[s]]
  if (s.startsWith('#')) {
    const h = s.slice(1)
    if (!/^[0-9a-f]+$/.test(h)) return null
    if (h.length === 3 || h.length === 4) {
      const n = (i: number) => parseInt(h[i] + h[i], 16)
      return [n(0), n(1), n(2), h.length === 4 ? n(3) / 255 : 1]
    }
    if (h.length === 6 || h.length === 8) {
      const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
      return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]
    }
    return null
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/.exec(s)
  if (!m) return null
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1)
  return [Number(m[1]), Number(m[2]), Number(m[3]), Math.min(1, Math.max(0, alpha))]
}

export function formatColor([r, g, b, a]: RGBA): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)))
  if (a >= 1) return `rgb(${c(r)},${c(g)},${c(b)})`
  return `rgba(${c(r)},${c(g)},${c(b)},${Math.round(Math.max(0, a) * 1000) / 1000})`
}

/** `a` blended towards `b` by k (0 = a, 1 = b). */
export function mixColor(a: string, b: string, k: number): string {
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (!ca || !cb) return k < 0.5 ? a : b
  return formatColor([
    ca[0] + (cb[0] - ca[0]) * k,
    ca[1] + (cb[1] - ca[1]) * k,
    ca[2] + (cb[2] - ca[2]) * k,
    ca[3] + (cb[3] - ca[3]) * k,
  ])
}

/** The colour with its opacity multiplied by alpha. */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color)
  if (!c) return color
  return formatColor([c[0], c[1], c[2], c[3] * alpha])
}
