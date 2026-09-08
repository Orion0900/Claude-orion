import { useState } from 'react'

const LOOKS_LIKE_SPOTIFY = /spotify\.com\/|spotify:episode:|spotify\.link\//i

export function UrlForm({ onSubmit }: { onSubmit: (url: string) => Promise<void> }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText

  const submit = async (value: string) => {
    const v = value.trim()
    if (!v) return
    if (!LOOKS_LIKE_SPOTIFY.test(v)) {
      setError('Paste a Spotify episode link (open.spotify.com/episode/…).')
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await onSubmit(v)
      setUrl('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setUrl(text)
      await submit(text)
    } catch {
      setError('Couldn’t read the clipboard. Paste into the box instead.')
    }
  }

  return (
    <section className="card hero">
      <h2>Summarize an episode</h2>
      <p className="muted">In Spotify, tap <strong>Share → Copy link</strong> on an episode, then paste it here.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(url)
        }}
      >
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="https://open.spotify.com/episode/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="primary" disabled={busy || !url.trim()}>
          {busy ? '…' : 'Go'}
        </button>
      </form>
      {canPaste && (
        <button className="secondary wide" onClick={() => void paste()} disabled={busy}>
          Paste link &amp; summarize
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
