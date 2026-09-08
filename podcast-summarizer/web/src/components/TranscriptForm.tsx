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
      <h3>Paste the transcript</h3>
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

      <ol className="plain steps-text small">
        <li>
          {videoUrl ? (
            <a href={videoUrl} target="_blank" rel="noreferrer">
              Open the video on youtube.com ↗
            </a>
          ) : (
            'Open the video on youtube.com in Safari'
          )}{' '}
          — the website, not the app.
        </li>
        <li>Tap <strong>…more</strong> under the title, then <strong>Show transcript</strong>.</li>
        <li>Press and hold the transcript, <strong>Select All</strong>, <strong>Copy</strong>.</li>
        <li>Paste below and tap Summarize.</li>
      </ol>

      <textarea
        rows={7}
        placeholder="0:00&#10;Welcome back to the show&#10;0:04&#10;Today we're talking about…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <p className="muted small">Timestamps are kept, so the summary can still point at the moment.</p>
      <button className="primary wide" disabled={text.trim().length < 200 || auto === 'sending'} onClick={() => void submitManual()}>
        Summarize this transcript
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
