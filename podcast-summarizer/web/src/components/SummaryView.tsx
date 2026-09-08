import { useState } from 'react'
import { summaryToMarkdown, timestampToSeconds } from '../markdown'
import type { Job } from '../types'

function Stamp({ ts, spotifyUrl }: { ts: string; spotifyUrl?: string }) {
  const secs = timestampToSeconds(ts)
  if (spotifyUrl && secs !== undefined) {
    return (
      <a className="stamp" href={`${spotifyUrl}?t=${secs}`} target="_blank" rel="noreferrer" title="Open in Spotify at this point">
        {ts}
      </a>
    )
  }
  return <span className="stamp">{ts}</span>
}

export function SummaryView({ job }: { job: Job }) {
  const s = job.summary!
  const url = job.episode?.spotifyUrl
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const text = summaryToMarkdown(job)
    const title = job.episode?.title ?? 'Podcast summary'
    if (navigator.share) {
      try {
        await navigator.share({ title, text })
        return
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* nothing to do */
    }
  }

  return (
    <div className="summary">
      <div className="actions">
        <button className="secondary" onClick={() => void share()}>
          {copied ? 'Copied' : 'Share / copy'}
        </button>
        {job.transcriptWords && (
          <span className="muted small">
            {job.transcriptWords.toLocaleString()} words · transcript from {job.transcriptSource === 'feed' ? 'the publisher' : job.transcriptSource}
          </span>
        )}
      </div>

      <section className="card">
        <h3>TL;DR</h3>
        <p className="tldr">{s.tldr}</p>
        {s.people.length > 0 && <p className="muted small">{s.people.join(' · ')}</p>}
      </section>

      <section className="card">
        <h3>
          Key points <span className="count">{s.key_points.length}</span>
        </h3>
        <ol className="points">
          {s.key_points.map((p, i) => (
            <li key={i}>
              <div className="point">
                <Stamp ts={p.timestamp} spotifyUrl={url} />
                <strong>{p.point}</strong>
              </div>
              <p className="detail">{p.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {s.chapters.length > 0 && (
        <section className="card">
          <h3>Chapters</h3>
          <ul className="chapters">
            {s.chapters.map((c, i) => (
              <li key={i}>
                <div className="point">
                  <Stamp ts={c.start} spotifyUrl={url} />
                  <strong>{c.title}</strong>
                </div>
                <p className="detail">{c.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.quotes.length > 0 && (
        <section className="card">
          <h3>Quotes</h3>
          {s.quotes.map((q, i) => (
            <blockquote key={i}>
              “{q.text}”
              <footer>
                — {q.speaker} <Stamp ts={q.timestamp} spotifyUrl={url} />
              </footer>
            </blockquote>
          ))}
        </section>
      )}

      {s.action_items.length > 0 && (
        <section className="card">
          <h3>Action items</h3>
          <ul className="checks">
            {s.action_items.map((a, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" /> <span>{a}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.mentions.length > 0 && (
        <section className="card">
          <h3>Mentioned</h3>
          <ul className="plain">
            {s.mentions.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      {job.model && <p className="muted small center">Summarized by {job.model}</p>}
    </div>
  )
}
