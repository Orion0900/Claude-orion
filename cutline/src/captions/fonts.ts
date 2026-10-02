/**
 * The caption typefaces.
 *
 * They're registered with the FontFace API rather than imported as CSS so
 * the same faces work in a worker drawing on an OffscreenCanvas (a worker
 * can't see the page's stylesheets). Each weight comes in two pieces split
 * by unicode-range, the way Google Fonts serves them: basic Latin, and the
 * accented letters of Central European, Turkish, Baltic and other
 * Latin-script languages. A browser only downloads the pieces some text
 * actually uses.
 *
 * In a page, the faces are registered as this module loads, so CSS can use
 * the family names too (font pickers, preset previews).
 */
import type { FontId } from '../lib/types'

import antonLatin from '@fontsource/anton/files/anton-latin-400-normal.woff2?url'
import antonLatinExt from '@fontsource/anton/files/anton-latin-ext-400-normal.woff2?url'
import bangersLatin from '@fontsource/bangers/files/bangers-latin-400-normal.woff2?url'
import bangersLatinExt from '@fontsource/bangers/files/bangers-latin-ext-400-normal.woff2?url'
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url'
import inter500Ext from '@fontsource/inter/files/inter-latin-ext-500-normal.woff2?url'
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url'
import inter600Ext from '@fontsource/inter/files/inter-latin-ext-600-normal.woff2?url'
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url'
import inter700Ext from '@fontsource/inter/files/inter-latin-ext-700-normal.woff2?url'
import montserrat700 from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url'
import montserrat700Ext from '@fontsource/montserrat/files/montserrat-latin-ext-700-normal.woff2?url'
import montserrat800 from '@fontsource/montserrat/files/montserrat-latin-800-normal.woff2?url'
import montserrat800Ext from '@fontsource/montserrat/files/montserrat-latin-ext-800-normal.woff2?url'
import montserrat900 from '@fontsource/montserrat/files/montserrat-latin-900-normal.woff2?url'
import montserrat900Ext from '@fontsource/montserrat/files/montserrat-latin-ext-900-normal.woff2?url'
import markerLatin from '@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2?url'
import poppins600 from '@fontsource/poppins/files/poppins-latin-600-normal.woff2?url'
import poppins600Ext from '@fontsource/poppins/files/poppins-latin-ext-600-normal.woff2?url'
import poppins700 from '@fontsource/poppins/files/poppins-latin-700-normal.woff2?url'
import poppins700Ext from '@fontsource/poppins/files/poppins-latin-ext-700-normal.woff2?url'
import poppins800 from '@fontsource/poppins/files/poppins-latin-800-normal.woff2?url'
import poppins800Ext from '@fontsource/poppins/files/poppins-latin-ext-800-normal.woff2?url'

export const FONTS: Record<FontId, { label: string; family: string; weights: number[] }> = {
  montserrat: { label: 'Montserrat', family: 'Montserrat', weights: [700, 800, 900] },
  anton: { label: 'Anton', family: 'Anton', weights: [400] },
  bangers: { label: 'Bangers', family: 'Bangers', weights: [400] },
  inter: { label: 'Inter', family: 'Inter', weights: [500, 600, 700] },
  poppins: { label: 'Poppins', family: 'Poppins', weights: [600, 700, 800] },
  marker: { label: 'Permanent Marker', family: 'Permanent Marker', weights: [400] },
}

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'

/** weight → [Latin file, Latin Extended file]. Permanent Marker only has Latin. */
const FILES: Record<FontId, Record<number, readonly string[]>> = {
  montserrat: {
    700: [montserrat700, montserrat700Ext],
    800: [montserrat800, montserrat800Ext],
    900: [montserrat900, montserrat900Ext],
  },
  anton: { 400: [antonLatin, antonLatinExt] },
  bangers: { 400: [bangersLatin, bangersLatinExt] },
  inter: { 500: [inter500, inter500Ext], 600: [inter600, inter600Ext], 700: [inter700, inter700Ext] },
  poppins: { 600: [poppins600, poppins600Ext], 700: [poppins700, poppins700Ext], 800: [poppins800, poppins800Ext] },
  marker: { 400: [markerLatin] },
}

