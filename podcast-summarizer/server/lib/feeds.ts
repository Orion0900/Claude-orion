/**
 * Finding the audio. Spotify mirrors podcasts from their public RSS feeds, so
 * once we know the show's name we can look the feed up in the Apple Podcasts
 * directory (keyless), parse it, and match the episode by title.
 */
import { XMLParser } from 'fast-xml-parser'
import { containsTitle, parseDuration, similarity, stripHtml } from './text.js'

type Fetch = typeof fetch

export interface FeedCandidate {
  name: string
  publisher?: string
  feedUrl: string
  artworkUrl?: string
}

export interface TranscriptRef {
  url: string
  type?: string
  language?: string
}

export interface FeedItem {
  title: string
  guid?: string
  description?: string
  publishedAt?: string
  durationSec?: number
  audioUrl?: string
  audioType?: string
  transcripts: TranscriptRef[]
  link?: string
}

export interface ParsedFeed {
  title?: string
  author?: string
  items: FeedItem[]
}

const UA = 'PodcastSummarizer/0.1 (+https://github.com/Orion0900/Claude-orion)'

export async function searchFeeds(term: string, fetchImpl: Fetch = fetch): Promise<FeedCandidate[]> {
  const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=15&term=${encodeURIComponent(term)}`
  const res = await fetchImpl(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`Podcast directory search failed (${res.status})`)
  const json = (await res.json()) as {
    results?: { collectionName?: string; trackName?: string; artistName?: string; feedUrl?: string; artworkUrl600?: string }[]
  }
  return (json.results ?? [])
    .filter((r) => r.feedUrl)
    .map((r) => ({
      name: r.collectionName ?? r.trackName ?? '',
      publisher: r.artistName,
      feedUrl: r.feedUrl as string,
      artworkUrl: r.artworkUrl600,
    }))
}

/** Rank directory hits by how well they match the show (and publisher, if known). */
export function pickFeed(candidates: FeedCandidate[], showName: string, publisher?: string): FeedCandidate | undefined {
  let best: { score: number; c: FeedCandidate } | undefined
  for (const c of candidates) {
    let score = similarity(c.name, showName)
    if (containsTitle(c.name, showName)) score = Math.max(score, 0.85)
    if (publisher && c.publisher) score += 0.15 * similarity(c.publisher, publisher)
    if (!best || score > best.score) best = { score, c }
  }
  return best && best.score >= 0.5 ? best.c : undefined
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => name === 'item' || name === 'podcast:transcript' || name === 'enclosure',
})

function text(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return text(node[0])
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    return text(o['#cdata'] ?? o['#text'])
  }
  return undefined
}

function attr(node: unknown, name: string): string | undefined {
  if (!node || typeof node !== 'object') return undefined
  const v = (node as Record<string, unknown>)[`@_${name}`]
  return v === undefined ? undefined : String(v)
}

export function parseFeed(xml: string): ParsedFeed {
  const doc = parser.parse(xml) as Record<string, unknown>
  const rss = doc.rss as Record<string, unknown> | undefined
  const channel = (rss?.channel ?? doc.channel ?? (doc.feed as unknown)) as Record<string, unknown> | undefined
  if (!channel) throw new Error('Not an RSS feed')
  const rawItems = (channel.item as unknown[] | undefined) ?? []
  const items: FeedItem[] = rawItems.map((raw) => {
    const it = raw as Record<string, unknown>
    const enclosures = (it.enclosure as unknown[] | undefined) ?? []
    const audio = enclosures.find((e) => /^audio\//i.test(attr(e, 'type') ?? 'audio/')) ?? enclosures[0]
    const transcripts = ((it['podcast:transcript'] as unknown[] | undefined) ?? [])
      .map((t) => ({ url: attr(t, 'url') ?? '', type: attr(t, 'type'), language: attr(t, 'language') }))
      .filter((t) => t.url)
    const description = text(it['content:encoded']) ?? text(it.description) ?? text(it['itunes:summary'])
    return {
      title: text(it.title) ?? '',
      guid: text(it.guid),
      description: description ? stripHtml(description) : undefined,
      publishedAt: text(it.pubDate),
      durationSec: parseDuration(text(it['itunes:duration'])),
      audioUrl: attr(audio, 'url'),
      audioType: attr(audio, 'type'),
      transcripts,
      link: text(it.link),
    }
  })
  return { title: text(channel.title), author: text(channel['itunes:author']), items }
}

export async function fetchFeed(feedUrl: string, fetchImpl: Fetch = fetch): Promise<ParsedFeed> {
  const res = await fetchImpl(feedUrl, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, */*' } })
  if (!res.ok) throw new Error(`Feed returned ${res.status}`)
  return parseFeed(await res.text())
}

export interface EpisodeHint {
  title: string
  publishedAt?: string
  durationMs?: number
}

function dayDistance(a?: string, b?: string): number | undefined {
  if (!a || !b) return undefined
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return undefined
  return Math.abs(ta - tb) / 86_400_000
}

/**
 * Choose the feed item that is the Spotify episode. Title similarity does
 * most of the work; publish date and duration break ties and catch feeds
 * that retitle episodes ("Ep. 12: …" vs "…").
 */
export function matchEpisode(items: FeedItem[], hint: EpisodeHint): FeedItem | undefined {
  let best: { score: number; item: FeedItem } | undefined
  for (const item of items) {
    let score = similarity(item.title, hint.title)
    if (containsTitle(item.title, hint.title)) score = Math.max(score, 0.9)
    const days = dayDistance(item.publishedAt, hint.publishedAt)
    if (days !== undefined) score += days <= 2 ? 0.15 : days <= 7 ? 0.05 : -0.1
    if (hint.durationMs && item.durationSec) {
      const diff = Math.abs(item.durationSec - hint.durationMs / 1000)
      score += diff <= 90 ? 0.15 : diff <= 600 ? 0 : -0.1
    }
    if (!best || score > best.score) best = { score, item }
  }
  return best && best.score >= 0.55 ? best.item : undefined
}
