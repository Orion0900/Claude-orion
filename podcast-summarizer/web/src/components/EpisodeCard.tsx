import type { EpisodeMeta } from '../types'

function formatDuration(ms?: number) {
  if (!ms) return undefined
  const m = Math.round(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

export function EpisodeCard({ episode, compact = false }: { episode?: EpisodeMeta; compact?: boolean }) {
  if (!episode) return null
  const meta = [episode.showName, episode.publishedAt?.slice(0, 10), formatDuration(episode.durationMs)].filter(Boolean).join(' · ')
  return (
    <div className={`episode ${compact ? 'compact' : ''}`}>
      {episode.imageUrl ? <img src={episode.imageUrl} alt="" className="art" loading="lazy" /> : <div className="art placeholder" />}
      <div className="episode-text">
        <div className="episode-title">{episode.title}</div>
        {meta && <div className="muted small">{meta}</div>}
        {!compact && (
          <a className="small" href={episode.spotifyUrl} target="_blank" rel="noreferrer">
            Open in Spotify ↗
          </a>
        )}
      </div>
    </div>
  )
}
