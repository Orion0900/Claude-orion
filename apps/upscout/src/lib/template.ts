/**
 * Turning one saved letter into a letter about this job.
 *
 * The syntax is deliberately tiny — `{{name}}` for a value, `{{#name}}…{{/name}}`
 * for a section that only appears when there's something to say, and `{{^name}}`
 * for the other way round. That's enough to write a template whose second
 * paragraph names the client's country when it's known and stays quiet when it
 * isn't, and small enough that nothing you type can throw.
 *
 * Nothing is invented. Every placeholder comes from the job, your profile or
 * the score, so a template can't put words in your mouth about work you
 * haven't done.
 */
import { describeAge } from './scoring'
import type { JobScore } from './scoring'
import { normalise, truncate } from './text'
import type { Job, Profile, Template } from './types'

export type TemplateContext = Record<string, string>

const TAG = /\{\{([#^/]?)\s*([\w.]+)\s*\}\}/g

/** Renders `body` against `context`. Unknown placeholders render as nothing. */
export function render(body: string, context: TemplateContext): string {
  const output = renderSections(body, context)
  return output.replace(TAG, (_whole, sigil: string, name: string) => (sigil ? '' : (context[name] ?? '')))
}

/**
 * Sections first, so a `{{#skills}}` block that shouldn't appear is removed
 * before its inner placeholders are ever looked at.
 */
function renderSections(body: string, context: TemplateContext): string {
  let result = body
  // Innermost sections resolve first; the loop stops when nothing changes,
  // which also stops an unbalanced tag from spinning.
  for (let pass = 0; pass < 8; pass++) {
    const next = result.replace(
      /\{\{([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g,
      (_whole, sigil: string, name: string, inner: string) => {
        const present = Boolean(context[name]?.trim())
        return (sigil === '#') === present ? inner : ''
      },
    )
    if (next === result) break
    result = next
  }
  return result
}

/**
 * Placeholders that would render as a blank in the finished letter.
 *
 * Sections are resolved first, so a value that only appears inside
 * `{{#portfolio}}…{{/portfolio}}` isn't reported as missing — the template
 * already said what to do when it isn't there.
 */
export function missingPlaceholders(body: string, context: TemplateContext): string[] {
  const missing = new Set<string>()
  for (const match of renderSections(body, context).matchAll(TAG)) {
    const [, sigil, name] = match
    if (sigil) continue
    if (!context[name]?.trim()) missing.add(name)
  }
  return [...missing]
}

/** Every placeholder a template can use, for the helper list in the editor. */
export const PLACEHOLDERS: { name: string; describes: string }[] = [
  { name: 'job.title', describes: 'The job title as posted' },
  { name: 'job.summary', describes: 'First couple of lines of the description' },
  { name: 'job.skills', describes: 'Skills the job asks for, comma separated' },
  { name: 'job.budget', describes: 'Stated budget, e.g. $45–60/hr' },
  { name: 'job.posted', describes: 'How long ago it was posted' },
  { name: 'job.url', describes: 'Link to the posting' },
  { name: 'match.skills', describes: 'Your skills this job names' },
  { name: 'match.topSkill', describes: 'The strongest of those, for an opening line' },
  { name: 'match.score', describes: 'Viability score out of 100' },
  { name: 'client.country', describes: "Client's country, when known" },
  { name: 'me.name', describes: 'Your name' },
  { name: 'me.headline', describes: 'Your headline' },
  { name: 'me.rate', describes: 'Your target hourly rate' },
  { name: 'me.skills', describes: 'Your skills' },
  { name: 'me.portfolio', describes: 'Your portfolio link' },
  { name: 'me.timezone', describes: 'Your timezone' },
]

export function buildContext(job: Job, profile: Profile, score?: JobScore): TemplateContext {
  const posted = Date.parse(job.postedAt)
  const matched = score?.matchedSkills ?? []
  return {
    'job.title': job.title,
    'job.summary': truncate(job.description.replace(/\s+/g, ' ').trim(), 240),
    'job.skills': job.skills.join(', '),
    'job.budget': formatBudget(job),
    'job.posted': Number.isFinite(posted) ? describeAge((Date.now() - posted) / 3_600_000) : '',
    'job.url': job.url,
    'job.category': job.category ?? '',
    'match.skills': matched.join(', '),
    'match.topSkill': matched[0] ?? profile.skills[0] ?? '',
    'match.score': score ? String(score.total) : '',
    'client.country': job.client.country ?? '',
    'me.name': profile.name,
    'me.headline': profile.headline,
    'me.rate': profile.targetHourly ? `$${profile.targetHourly}/hr` : '',
    'me.skills': profile.skills.join(', '),
    'me.portfolio': profile.portfolio,
    'me.timezone': profile.timezone,
  }
}

export function formatBudget(job: Job): string {
  const { min, max, type, currency } = job.budget
  const symbol = currency === 'USD' ? '$' : `${currency} `
  const money = (n: number) => `${symbol}${n % 1 === 0 ? n.toLocaleString('en-US') : n.toFixed(2)}`
  const suffix = type === 'hourly' ? '/hr' : ' fixed'
  if (min !== undefined && max !== undefined && max > min) return `${money(min)}–${money(max)}${suffix}`
  const single = min ?? max
  return single === undefined ? '' : `${money(single)}${suffix}`
}

/**
 * Which template to use for a job.
 *
 * The one whose keywords the job hits most often wins; on a tie, the one you
 * marked default. No match at all also falls back to the default, so
 * auto-apply always has something to send rather than silently skipping.
 */
export function pickTemplate(templates: Template[], job: Job): Template | undefined {
  if (templates.length === 0) return undefined
  const haystack = `${job.title} ${job.skills.join(' ')} ${job.description}`
  let best: { template: Template; hits: number } | undefined

  for (const template of templates) {
    const hits = template.matchKeywords.filter((keyword) => {
      const term = normalise(keyword)
      return term.length > 0 && ` ${normalise(haystack)} `.includes(` ${term} `)
    }).length
    const better =
      !best ||
      hits > best.hits ||
      (hits === best.hits && template.isDefault && !best.template.isDefault)
    if (better) best = { template, hits }
  }

  if (best && best.hits > 0) return best.template
  return templates.find((template) => template.isDefault) ?? templates[0]
}

/** The letter for one job: template picked, placeholders filled, ready to send. */
export function draftLetter(
  job: Job,
  profile: Profile,
  templates: Template[],
  score?: JobScore,
): { template?: Template; letter: string; missing: string[] } {
  const template = pickTemplate(templates, job)
  if (!template) return { letter: '', missing: [] }
  const context = buildContext(job, profile, score)
  return {
    template,
    letter: render(template.body, context).replace(/\n{3,}/g, '\n\n').trim(),
    missing: missingPlaceholders(template.body, context),
  }
}

export const STARTER_TEMPLATE = `Hi,

I read your post for "{{job.title}}" and this is squarely what I do{{#match.topSkill}}: {{match.topSkill}}{{/match.topSkill}}.

{{#match.skills}}You've asked for {{match.skills}} — that's the core of my last few projects, and I can start on it this week.{{/match.skills}}
{{^match.skills}}I've done close to this several times and can start on it this week.{{/match.skills}}

Two questions so my first pass isn't guesswork:
1. What does "done" look like for the first milestone?
2. Is there existing code or a design to work from?

{{#me.portfolio}}Recent work: {{me.portfolio}}{{/me.portfolio}}
{{#me.timezone}}I work from {{me.timezone}} and can overlap with your day.{{/me.timezone}}

— {{me.name}}{{#me.headline}}, {{me.headline}}{{/me.headline}}
`
