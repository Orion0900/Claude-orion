/**
 * Everything that understands Spotify: URLs, the public episode page, and
 * (when credentials are configured) the Web API.
 *
 * Spotify does not serve podcast audio to third parties, so this module only
 * needs to answer "which episode of which show is this?". The audio itself
 * comes from the show's RSS feed (see feeds.ts).
 */
import { decodeEntities, stripHtml } from './text.js'

export type SpotifyRef = { kind: 'episode' | 'show'; id: string }

export interface EpisodeMeta {
  spotifyId: string
  title: string
  description: string
  showName?: string
  publisher?: string
  publishedAt?: string
  durationMs?: number
  imageUrl?: string
  spotifyUrl: string
}


/**
 * Accepts the forms people actually paste: share links (with ?si= noise),
 * localized paths (/intl-de/), URIs (spotify:episode:…) and bare IDs after a
 * kind word ("episode 3jZ…").
 */
export function parseSpotifyUrl(input: string): SpotifyRef | null {
  const s = input.trim()
  const uri = s.match(/^spotify:(episode|show):([A-Za-z0-9]{22})$/)
  if (uri) return { kind: uri[1] as SpotifyRef['kind'], id: uri[2] }
  let url: URL
  try {
    url = new URL(s.includes('://') ? s : `https://${s}`)
  } catch {
    return null
  }
  if (!/(^|\.)spotify\.com$/.test(url.hostname)) return null
  const m = url.pathname.match(/\/(?:intl-[a-z]{2,3}\/)?(?:embed\/)?(episode|show)\/([A-Za-z0-9]{22})(?:[/?#]|$)/)
  if (!m) return null
  return { kind: m[1] as SpotifyRef['kind'], id: m[2] }
}

export function isSpotifyShortLink(input: string): boolean {
  try {
    const url = new URL(input.trim())
    return url.hostname === 'spotify.link' || url.hostname === 'spotify.app.link'
  } catch {
    return false
  }
}

/** Pull a <meta property|name="…" content="…"> value out of raw HTML. */
export function metaContent(html: string, key: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i',
  )
  const tag = html.match(re)?.[0]
  if (!tag) return undefined
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1]
  return content !== undefined ? decodeEntities(content) : undefined
}

function findJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1])
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of list) if (item && typeof item === 'object') out.push(item)
    } catch {
      /* ignore malformed blocks */
    }
  }
  return out
}

function findNextData(html: string): unknown {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!m) return undefined
  try {
    return JSON.parse(m[1])
  } catch {
    return undefined
  }
}

/** Depth-first search for the first object with the given keys. */
function findObject(root: unknown, predicate: (o: Record<string, unknown>) => boolean, depth = 0): Record<string, unknown> | undefined {
  if (depth > 12 || root === null || typeof root !== 'object') return undefined
  if (!Array.isArray(root) && predicate(root as Record<string, unknown>)) return root as Record<string, unknown>
  for (const value of Object.values(root as Record<string, unknown>)) {
    const hit = findObject(value, predicate, depth + 1)
    if (hit) return hit
  }
  return undefined
}

/** ISO 8601 duration ("PT1H2M5S") → ms. */
export function parseIsoDuration(s: string): number | undefined {
  const m = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i)
  if (!m) return undefined
  const [, d, h, min, sec] = m
  return ((Number(d ?? 0) * 24 + Number(h ?? 0)) * 3600 + Number(min ?? 0) * 60 + Number(sec ?? 0)) * 1000
}

/**
 * Read what we can from the public episode page. The page is a client-side
 * app, but it ships Open Graph tags, a <title>, usually JSON-LD, and (on the
 * embed variant) a Next.js data blob. Each is tried; whatever is found wins.
 */