/** The shipped weight nearest to the one asked for, so canvas never fakes a bold. Ties go heavier. */
export function resolveWeight(font: FontId, weight: number): number {
  const weights = FONTS[font]?.weights ?? [400]
  let best = weights[0]
  for (const w of weights) {
    const d = Math.abs(w - weight)
    const bestD = Math.abs(best - weight)
    if (d < bestD || (d === bestD && w > best)) best = w
  }
  return best
}

/** A CSS font shorthand for canvas, with a system fallback for glyphs the face lacks. */
export function fontString(font: FontId, weight: number, px: number): string {
  const family = FONTS[font]?.family ?? 'sans-serif'
  return `${resolveWeight(font, weight)} ${Math.round(px * 100) / 100}px "${family}", sans-serif`
}

let epoch = 0
/**
 * Goes up whenever a face finishes loading. Text measured before then was
 * measured in a fallback face, so the renderer drops its caches when this
 * changes.
 */
export const fontEpoch = () => epoch

/** The FontFaceSet of this page or worker, if it has one. */
function fontSet(): FontFaceSet | null {
  if (typeof document !== 'undefined' && document.fonts) return document.fonts
  return (globalThis as { fonts?: FontFaceSet }).fonts ?? null
}

/** Our faces in each FontFaceSet they've been added to. */
const registered = new WeakMap<FontFaceSet, FontFace[]>()
let loadedFaces = 0

/** Bumps the epoch if any of our faces has finished loading since last time. */
function noteLoads(set: FontFaceSet): void {
  let loaded = 0
  for (const face of registered.get(set) ?? []) if (face.status === 'loaded') loaded++
  if (loaded !== loadedFaces) {
    loadedFaces = loaded
    epoch++
  }
}

function register(set: FontFaceSet): void {
  if (registered.has(set) || typeof FontFace === 'undefined') return
  const faces: FontFace[] = []
  registered.set(set, faces)
  set.addEventListener?.('loadingdone', () => noteLoads(set))
  for (const id of Object.keys(FILES) as FontId[]) {
    for (const [weight, files] of Object.entries(FILES[id])) {
      files.forEach((file, i) => {
        // Dev serves files at a root path and a build gives absolute URLs; resolving against
        // this module makes both absolute, which a worker started from a blob: URL needs.
        const url = new URL(file, import.meta.url).href
        const face = new FontFace(FONTS[id].family, `url("${url}") format("woff2")`, {
          weight,
          unicodeRange: i === 0 ? LATIN : LATIN_EXT,
          display: 'swap',
        })
        faces.push(face)
        set.add(face)
      })
    }
  }
}

if (typeof document !== 'undefined' && document.fonts) register(document.fonts)

/** Covers both pieces of a face, so accented text is ready as well as plain. */
const SAMPLE = 'AaĄ'
const LOAD_TIMEOUT = 8000

/**
 * Make sure the style's face is ready before drawing to canvas (canvas
 * won't wait for webfonts). Pass the text about to be drawn to be sure of
 * any unusual characters in it. Never rejects: if a face can't load (say,
 * offline before it was ever cached) the captions fall back to a system
 * face rather than failing the export.
 */
export async function ensureFont(font: FontId, weight: number, text: string = SAMPLE): Promise<void> {
  const set = fontSet()
  if (!set || !FONTS[font]) return
  register(set)
  const spec = `${resolveWeight(font, weight)} 64px "${FONTS[font].family}"`
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      set.load(spec, text || SAMPLE),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, LOAD_TIMEOUT)
      }),
    ])
  } catch {
    // Drawn in the fallback face instead.
  } finally {
    clearTimeout(timer)
    // Not every FontFaceSet (a worker's, say) fires loadingdone, so check here too.
    noteLoads(set)
  }
}
