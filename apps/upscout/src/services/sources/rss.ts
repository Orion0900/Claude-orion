/**
 * Reading an Upwork saved-search feed.
 *
 * Upwork's RSS items put everything but the title in one HTML blob:
 *
 *   Looking for a React dev…<br /><br />
 *   <b>Hourly Range</b>: $30.00-$50.00<br />
 *   <b>Posted On</b>: September 08, 2025 10:14 UTC<br />
 *   <b>Category</b>: Web Development<br />
 *   <b>Skills</b>:React, TypeScript<br />
 *   <b>Country</b>:United States
 *
 * So the parser pulls the labelled lines out, then treats what's left as the
 * description. It's all string work with no DOM, which keeps it testable and
 * means a feed with slightly wrong XML still yields jobs instead of throwing.
 */
import { decodeEntities, stripHtml } from '../../lib/text'
import type { Job } from '../../lib/types'
import { normaliseJob, type RawJob } from './normalise'

/** Every `<item>` (RSS) or `<entry>` (Atom) in a feed document. */
function items(xml: string): string[] {
  const found = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
  return found.map((match) => match[2])
}

function tag(item: string, name: string): string | undefined {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(item)
  if (!match) return undefined
  return unwrapCdata(match[1]).trim() || undefined
}

function unwrapCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
}

/** Atom puts the link in an attribute rather than in the element's text. */
function link(item: string): string | undefined {
  const href = /<link\b[^>]*href=["']([^"']+)["']/i.exec(item)?.[1]
  return href ?? tag(item, 'link')
}

/** The value of a `<b>Label</b>: value` line in Upwork's description blob. */
function labelled(html: string, label: string): string | undefined {
  const pattern = new RegExp(`<b>\\s*${label}\\s*</b>\\s*:?\\s*([^<]*)`, 'i')
  const value = pattern.exec(html)?.[1]
  return value ? decodeEntities(value).trim() || undefined : undefined
}

/** "$30.00-$50.00" → {min: 30, max: 50}; "$500.00" → {min: 500}. */
export function parseMoneyRange(text: string): { min?: number; max?: number } {
  const numbers = [...text.matchAll(/\$?\s*([\d,]+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1].replace(/,/g, '')))
    .filter((value) => Number.isFinite(value))
  if (numbers.length === 0) return {}
  if (numbers.length === 1) return { min: numbers[0] }
  return { min: Math.min(...numbers), max: Math.max(...numbers) }
}

/**
 * Jobs from one feed document. Anything malformed is skipped rather than
 * failing the whole fetch — one bad item shouldn't cost you the other twenty.
 */
export function parseFeed(xml: string, source: string, now = new Date()): Job[] {
  const jobs: Job[] = []

  for (const item of items(xml)) {
    const rawTitle = tag(item, 'title')
    if (!rawTitle) continue
    // Upwork suffixes every feed title with " - Upwork"; it's noise in a list.
    const title = decodeEntities(rawTitle).replace(/\s*-\s*Upwork\s*$/i, '').trim()

    const html = tag(item, 'description') ?? tag(item, 'summary') ?? tag(item, 'content') ?? ''
    const hourly = labelled(html, 'Hourly Range')
    const fixed = labelled(html, 'Budget')
    const money = parseMoneyRange(hourly ?? fixed ?? '')

    const raw: RawJob = {
      id: tag(item, 'guid') ?? link(item),
      title,
      url: link(item) ?? '',
      // Strip the labelled lines back off, leaving the client's own words.
      description: html.split(/<b>\s*(?:Hourly Range|Budget|Posted On|Category|Skills|Country)\s*<\/b>/i)[0],
      postedAt: labelled(html, 'Posted On') ?? tag(item, 'pubDate') ?? tag(item, 'updated') ?? tag(item, 'published'),
      type: hourly ? 'hourly' : 'fixed',
      hourlyMin: hourly ? money.min : undefined,
      hourlyMax: hourly ? money.max : undefined,
      amount: hourly ? undefined : money.min,
      skills: labelled(html, 'Skills'),
      category: labelled(html, 'Category'),
      country: labelled(html, 'Country'),
    }

    const job = normaliseJob(raw, source, now)
    if (job) jobs.push(job)
  }

  return jobs
}

/** True for anything that looks like a feed rather than JSON. */
export function looksLikeFeed(text: string): boolean {
  const head = text.trimStart().slice(0, 200).toLowerCase()
  return head.startsWith('<?xml') || head.includes('<rss') || head.includes('<feed') || head.includes('<item')
}

/** Turns a feed's own description blob into readable text, for previews. */
export function feedDescriptionToText(html: string): string {
  return stripHtml(unwrapCdata(html))
}
