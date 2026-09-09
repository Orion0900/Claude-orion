import { useEffect, useRef, useState } from 'react'
import { fetchCaptionsFromPhone } from '../captions'
import type { Episode } from '../types'

/**
 * Shown when the server couldn't read captions. The phone retries the public
 * mirrors from its own connection in the background — but those are often
 * down, so the paste box is offered immediately rather than after the wait.
 */
export function TranscriptForm({
  episode,
  message,
  onSubmit,
}: {
  episode?: Episode
  message: string
  onSubmit: (text: string, format: string | undefined, source: 'phone' | 'manual') => Promise<void>
}) {
  const [auto, setAuto] = useState<'idle' | 'trying' | 'failed' | 'sending'>('idle')
  const [status, setStatus] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | undefined>()
  const attempted = useRef(false)

  const canAuto = episode?.source === 'youtube' && !/no captions/i.test(message)

  useEffect(() => {
    if (attempted.current || !canAuto || !episode) return
    attempted.current = true
    setAuto('trying')
    void (async () => {
      const vtt = await fetchCaptionsFromPhone(episode.id, setStatus)
      if (!vtt) {
        setAuto('failed')
        return
      }
      setAuto('sending')
      try {
        await onSubmit(vtt, 'vtt', 'phone')
      } catch (err) {
        setError((err as Error).message)
        setAuto('failed')
      }
    })()
  }, [canAuto, episode, onSubmit])

  const submitManual = async () => {
    setError(undefined)
    try {
      await onSubmit(text, undefined, 'manual')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const videoUrl = episode?.url ?? ''

  return (
    <div className="card">
      <h3>Get the transcript</h3>
      <p className="muted small">{message}</p>

      {auto === 'trying' && (
        <p className="status small">
          <span className="spinner" /> Also trying from your phone… {status}
        </p>
      )}
      {auto === 'sending' && (
        <p className="status small">
          <span className="spinner" /> Got them from your phone. Sending…
        </p>
      )}

      {videoUrl && (
        <p>
          <a className="primary-link" href={videoUrl} target="_blank" rel="noreferrer">
            Open this episode on YouTube ↗
          </a>
        </p>
      )}
      <p className="muted small">
        With it open, tap the address bar and then your <strong>PodBrief</strong> favourite — it reads the captions and
        sends them here on its own. <a href="#/settings">Set that up once</a> and you never paste again.
      </p>
      <details>
        <summary className="muted small">Or copy the transcript by hand</summary>
        <ol className="plain steps-text small">
          <li>On the video, tap <strong>AA</strong> in Safari’s address bar, then <strong>Request Desktop Website</strong>. The mobile site has no transcript.</li>
          <li>Under the video, tap <strong>…more</strong>, then <strong>Show transcript</strong>.</li>
          <li>Press and hold it, <strong>Select All</strong>, <strong>Copy</strong>.</li>
          <li>Come back here and paste below.</li>
        </ol>
      </details>

      <textarea
        rows={7}
        placeholder="0:00&#10;Welcome back to the show&#10;0:04&#10;Today we're talking about…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <p className="muted small">
        Timestamps are kept, so the summary can still point at the moment.
      </p>
      <button className="primary wide" disabled={text.trim().length < 200 || auto === 'sending'} onClick={() => void submitManual()}>
        Summarize this transcript
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
