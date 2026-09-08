/**
 * What to look for, and what to throw away.
 *
 * These are rules, not preferences — anything a rule drops never reaches the
 * ranking. So the panel shows what the current rules are actually costing you
 * as you type, which is the only way to notice that "verified clients only"
 * quietly binned two thirds of the feed.
 */
import { useState } from 'react'
import { parseTerms } from '../lib/text'
import type { Criteria, ExperienceLevel, Job, PayType } from '../lib/types'
import { parsePasted } from '../services/sources'

const LEVELS: ExperienceLevel[] = ['entry', 'intermediate', 'expert']

export default function CriteriaForm({
  criteria,
  onChange,
  onPasteJobs,
  dropped,
}: {
  criteria: Criteria
  onChange: (criteria: Criteria) => void
  onPasteJobs: (jobs: Job[]) => void
  dropped: Record<string, number>
}) {
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const set = (change: Partial<Criteria>) => onChange({ ...criteria, ...change })

  const importPasted = () => {
    try {
      const jobs = parsePasted(pasted)
      if (jobs.length === 0) {
        setPasteError('No jobs found in that.')
        return
      }
      setPasteError(null)
      setPasted('')
      onPasteJobs(jobs)
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : String(error))
    }
  }

  const droppedTotal = Object.values(dropped).reduce((sum, count) => sum + count, 0)

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>Search</h1>
          <p className="sub">The rules every job has to clear before it's ranked.</p>
        </div>
      </div>

      <fieldset>
        <legend>Looking for</legend>
        <label className="field">
          <span>Search terms</span>
          <input
            type="text"
            inputMode="search"
            value={criteria.query}
            placeholder="react dashboard"
            onChange={(event) => set({ query: event.target.value })}
          />
          <small>Sent to sources that take a query. Feeds carry their own search.</small>
        </label>

        <TermsField
          label="Must have these skills"
          value={criteria.requiredSkills}
          placeholder="React, TypeScript"
          hint="Every one of them, in the title or the skills list."
          onChange={(requiredSkills) => set({ requiredSkills })}
        />
        <TermsField
          label="Must mention one of"
          value={criteria.includeKeywords}
          placeholder="dashboard, internal tool"
          hint="Any one is enough. Leave empty for no keyword rule."
          onChange={(includeKeywords) => set({ includeKeywords })}
        />
        <TermsField
          label="Never show me"
          value={criteria.excludeKeywords}
          placeholder="wordpress, data entry"
          hint="One hit and the job is dropped."
          onChange={(excludeKeywords) => set({ excludeKeywords })}
        />
      </fieldset>

      <fieldset>
        <legend>Money and effort</legend>
        <div className="row">
          <label className="field">
            <span>Pay type</span>
            <select value={criteria.payType} onChange={(event) => set({ payType: event.target.value as PayType | 'any' })}>
              <option value="any">Either</option>
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed price</option>
            </select>
          </label>
          <NumberField label="Min $/hr" value={criteria.minHourly} onChange={(minHourly) => set({ minHourly })} />
          <NumberField label="Min fixed $" value={criteria.minFixed} onChange={(minFixed) => set({ minFixed })} />
        </div>
        <div className="row">
          <NumberField
            label="Max proposals"
            value={criteria.maxProposals}
            onChange={(maxProposals) => set({ maxProposals })}
          />
          <NumberField
            label="Posted within (h)"
            value={criteria.maxPostedHoursAgo}
            onChange={(maxPostedHoursAgo) => set({ maxPostedHoursAgo })}
          />
          <NumberField label="Max connects" value={criteria.maxConnects} onChange={(maxConnects) => set({ maxConnects })} />
        </div>
        <p className="hint">A job that doesn't state its budget is never dropped on price — it's ranked lower instead.</p>
      </fieldset>

      <fieldset>
        <legend>The client</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={criteria.paymentVerifiedOnly}
            onChange={(event) => set({ paymentVerifiedOnly: event.target.checked })}
          />
          <span>Payment-verified clients only</span>
        </label>
        <div className="row">
          <NumberField
            label="Min spent $"
            value={criteria.minClientSpend}
            onChange={(minClientSpend) => set({ minClientSpend })}
          />
          <NumberField
            label="Min rating"
            step={0.1}
            value={criteria.minClientRating}
            onChange={(minClientRating) => set({ minClientRating })}
          />
        </div>
        <TermsField
          label="Only these countries"
          value={criteria.countriesAllow}
          placeholder="United States, Germany"
          hint="Empty means anywhere."
          onChange={(countriesAllow) => set({ countriesAllow })}
        />
        <TermsField
          label="Never these countries"
          value={criteria.countriesDeny}
          placeholder=""
          onChange={(countriesDeny) => set({ countriesDeny })}
        />
        <div className="levels">
          {LEVELS.map((level) => (
            <label key={level} className="check">
              <input
                type="checkbox"
                checked={criteria.experienceLevels.includes(level)}
                onChange={(event) =>
                  set({
                    experienceLevels: event.target.checked
                      ? [...criteria.experienceLevels, level]
                      : criteria.experienceLevels.filter((entry) => entry !== level),
                  })
                }
              />
              <span>{level}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {droppedTotal > 0 && (
        <div className="callout">
          <strong>{droppedTotal}</strong> of the jobs you've pulled are being filtered out:
          <ul className="reasons">
            {Object.entries(dropped)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([reason, count]) => (
                <li key={reason}>
                  <span>{reason}</span>
                  <span className="count">{count}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <fieldset>
        <legend>Paste jobs in</legend>
        <p className="hint">
          The fastest way to start, and the way that works on a phone with no bridge set up: open your Upwork search or
          feed, copy the page source or the feed XML, and drop it here. JSON works too.
        </p>
        <textarea
          className="paste"
          rows={5}
          value={pasted}
          placeholder='<?xml version="1.0"?><rss>…   or   {"jobs": [...]}'
          onChange={(event) => setPasted(event.target.value)}
        />
        {pasteError && <p className="flag">{pasteError}</p>}
        <button className="primary" onClick={importPasted} disabled={!pasted.trim()}>
          Add these jobs
        </button>
      </fieldset>
    </section>
  )
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value?: number
  step?: number
  onChange: (value: number | undefined) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step ?? 1}
        min={0}
        value={value ?? ''}
        placeholder="any"
        onChange={(event) => {
          const raw = event.target.value.trim()
          const parsed = Number(raw)
          // An empty box means "no rule", which is not the same as zero.
          onChange(raw === '' || !Number.isFinite(parsed) ? undefined : parsed)
        }}
      />
    </label>
  )
}

function TermsField({
  label,
  value,
  placeholder,
  hint,
  onChange,
}: {
  label: string
  value: string[]
  placeholder: string
  hint?: string
  onChange: (terms: string[]) => void
}) {
  // Typed text is kept as text while the field has focus, so a comma you're
  // half way through typing doesn't reformat under your fingers.
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        value={draft ?? value.join(', ')}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value)
          onChange(parseTerms(event.target.value))
        }}
        onBlur={() => setDraft(null)}
      />
      {hint && <small>{hint}</small>}
    </label>
  )
}
