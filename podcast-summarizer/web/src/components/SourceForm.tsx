import { useState } from 'react'

export function SourceForm({ message, onSubmit }: { message: string; onSubmit: (s: { feedUrl?: string; audioUrl?: string }) => Promise<void> }) {
  const [feedUrl, setFeedUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await onSubmit({ feedUrl: feedUrl.trim() || undefined, audioUrl: audioUrl.trim() || undefined })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>One more thing</h3>
      <p>{message}</p>
      <p className="muted small">
        The RSS feed is usually on the show’s website, or under the show on <a href="https://podcasts.apple.com" target="_blank" rel="noreferrer">Apple Podcasts</a>. A direct MP3 link works too.
      </p>
      <label>
        RSS feed URL
        <input type="url" inputMode="url" autoCapitalize="off" placeholder="https://feeds.example.com/show.xml" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} />
      </label>
      <label>
        or episode audio URL
        <input type="url" inputMode="url" autoCapitalize="off" placeholder="https://cdn.example.com/episode.mp3" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} />
      </label>
      <button className="primary wide" disabled={busy || (!feedUrl.trim() && !audioUrl.trim())} onClick={() => void submit()}>
        {busy ? '…' : 'Continue'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