export function parseEpisodePage(html: string, spotifyId: string): Partial<EpisodeMeta> {
  const meta: Partial<EpisodeMeta> = { spotifyId, spotifyUrl: `https://open.spotify.com/episode/${spotifyId}` }

  const ogTitle = metaContent(html, 'og:title')
  const ogDescription = metaContent(html, 'og:description') ?? metaContent(html, 'description')
  const ogImage = metaContent(html, 'og:image')
  const releaseDate = metaContent(html, 'music:release_date')
  const duration = metaContent(html, 'music:duration')
  if (ogTitle) meta.title = ogTitle
  if (ogDescription) meta.description = stripHtml(ogDescription)
  if (ogImage) meta.imageUrl = ogImage
  if (releaseDate) meta.publishedAt = releaseDate
  if (duration && /^\d+$/.test(duration)) meta.durationMs = Number(duration) * 1000

  // <title>Episode Title - Show Name | Podcast on Spotify</title>
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  if (titleTag) {
    const cleaned = decodeEntities(titleTag).replace(/\s*\|\s*(Podcast|Episode)( on)? Spotify\s*$/i, '').trim()
    if (!meta.title) meta.title = cleaned.split(' - ')[0]?.trim()
    if (meta.title && cleaned.startsWith(meta.title)) {
      const rest = cleaned.slice(meta.title.length).replace(/^\s*[-–|]\s*/, '').trim()
      if (rest) meta.showName = rest
    }
  }

  for (const ld of findJsonLd(html)) {
    const type = String(ld['@type'] ?? '')
    if (!/PodcastEpisode|AudioObject|Episode/i.test(type)) continue
    if (typeof ld.name === 'string' && !meta.title) meta.title = ld.name
    if (typeof ld.description === 'string' && !meta.description) meta.description = stripHtml(ld.description)
    if (typeof ld.datePublished === 'string') meta.publishedAt = ld.datePublished
    if (typeof ld.timeRequired === 'string') meta.durationMs = parseIsoDuration(ld.timeRequired) ?? meta.durationMs
    if (typeof ld.duration === 'string') meta.durationMs = parseIsoDuration(ld.duration) ?? meta.durationMs
    const series = ld.partOfSeries as Record<string, unknown> | undefined
    if (series && typeof series.name === 'string') meta.showName = series.name
    const publisher = (series?.publisher ?? ld.publisher) as Record<string, unknown> | string | undefined
    if (typeof publisher === 'string') meta.publisher = publisher
    else if (publisher && typeof publisher.name === 'string') meta.publisher = publisher.name
  }

  const next = findNextData(html)
  if (next) {
    const entity = findObject(next, (o) => typeof o.name === 'string' && (typeof o.subtitle === 'string' || o.type === 'episode'))
    if (entity) {
      if (typeof entity.name === 'string' && !meta.title) meta.title = entity.name
      if (typeof entity.subtitle === 'string' && !meta.showName) meta.showName = entity.subtitle
      if (typeof entity.duration === 'number' && !meta.durationMs) meta.durationMs = entity.duration
      if (typeof entity.releaseDate === 'object' && entity.releaseDate && !meta.publishedAt) {
        const r = entity.releaseDate as Record<string, unknown>
        if (typeof r.isoString === 'string') meta.publishedAt = r.isoString
      }
      if (typeof entity.description === 'string' && !meta.description) meta.description = stripHtml(entity.description)
    }
  }

  return meta
}

export interface SpotifyCredentials {
  clientId: string
  clientSecret: string
}

type Fetch = typeof fetch

const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

async function fetchText(fetchImpl: Fetch, url: string): Promise<string> {
  const res = await fetchImpl(url, { headers: { 'user-agent': BROWSER_UA, accept: 'text/html,*/*' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`Spotify returned ${res.status} for ${url}`)
  return res.text()
}

let cachedToken: { token: string; expires: number } | undefined

async function webApiToken(fetchImpl: Fetch, creds: SpotifyCredentials): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 30_000) return cachedToken.token
  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
  const res = await fetchImpl('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 }
  return json.access_token
}

async function fetchViaWebApi(fetchImpl: Fetch, creds: SpotifyCredentials, id: string): Promise<EpisodeMeta> {
  const token = await webApiToken(fetchImpl, creds)
  const res = await fetchImpl(`https://api.spotify.com/v1/episodes/${id}?market=US`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Spotify Web API returned ${res.status}`)
  const e = (await res.json()) as {
    name: string
    description: string
    html_description?: string
    release_date?: string
    duration_ms?: number
    images?: { url: string }[]
    show?: { name: string; publisher?: string }
    external_urls?: { spotify?: string }
  }
  return {
    spotifyId: id,
    title: e.name,
    description: e.description ?? '',
    showName: e.show?.name,
    publisher: e.show?.publisher,
    publishedAt: e.release_date,
    durationMs: e.duration_ms,
    imageUrl: e.images?.[0]?.url,
    spotifyUrl: e.external_urls?.spotify ?? `https://open.spotify.com/episode/${id}`,
  }
}

/**
 * Resolve a Spotify episode to its metadata. Uses the Web API when
 * credentials exist (most reliable), otherwise reads the public page and, if
 * that is thin, the embed page as well.
 */
export async function fetchEpisodeMeta(
  id: string,
  opts: { fetch?: Fetch; credentials?: SpotifyCredentials } = {},
): Promise<EpisodeMeta> {
  const fetchImpl = opts.fetch ?? fetch
  if (opts.credentials) {
    try {
      return await fetchViaWebApi(fetchImpl, opts.credentials, id)
    } catch (err) {
      console.warn(`[spotify] Web API failed, falling back to page scrape: ${(err as Error).message}`)
    }
  }
  const page = parseEpisodePage(await fetchText(fetchImpl, `https://open.spotify.com/episode/${id}`), id)
  if (!page.showName || !page.title) {
    try {
      const embed = parseEpisodePage(await fetchText(fetchImpl, `https://open.spotify.com/embed/episode/${id}`), id)
      Object.assign(page, Object.fromEntries(Object.entries(embed).filter(([k, v]) => v !== undefined && (page as Record<string, unknown>)[k] === undefined)))
    } catch {
      /* the embed page is a bonus, not a requirement */
    }
  }
  if (!page.title) throw new Error('Could not read the episode title from Spotify. Is the link a podcast episode?')
  return {
    spotifyId: id,
    title: page.title,
    description: page.description ?? '',
    showName: page.showName,
    publisher: page.publisher,
    publishedAt: page.publishedAt,
    durationMs: page.durationMs,
    imageUrl: page.imageUrl,
    spotifyUrl: `https://open.spotify.com/episode/${id}`,
  }
}

/** Follow a spotify.link short URL to the open.spotify.com URL it points at. */
export async function expandShortLink(input: string, fetchImpl: Fetch = fetch): Promise<string> {
  const res = await fetchImpl(input, { redirect: 'follow', headers: { 'user-agent': BROWSER_UA } })
  return res.url || input
}
