import { useEffect, useRef, useState } from 'react'
import { fetchCaptionsFromPhone } from '../captions'
import type { Episode } from '../types'

/**
 * Shown when the server couldn't read captions. First the phone tries the
 * mirrors itself; if that fails too, the user can paste the transcript.
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
  const [phase, setPhase] = useState<'trying' | 'manual' | 'sending'>('trying')
  const [status, setStatus] = useState('Asking YouTube from your phone…')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | undefined>()
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true
    if (!episode || episode.source !== 'youtube' || /no captions/i.test(message)) {
      setPhase('manual')
      return
    }
    void (async () => {
      const vtt = await fetchCaptionsFromPhone(episode.id, setStatus)
      if (!vtt) {
        setPhase('manual')
        return
      }
      setPhase('sending')
      setStatus('Got them. Sending to the server…')
      try {
        await onSubmit(vtt, 'vtt', 'phone')
      } catch (err) {
        setError((err as Error).message)
        setPhase('manual')
      }
    })()
  }, [episode, message, onSubmit])

  const submitManual = async () => {
    setPhase('sending')
    setError(undefined)
    try {
      await onSubmit(text, undefined, 'manual')
    } catch (err) {
      setError((err as Error).message)
      setPhase('manual')
    }
  }

  if (phase !== 'manual') {
    return (
      <div className="card">
        <h3>Getting captions</h3>
        <p className="muted small">{message}</p>
        <p className="status">
          <span className="spinner" /> {status}
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3>Paste the transcript</h3>
      <p>{message}</p>
      <ol className="plain steps-text small">
        <li>Open the video on <strong>youtube.com in Safari</strong> (not the app).</li>
        <li>Under the video, tap <strong>…more</strong> in the description, then <strong>Show transcript</strong>.</li>
        <li>Select all of the transcript text, copy it, and paste below.</li>
      </ol>
      <textarea
        rows={8}
        placeholder="0:00 Welcome back to the show…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <button className="primary wide" disabled={text.trim().length < 200} onClick={() => void submitManual()}>
        Summarize this transcript
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
