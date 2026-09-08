import { useEffect, useState } from 'react'
import { api, getApiBase, setApiBase } from '../api'
import type { Health } from '../types'
import { Bookmarklet } from './Bookmarklet'

export function Settings() {
  const [base, setBase] = useState(getApiBase())
  const [health, setHealth] = useState<Health | undefined>()
  const [error, setError] = useState<string | undefined>()

  const check = async () => {
    setError(undefined)
    setHealth(undefined)
    try {
      setHealth(await api.health())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    void check()
  }, [])

  const save = () => {
    setApiBase(base)
    void check()
  }

  const Row = ({ label, ok, note }: { label: string; ok: boolean; note?: string }) => (
    <li>
      <span className={`dot ${ok ? 'ok' : 'off'}`} /> {label} <span className="muted small">{ok ? 'configured' : note ?? 'not set'}</span>
    </li>
  )

  return (
    <div className="settings">
      <section className="card">
        <h3>Server</h3>
        <p className="muted small">Leave blank when the app is served by the PodBrief server itself. Set it if the app is hosted somewhere else.</p>
        <label>
          API URL
          <input type="url" inputMode="url" autoCapitalize="off" placeholder="https://podbrief.example.com" value={base} onChange={(e) => setBase(e.target.value)} />
        </label>
        <button className="primary wide" onClick={save}>
          Save &amp; check
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {health && (
        <section className="card">
          <h3>Status</h3>
          <ul className="plain status-list">
            <Row label="Claude" ok={health.providers.anthropic} note="ANTHROPIC_API_KEY missing" />
            <Row label="YouTube captions" ok={true} />
            <Row label="Spotify transcription (AssemblyAI)" ok={health.providers.assemblyai} note="optional" />
            <Row label="Spotify transcription (OpenAI Whisper)" ok={health.providers.openai} note="optional" />
            <Row label="Spotify Web API" ok={health.providers.spotifyApi} note="optional; page scraping in use" />
          </ul>
          <p className="muted small">Model: {health.model}</p>
        </section>
      )}

      <Bookmarklet />

      <section className="card">
        <h3>Install on iPhone</h3>
        <ol className="plain steps-text">
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li>
          <li>Open PodBrief from the icon. It runs full screen and remembers your summaries offline.</li>
        </ol>
      </section>
    </div>
  )
}
