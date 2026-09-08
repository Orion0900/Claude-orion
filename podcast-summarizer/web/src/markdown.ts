import type { Job } from './types'

/** The summary as Markdown, for sharing to Notes, Messages or a clipboard. */
export function summaryToMarkdown(job: Job): string {
  const s = job.summary
  if (!s) return ''
  const e = job.episode
  const lines: string[] = []
  lines.push(`# ${e?.title ?? 'Episode summary'}`)
  if (e?.showName) lines.push(`_${e.showName}_`)
  if (e?.spotifyUrl) lines.push(e.spotifyUrl)
  lines.push('', '## TL;DR', s.tldr, '', '## Key points')
  for (const p of s.key_points) lines.push(`- **${p.point}** (${p.timestamp}) — ${p.detail}`)
  if (s.chapters.length) {
    lines.push('', '## Chapters')
    for (const c of s.chapters) lines.push(`- **${c.start} ${c.title}** — ${c.summary}`)
  }
  if (s.quotes.length) {
    lines.push('', '## Quotes')
    for (const q of s.quotes) lines.push(`> “${q.text}” — ${q.speaker} (${q.timestamp})`)
  }
  if (s.action_items.length) {
    lines.push('', '## Action items')
    for (const a of s.action_items) lines.push(`- [ ] ${a}`)
  }
  if (s.mentions.length) {
    lines.push('', '## Mentioned')
    for (const m of s.mentions) lines.push(`- ${m}`)
  }
  if (s.people.length) lines.push('', '## People', s.people.join(', '))
  return lines.join('\n')
}

/** "1:02:05" or "5:30" → seconds, for Spotify's ?t= deep link. */
export function timestampToSeconds(ts: string): number | undefined {
  const parts = ts.trim().split(':').map(Number)
  if (parts.length < 2 || parts.some(Number.isNaN)) return undefined
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}
