/**
 * Auto-apply, with the safety catch showing.
 *
 * The panel is built around one idea: you should be able to see exactly what
 * would be sent before anything is. The list under "What it would send" is the
 * same plan the run uses, so what you read is what goes — and with approval
 * left on (the default) the run only ever fills a queue you then release.
 */
import { useState } from 'react'
import type { AutoApplyPlan } from '../lib/autoApply'
import type { Application, AutoApplySettings } from '../lib/types'
import { truncate } from '../lib/text'

export default function AutoApplyPanel({
  settings,
  plan,
  applications,
  onChange,
  onRun,
  onSendQueued,
  onStatus,
  onOpenJob,
}: {
  settings: AutoApplySettings
  plan: AutoApplyPlan
  applications: Application[]
  onChange: (settings: AutoApplySettings) => void
  onRun: () => void
  onSendQueued: () => void
  onStatus: (id: string, status: Application['status'], reason?: string) => void
  onOpenJob: (jobId: string) => void
}) {
  const [showSkipped, setShowSkipped] = useState(false)
  const set = (change: Partial<AutoApplySettings>) => onChange({ ...settings, ...change })

  const queued = applications.filter((entry) => entry.status === 'queued')
  const recent = applications.slice(0, 25)
  const skipped = plan.decisions.filter((decision) => decision.action === 'skip')

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>Auto-apply</h1>
          <p className="sub">Off until you say otherwise, and it queues before it sends.</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={settings.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
          <span aria-hidden="true" />
          <span className="switch-text">{settings.enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      <fieldset>
        <legend>Limits</legend>
        <label className="field">
          <span>
            Only jobs scoring <strong>{settings.minScore}</strong> or better
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.minScore}
            onChange={(event) => set({ minScore: Number(event.target.value) })}
          />
        </label>
        <div className="row">
          <label className="field">
            <span>Per day</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={settings.maxPerDay}
              onChange={(event) => set({ maxPerDay: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>
          <label className="field">
            <span>Connects per day</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={settings.connectsPerDay}
              onChange={(event) => set({ connectsPerDay: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>
          <label className="field">
            <span>Skip over N bids</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={settings.maxProposals ?? ''}
              placeholder="any"
              onChange={(event) => {
                const raw = event.target.value.trim()
                set({ maxProposals: raw === '' ? undefined : Math.max(0, Number(raw) || 0) })
              }}
            />
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.requireApproval}
            onChange={(event) => set({ requireApproval: event.target.checked })}
          />
          <span>Hold everything for my approval before sending</span>
        </label>
        <p className="hint">
          {plan.applicationsLeftToday} application{plan.applicationsLeftToday === 1 ? '' : 's'} and{' '}
          {plan.connectsLeftToday} connects left in today's budget.
        </p>
      </fieldset>

      <fieldset>
        <legend>What it would send</legend>
        {plan.blocked ? (
          <p className="callout">{plan.blocked}.</p>
        ) : plan.toApply.length === 0 ? (
          <p className="hint">Nothing in the current list clears your bar.</p>
        ) : (
          <ul className="plan">
            {plan.toApply.map((decision) => (
              <li key={decision.job.id}>
                <button className="plan-job" onClick={() => onOpenJob(decision.job.id)}>
                  <span className="plan-score">{decision.score}</span>
                  <span>
                    <span className="plan-title">{decision.job.title}</span>
                    <span className="plan-note">{decision.connects} connects · {truncate(decision.letter.replace(/\s+/g, ' '), 70)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="actions">
          <button className="primary" onClick={onRun} disabled={plan.toApply.length === 0}>
            Queue {plan.toApply.length || ''} now
          </button>
          {skipped.length > 0 && (
            <button className="link" onClick={() => setShowSkipped((shown) => !shown)}>
              {showSkipped ? 'Hide' : `Why the other ${skipped.length} were skipped`}
            </button>
          )}
        </div>

        {showSkipped && (
          <ul className="reasons">
            {skipped.slice(0, 30).map((decision) => (
              <li key={decision.job.id}>
                <span>{truncate(decision.job.title, 44)}</span>
                <span className="count">{decision.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset>
        <legend>Queue {queued.length ? `(${queued.length})` : ''}</legend>
        {queued.length === 0 ? (
          <p className="hint">Nothing waiting.</p>
        ) : (
          <>
            <ul className="queue">
              {queued.map((application) => (
                <li key={application.id}>
                  <button className="queue-job" onClick={() => onOpenJob(application.jobId)}>
                    <span className="queue-title">{application.jobTitle}</span>
                    <span className="queue-note">
                      {application.score} · {application.connects} connects · {application.auto ? 'auto' : 'by hand'}
                    </span>
                  </button>
                  <span className="queue-actions">
                    <button className="ghost" onClick={() => onStatus(application.id, 'submitted')}>
                      Sent
                    </button>
                    <button className="ghost" onClick={() => onStatus(application.id, 'skipped', 'Dropped from the queue')}>
                      Drop
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <button className="primary" onClick={onSendQueued} disabled={!settings.submitUrl.trim()}>
              Send all through the bridge
            </button>
            {!settings.submitUrl.trim() && (
              <p className="hint">
                No bridge configured, so sending is by hand: open a queued job, copy the letter and submit it on Upwork.
                Set a bridge URL under You → Sending if you run one.
              </p>
            )}
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>History</legend>
        {recent.length === 0 ? (
          <p className="hint">Nothing applied to yet.</p>
        ) : (
          <ul className="history">
            {recent.map((application) => (
              <li key={application.id}>
                <span className={`pill pill-${application.status}`}>{application.status}</span>
                <button className="link grow" onClick={() => onOpenJob(application.jobId)}>
                  {truncate(application.jobTitle, 52)}
                </button>
                <span className="history-when">{new Date(application.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </section>
  )
}
