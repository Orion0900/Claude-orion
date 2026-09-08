import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { isActive, type Job } from '../types'
import { EpisodeCard } from './EpisodeCard'
import { Progress } from './Progress'
import { SourceForm } from './SourceForm'
import { SummaryView } from './SummaryView'
import { TranscriptForm } from './TranscriptForm'

export function JobView({
  id,
  initial,
  onUpdate,
  onDelete,
}: {
  id: string
  initial?: Job
  onUpdate: (job: Job) => void
  onDelete: (id: string) => Promise<void>
}) {
  const [job, setJob] = useState<Job | undefined>(initial)
  const [error, setError] = useState<string | undefined>()

  // Poll while the job is running. Also re-fetch when the app comes back to
  // the foreground, because iOS pauses timers in a backgrounded PWA.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const fresh = await api.getJob(id)
        if (cancelled) return
        setJob(fresh)
        setError(undefined)
        onUpdate(fresh)
        if (isActive(fresh.stage) || fresh.stage === 'needs_transcript') timer = setTimeout(tick, isActive(fresh.stage) ? 2500 : 6000)
      } catch (err) {
        if (cancelled) return
        // A saved summary is still readable when the server is unreachable.
        if (!job?.summary) setError((err as Error).message)
        timer = setTimeout(tick, 8000)
      }
    }
    void tick()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (timer) clearTimeout(timer)
        void tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const provideTranscript = useCallback(
    async (text: string, format: string | undefined, source: 'phone' | 'manual') => {
      const updated = await api.provideTranscript(id, text, format, source)
      setJob(updated)
    },
    [id],
  )

  if (!job) {
    return <p className="muted center">{error ?? 'Loading…'}</p>
  }

  const provide = async (source: { feedUrl?: string; audioUrl?: string }) => {
    const updated = await api.provideSource(id, source)
    setJob(updated)
  }


  return (
    <div className="job">
      <EpisodeCard episode={job.episode} />
      {!job.episode && <p className="muted small break">{job.input}</p>}

      {job.stage !== 'done' && <Progress stage={job.stage} message={job.message} />}

      {job.stage === 'needs_source' && <SourceForm message={job.message} onSubmit={provide} />}

      {job.stage === 'needs_transcript' && <TranscriptForm key={job.updatedAt} episode={job.episode} message={job.message} onSubmit={provideTranscript} />}

      {job.stage === 'failed' && (
        <div className="card failed">
          <h3>Didn’t work</h3>
          <p>{job.error}</p>
          {job.episode?.source === 'spotify' ? (
            <SourceForm message="If you know where the audio lives, give it here and we’ll try again." onSubmit={provide} />
          ) : (
            <TranscriptForm episode={job.episode} message="You can still paste the transcript by hand." onSubmit={provideTranscript} />
          )}
        </div>
      )}

      {job.stage === 'done' && job.summary && <SummaryView job={job} />}

      {error && <p className="error small">{error}</p>}

      <button className="link danger" onClick={() => void onDelete(id)}>
        Delete this summary
      </button>
    </div>
  )
}
