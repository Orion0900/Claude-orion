/**
 * Small text helpers shared by the matching code. Kept free of I/O so they
 * can be tested directly.
 */

/** Lower-case, strip punctuation and episode-number noise, collapse spaces. */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\b(ep|episode|e|#)\s*\.?\s*(\d+)\b/g, ' $2 ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): Set<string> {
  return new Set(normalizeTitle(s).split(' ').filter((t) => t.length > 0))
}

/**
 * Sørensen–Dice similarity over word tokens, 0..1. Robust to feeds that
 * prefix titles with numbers or suffix them with the show name.
 */
export function similarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return (2 * shared) / (ta.size + tb.size)
}

/** True when one normalized title contains the other whole. */
export function containsTitle(a: string, b: string): boolean {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return false
  return na.includes(nb) || nb.includes(na)
}

/** Parse an RSS <itunes:duration>: "3725", "1:02:05" or "62:05" → seconds. */
export function parseDuration(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined
  const s = String(value).trim()
  if (!s) return undefined
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s))
  const parts = s.split(':').map((p) => Number(p))
  if (parts.some((p) => Number.isNaN(p))) return undefined
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

/** Seconds → "h:mm:ss" or "m:ss". */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** Decode the handful of HTML entities that show up in meta tags and feeds. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

/** Strip tags from HTML-ish descriptions (show notes are often HTML). */
export function stripHtml(s: string): string {
  return decodeEntities(
    s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
