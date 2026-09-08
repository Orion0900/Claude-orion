/**
 * One job, opened: the whole post, the score pulled apart, and the letter.
 *
 * The letter is editable before it goes anywhere. A generated proposal is a
 * strong first draft and a bad final one, and the two seconds it takes to add
 * a line about the client's actual problem is the difference between a bid and
 * a bid that gets read.
 */
import { useEffect, useMemo, useState } from 'react'
import { describeAge, TIER_LABEL, type ScoredJob } from '../lib/scoring'
import { draftLetter, formatBudget } from '../lib/template'
import type { Application, Profile, Template } from '../lib/types'
import { applyUrl } from '../services/submit'

export default function JobSheet({
  scored,
  profile,
  templates,
  application,
  onClose,
  onApply,
  onStatus,
}: {
  scored: ScoredJob
  profile: Profile
  templates: Template[]
  application?: Application
  onClose: () => void
  onApply: (scored: ScoredJob, letter: string) => void
  onStatus: (id: string, status: Application['status'], reason?: string) => void
}) {
  const { job, score } = scored
  const drafted = useMemo(() => draftLetter(job, profile, templates, score), [job, profile, templates, score])
  const [letter, setLetter] = useState(application?.letter || drafted.letter)

  // Opening a different job replaces the draft; edits within one job survive.
  useEffect(() => {
    setLetter(application?.letter || drafted.letter)
  }, [job.id, application?.id, application?.letter, drafted.letter])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hours = (Date.now() - Date.parse(job.postedAt)) / 3_600_000

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={job.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <span className={`score score-${score.tier}`}>
            <span className="score-number">{score.total}</span>
            <span className="score-tier">{TIER_LABEL[score.tier]}</span>
          </span>
          <h2>{job.title}</h2>
          <button className="ghost close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="sheet-scroll">
          <div className="facts">
            <Fact label="Pay" value={formatBudget(job) || 'not stated'} />
            <Fact label="Posted" value={Number.isFinite(hours) ? describeAge(hours) : 'unknown'} />
            <Fact label="Proposals" value={job.proposals === undefined ? 'unknown' : String(job.proposals)} />
            <Fact label="Connects" value={job.connects === undefined ? '—' : String(job.connects)} />
            <Fact label="Client" value={job.client.country ?? 'unknown'} />
            <Fact
              label="Spent"
              value={job.client.totalSpend === undefined ? 'unknown' : `$${Math.round(job.client.totalSpend).toLocaleString('en-US')}`}
            />
          </div>

          {application && (
            <p className={`status-line status-${application.status}`}>
              {application.status === 'submitted'
                ? `Sent ${application.submittedAt ? new Date(application.submittedAt).toLocaleString() : ''}`
                : application.status === 'queued'
                  ? 'Queued — waiting for you to send it'
                  : application.status === 'failed'
                    ? `Failed: ${application.reason ?? 'unknown reason'}`
                    : 'Drafted'}
            </p>
          )}

          <section>
            <h3>Why it ranks here</h3>
            <ul className="factors">
              {score.factors.map((factor) => (
                <li key={factor.key}>
                  <span className="factor-label">{factor.label}</span>
                  <span className="bar" aria-hidden="true">
                    <span className={`bar-fill${factor.unknown ? ' is-unknown' : ''}`} style={{ width: `${Math.round(factor.value * 100)}%` }} />
                  </span>
                  <span className="factor-note">{factor.note}</span>
                </li>
              ))}
            </ul>
            {score.redFlags.length > 0 && (
              <p className="flag">Mentions {score.redFlags.join(', ')} — on your avoid list.</p>
            )}
          </section>

          {job.skills.length > 0 && (
            <section>
              <h3>Skills asked for</h3>
              <p className="skills">
                {job.skills.map((skill) => (
                  <span key={skill} className={`chip${score.matchedSkills.includes(skill) ? ' chip-ok' : ''}`}>
                    {skill}
                  </span>
                ))}
              </p>
            </section>
          )}

          <section>
            <h3>The post</h3>
            <p className="description">{job.description || 'No description came through with this one.'}</p>
          </section>

          <section>
            <h3>
              Your letter
              {drafted.template ? <span className="sub"> · {drafted.template.name}</span> : null}
            </h3>
            {templates.length === 0 ? (
              <p className="empty-inline">No template yet — write one in Letters and it'll be drafted here.</p>
            ) : (
              <>
                <textarea
                  className="letter"
                  value={letter}
                  onChange={(event) => setLetter(event.target.value)}
                  rows={12}
                  spellCheck
                />
                {drafted.missing.length > 0 && (
                  <p className="flag">
                    Nothing to put in {drafted.missing.join(', ')} — fill that in on your profile, or edit it out above.
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        <footer className="sheet-actions">
          <button className="primary" onClick={() => onApply(scored, letter)} disabled={!letter.trim()}>
            Copy letter &amp; open Upwork
          </button>
          <a className="ghost" href={applyUrl(job.url)} target="_blank" rel="noopener noreferrer">
            Open post
          </a>
          {application?.status === 'queued' && (
            <button className="ghost" onClick={() => onStatus(application.id, 'submitted')}>
              Mark as sent
            </button>
          )}
          {application && application.status !== 'skipped' && (
            <button className="ghost" onClick={() => onStatus(application.id, 'skipped', 'Passed on it')}>
              Not for me
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span className="fact-label">{label}</span>
      <span className="fact-value">{value}</span>
    </div>
  )
}
