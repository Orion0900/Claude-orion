/**
 * Word matching that behaves the way a person expects.
 *
 * Job posts write the same skill several ways — "Node.js", "node js",
 * "NodeJS" — so matching has to survive punctuation and spacing without
 * matching *inside* longer words: someone who excludes "java" should not lose
 * every JavaScript job.
 */

/** Lowercase, punctuation flattened to single spaces. `+` and `#` survive, for C++ and C#. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * A plural and its singular are the same word for our purposes: someone whose
 * strength is "design systems" wants the post about a design system. Only the
 * trailing s goes, and only where dropping it can't wreck the word — "css"
 * and "ios" stay as they are.
 */
function stem(word: string): string {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word
}

/**
 * True when `term` appears in `haystack` as a whole word or phrase.
 *
 * Matching is always on word boundaries, so "java" never matches
 * "javascript". On top of that a term and the text are allowed to disagree
 * about spacing — "node.js", "node js" and "nodejs" all match each other,
 * because run-together spellings are compared as well.
 */
export function containsTerm(haystack: string, term: string): boolean {
  const needle = normalise(term)
  if (!needle) return false

  const words = normalise(haystack).split(' ')
  const hay = ` ${words.join(' ')} `
  if (hay.includes(` ${needle} `)) return true

  const stemmedHay = ` ${words.map(stem).join(' ')} `
  if (stemmedHay.includes(` ${needle.split(' ').map(stem).join(' ')} `)) return true

  const tight = needle.replace(/ /g, '')
  // Two-letter run-together forms collide too easily to be worth it.
  if (tight.length < 3) return false
  // The term is spaced ("node js"), the text isn't ("nodejs").
  if (tight !== needle && hay.includes(` ${tight} `)) return true

  // The term is run together ("nodejs"), the text is spaced ("node js").
  for (let i = 0; i < words.length; i++) {
    let joined = ''
    for (let n = 0; n < 4 && i + n < words.length; n++) {
      joined += words[i + n]
      if (joined.length > tight.length) break
      if (n > 0 && joined === tight) return true
    }
  }
  return false
}

/** The terms from `terms` that appear in `haystack`, in the order given. */
export function matchedTerms(haystack: string, terms: string[]): string[] {
  return terms.filter((term) => containsTerm(haystack, term))
}

/** Splits a comma or newline separated field into trimmed, de-duplicated terms. */
export function parseTerms(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[,\n]/)) {
    const term = part.trim()
    if (!term) continue
    const key = normalise(term)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(term)
  }
  return out
}

/** Cuts text to a length without leaving a half word or a dangling space. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Strips the HTML that Upwork feeds wrap descriptions in. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}
