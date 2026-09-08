/**
 * The ranked list — the screen you'll actually live in.
 *
 * Every card leads with the score and the one line that explains it, because a
 * ranking you can't see the reasoning for is just a shuffled list. Cards are
 * whole-card tap targets: on a phone this gets read one-handed.
 */
import { describeCriteria, type FilterResult } from '../lib/criteria'
import { describeFetchedAt } from '../lib/refresh'
import { explain, TIER_LABEL, type ScoredJob } from '../lib/scoring'
import { formatBudget } from '../lib/template'
import { truncate } from '../lib/text'
import type { Criteria } from '../lib/types'

export default function JobList({
  ranked,
  filtered,
  appliedIds,
  lastFetchedAt,
  now,
  fetching,
  criteria,
  onRefresh,
  onOpen,
  onEditCriteria,
}: {
  ranked: ScoredJob[]
  filtered: FilterResult
  appliedIds: Set<string>
  lastFetchedAt?: string
  now: Date
  fetching: boolean
  criteria: Criteria
  onRefresh: () => void
  onOpen: (id: string) => void
  onEditCriteria: () => void
}) {
  const droppedCount = filtered.dropped.length
  const topReasons = Object.entries(filtered.reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>{ranked.length ? `${ranked.length} worth a look` : 'No jobs yet'}</h1>
          <p className="sub">
            {describeCriteria(criteria)} · {fetching ? 'fetching…' : describeFetchedAt(lastFetchedAt, now)}
          </p>
        </div>
        <button className="primary" onClick={onRefresh} disabled={fetching}>
          {fetching ? '…' : 'Refresh'}
        </button>
      </div>

      {ranked.length === 0 && (
        <div className="empty">
          {droppedCount > 0 ? (
            <>
              <p>
                <strong>{droppedCount}</strong> job{droppedCount === 1 ? '' : 's'} came in and your criteria dropped
                every one.
              </p>
              <ul className="reasons">
                {topReasons.map(([reason, count]) => (
                  <li key={reason}>
                    <span>{reason}</span>
                    <span className="count">{count}</span>
                  </li>
                ))}
              </ul>
              <button className="ghost" onClick={onEditCriteria}>
                Loosen the criteria
              </button>
            </>
          ) : (
            <>
              <p>
                Nothing here yet. Set up the bridge once under <strong>You → Sources</strong> and Refresh will pull live
                jobs from then on — or paste a search in and start from that.
              </p>
              <button className="ghost" onClick={onEditCriteria}>
                Set up a search
              </button>
            </>
          )}
        </div>
      )}

      <ul className="jobs">
        {ranked.map((entry) => (
          <JobCard key={entry.job.id} entry={entry} applied={appliedIds.has(entry.job.id)} onOpen={onOpen} />
        ))}
      </ul>

      {ranked.length > 0 && droppedCount > 0 && (
        <p className="footnote">
          {droppedCount} more filtered out{topReasons.length ? ` — mostly: ${topReasons[0][0].toLowerCase()}` : ''}.{' '}
          <button className="link" onClick={onEditCriteria}>
            Adjust
          </button>
        </p>
      )}
    </section>
  )
}

function JobCard({ entry, applied, onOpen }: { entry: ScoredJob; applied: boolean; onOpen: (id: string) => void }) {
  const { job, score } = entry
  const { good, bad } = explain(score)
  const budget = formatBudget(job)

  return (
    <li>
      <button className="job" onClick={() => onOpen(job.id)}>
        <span className={`score score-${score.tier}`}>
          <span className="score-number">{score.total}</span>
          <span className="score-tier">{TIER_LABEL[score.tier]}</span>
        </span>

        <span className="job-body">
          <span className="job-title">{job.title}</span>
          <span className="job-meta">
            {budget && <span className="chip chip-pay">{budget}</span>}
            {job.proposals !== undefined && <span className="chip">{job.proposals} bids</span>}
            {job.client.paymentVerified && <span className="chip chip-ok">verified</span>}
            {job.client.country && <span className="chip">{job.client.country}</span>}
            {applied && <span className="chip chip-applied">applied</span>}
          </span>
          <span className="job-why">
            {good.map((factor) => (
              <span key={factor.key} className="why why-good">
                {factor.note}
              </span>
            ))}
            {bad && <span className="why why-bad">{bad.note}</span>}
          </span>
          {job.description && <span className="job-snippet">{truncate(job.description.replace(/\s+/g, ' '), 130)}</span>}
        </span>
      </button>
    </li>
  )
}
