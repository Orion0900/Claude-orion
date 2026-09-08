/**
 * Your letters.
 *
 * One template is enough to start; several, each with its own keywords, is
 * what makes auto-apply worth switching on — a copywriting job and a React
 * job should not open the same way. The preview renders against the job
 * currently at the top of your list, so you're reading the letter someone
 * would actually receive rather than a page of curly braces.
 */
import { useRef, useState } from 'react'
import type { ScoredJob } from '../lib/scoring'
import { buildContext, missingPlaceholders, PLACEHOLDERS, render, STARTER_TEMPLATE } from '../lib/template'
import { parseTerms } from '../lib/text'
import type { Profile, Template } from '../lib/types'

export default function TemplateEditor({
  templates,
  profile,
  sample,
  onChange,
}: {
  templates: Template[]
  profile: Profile
  sample?: ScoredJob
  onChange: (templates: Template[]) => void
}) {
  const [activeId, setActiveId] = useState(templates[0]?.id ?? '')
  const [showPreview, setShowPreview] = useState(true)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const active = templates.find((template) => template.id === activeId) ?? templates[0]
  const context = sample ? buildContext(sample.job, profile, sample.score) : buildContext(EXAMPLE_JOB, profile)
  const preview = active ? render(active.body, context) : ''
  const missing = active ? missingPlaceholders(active.body, context) : []

  const update = (change: Partial<Template>) => {
    if (!active) return
    onChange(
      templates.map((template) =>
        template.id === active.id
          ? { ...template, ...change }
          : // Only one template can be the fallback.
            change.isDefault
            ? { ...template, isDefault: false }
            : template,
      ),
    )
  }

  const add = () => {
    const template: Template = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Letter ${templates.length + 1}`,
      body: STARTER_TEMPLATE,
      matchKeywords: [],
      isDefault: templates.length === 0,
    }
    onChange([...templates, template])
    setActiveId(template.id)
  }

  const remove = () => {
    if (!active) return
    const rest = templates.filter((template) => template.id !== active.id)
    // Something always has to be the fallback, or auto-apply has nothing to send.
    if (rest.length && !rest.some((template) => template.isDefault)) rest[0] = { ...rest[0], isDefault: true }
    onChange(rest)
    setActiveId(rest[0]?.id ?? '')
  }

  /** Drops a placeholder in where the cursor is, not at the end. */
  const insert = (name: string) => {
    const area = bodyRef.current
    if (!active || !area) return
    const start = area.selectionStart ?? active.body.length
    const end = area.selectionEnd ?? start
    const token = `{{${name}}}`
    update({ body: `${active.body.slice(0, start)}${token}${active.body.slice(end)}` })
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>Letters</h1>
          <p className="sub">Written once, filled in per job. Nothing is invented — every field comes from the post or your profile.</p>
        </div>
        <button className="ghost" onClick={add}>
          New
        </button>
      </div>

      {templates.length > 1 && (
        <div className="tabs">
          {templates.map((template) => (
            <button
              key={template.id}
              className={`tab${template.id === active?.id ? ' is-active' : ''}`}
              onClick={() => setActiveId(template.id)}
            >
              {template.name}
              {template.isDefault ? ' ·' : ''}
            </button>
          ))}
        </div>
      )}

      {!active ? (
        <div className="empty">
          <p>No letters yet.</p>
          <button className="primary" onClick={add}>
            Write one
          </button>
        </div>
      ) : (
        <>
          <div className="row">
            <label className="field grow">
              <span>Name</span>
              <input type="text" value={active.name} onChange={(event) => update({ name: event.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={active.isDefault} onChange={(event) => update({ isDefault: event.target.checked })} />
              <span>Fallback</span>
            </label>
          </div>

          <label className="field">
            <span>Use this letter for jobs about</span>
            <input
              type="text"
              value={active.matchKeywords.join(', ')}
              placeholder="react, dashboard, front-end"
              onChange={(event) => update({ matchKeywords: parseTerms(event.target.value) })}
            />
            <small>The letter whose words the job hits most often is the one that gets used.</small>
          </label>

          <label className="field">
            <span>Letter</span>
            <textarea
              ref={bodyRef}
              className="letter"
              rows={14}
              value={active.body}
              spellCheck
              onChange={(event) => update({ body: event.target.value })}
            />
          </label>

          <details className="placeholders">
            <summary>Placeholders you can drop in</summary>
            <div className="chips">
              {PLACEHOLDERS.map((placeholder) => (
                <button key={placeholder.name} className="chip chip-button" onClick={() => insert(placeholder.name)} title={placeholder.describes}>
                  {placeholder.name}
                </button>
              ))}
            </div>
            <p className="hint">
              <code>{'{{#me.portfolio}}…{{/me.portfolio}}'}</code> keeps a line only when there's something to put in it;{' '}
              <code>{'{{^…}}'}</code> is the other way round.
            </p>
          </details>

          {missing.length > 0 && (
            <p className="flag">
              {missing.join(', ')} has nothing to fill it. Auto-apply will skip rather than send a letter with a gap —
              fill it in under You, or wrap it in a section.
            </p>
          )}

          <section className="preview">
            <button className="link" onClick={() => setShowPreview((shown) => !shown)}>
              {showPreview ? 'Hide' : 'Show'} preview{sample ? ` · ${sample.job.title}` : ' · example job'}
            </button>
            {showPreview && <pre className="preview-body">{preview.trim()}</pre>}
          </section>

          <button className="danger" onClick={remove}>
            Delete this letter
          </button>
        </>
      )}
    </section>
  )
}

/** Stands in for a real job so the preview works before anything is fetched. */
const EXAMPLE_JOB = {
  id: 'example',
  title: 'Build a React dashboard for an internal tool',
  description: 'We have an internal logistics tool and need a dashboard for it. Existing API, no design yet.',
  url: 'https://www.upwork.com/jobs/~example',
  postedAt: new Date().toISOString(),
  budget: { type: 'hourly' as const, min: 55, max: 85, currency: 'USD' },
  skills: ['React', 'TypeScript'],
  client: { country: 'United States', paymentVerified: true, rating: 4.9, totalSpend: 42_000 },
  source: 'example',
  fetchedAt: new Date().toISOString(),
}
