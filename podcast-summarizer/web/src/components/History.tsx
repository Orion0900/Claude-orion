import { EpisodeCard } from './EpisodeCard'
import { isActive, isWaiting, type Job } from '../types'

export function History({ jobs, onOpen, onDelete }: { jobs: Job[]; onOpen: (id: string) => void; onDelete: (id: string) => Promise<void> }) {
  if (jobs.length === 0) {
    return <p className="muted center">Your summaries will show up here.</p>
  }
  return (
    <section className="history">
      <h2>Recent</h2>
      <ul className="list">
        {jobs.map((job) => (
          <li key={job.id}>
            <button className="row-button" onClick={() => onOpen(job.id)}>
              {job.episode ? <EpisodeCard episode={job.episode} compact /> : <div className="episode compact"><div className="art placeholder" /><div className="episode-text"><div className="episode-title break">{job.input}</div></div></div>}
              <span className={`pill ${isWaiting(job.stage) ? 'waiting' : job.stage}`}>
                {isActive(job.stage) ? 'Working…' : job.stage === 'done' ? 'Ready' : isWaiting(job.stage) ? 'Needs input' : 'Failed'}
              </span>
            </button>
            <button className="link danger small" onClick={() => void onDelete(job.id)} aria-label="Delete">
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
