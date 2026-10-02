/** Speech model and language, the optional Claude key, and what's stored on the phone. */
import { useEffect, useState } from 'react'
import { AiError, checkKey } from '../ai/claude'
import { CLAUDE_MODELS, loadAiSettings, saveAiSettings, type AiSettings } from '../ai/settings'
import { formatBytes } from '../lib/project'
import { LANGUAGES, type AppSettings } from '../services/settings'
import { deleteProject, listProjects, storageEstimate } from '../store/db'
import { isModelCached, MODELS, type ModelSize } from '../transcribe/client'
import { Sheet } from './Controls'
import { BackIcon, CheckIcon } from './Icons'

interface Props {
  settings: AppSettings
  onChange: (s: AppSettings) => void
  onBack: () => void
}

const MODEL_ORDER: ModelSize[] = ['tiny', 'base', 'small']
const MODEL_NOTES: Record<ModelSize, string> = {
  tiny: 'Fastest. Fine for clear speech.',
  base: 'The best balance on a phone.',
  small: 'Most accurate, but slow, and heavy for older iPhones.',
}

export function SettingsScreen({ settings, onChange, onBack }: Props) {
  const [ai, setAi] = useState<AiSettings>(loadAiSettings)
  const [keyDraft, setKeyDraft] = useState(ai.apiKey)
  const [keyState, setKeyState] = useState<{ kind: 'idle' | 'checking' | 'ok' } | { kind: 'error'; message: string }>({
    kind: 'idle',
  })
  const [cached, setCached] = useState<Record<string, boolean>>({})
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [count, setCount] = useState(0)
  const [confirmWipe, setConfirmWipe] = useState(false)

  useEffect(() => {
    let live = true
    void Promise.all(MODEL_ORDER.map((m) => isModelCached(m, settings.language).catch(() => false))).then((r) => {
      if (live) setCached(Object.fromEntries(MODEL_ORDER.map((m, i) => [m, r[i]])))
    })
    return () => {
      live = false
    }
  }, [settings.language])

  const refreshStorage = () => {
    void storageEstimate().then(setUsage)
    void listProjects()
      .then((p) => setCount(p.length))
      .catch(() => setCount(0))
  }
  useEffect(refreshStorage, [])

  const saveAi = (next: AiSettings) => {
    setAi(next)
    saveAiSettings(next)
  }

  const testKey = async () => {
    const next = { ...ai, apiKey: keyDraft.trim() }
    saveAi(next)
    if (!next.apiKey) {
      setKeyState({ kind: 'idle' })
      return
    }
    setKeyState({ kind: 'checking' })
    try {
      await checkKey(next)
      setKeyState({ kind: 'ok' })
    } catch (error) {
      setKeyState({ kind: 'error', message: error instanceof AiError || error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="screen settings">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <BackIcon />
        </button>
        <h1>Settings</h1>
        <span style={{ width: 44 }} />
      </div>

      <div className="group">
        <h3>Captions model</h3>
        {MODEL_ORDER.map((m) => (
          <button
            key={m}
            className="option"
            aria-pressed={settings.model === m}
            onClick={() => onChange({ ...settings, model: m })}
          >
            <span className="label">
              <strong>
                {MODELS[m].label} · {cached[m] ? 'downloaded' : `${MODELS[m].approxMB} MB`}
              </strong>
              <small>{MODEL_NOTES[m]}</small>
            </span>
            <span className="tick" />
          </button>
        ))}
        <p className="hint">
          Speech recognition runs on this phone with OpenAI's Whisper. The model downloads once, then works offline.
        </p>
      </div>

      <div className="group">
        <h3>Spoken language</h3>
        <select
          className="field"
          value={settings.language ?? ''}
          onChange={(e) => onChange({ ...settings, language: e.target.value || null })}
          aria-label="Spoken language"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code ?? 'auto'} value={l.code ?? ''}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="hint">English uses an English-only model, which is more accurate for English.</p>
      </div>

      <div className="group">
        <h3>Claude (optional)</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          With your own Anthropic API key, Cutline can write hooks and captions, find the best clips, translate and
          fix transcripts. The key stays on this phone and only transcript text is sent to Anthropic, when you tap a
          Claude tool. Get a key at console.anthropic.com.
        </p>
        <input
          className="field"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={keyDraft}
          onChange={(e) => {
            setKeyDraft(e.target.value)
            setKeyState({ kind: 'idle' })
          }}
          aria-label="Anthropic API key"
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn small primary" onClick={testKey} disabled={keyState.kind === 'checking'}>
            {keyState.kind === 'checking' ? 'Checking…' : 'Save key'}
          </button>
          {keyState.kind === 'ok' && (
            <span style={{ color: 'var(--green)', display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 600 }}>
              <CheckIcon width={18} height={18} /> Working
            </span>
          )}
          {ai.apiKey && keyState.kind !== 'checking' && (
            <button
              className="btn small ghost"
              onClick={() => {
                setKeyDraft('')
                saveAi({ ...ai, apiKey: '' })
                setKeyState({ kind: 'idle' })
              }}
            >
              Remove
            </button>
          )}
        </div>
        {keyState.kind === 'error' && (
          <div className="error-card" style={{ marginTop: 10 }}>
            {keyState.message}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          {CLAUDE_MODELS.map((m) => (
            <button key={m.id} className="option" aria-pressed={ai.model === m.id} onClick={() => saveAi({ ...ai, model: m.id })}>
              <span className="label">
                <strong>{m.label}</strong>
                <small>{m.note}</small>
              </span>
              <span className="tick" />
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <h3>Export</h3>
        <div className="segmented" role="group" aria-label="Default resolution">
          {([1080, 720] as const).map((v) => (
            <button key={v} aria-pressed={settings.exportShortSide === v} onClick={() => onChange({ ...settings, exportShortSide: v })}>
              {v}p
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <h3>On this phone</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          {count} {count === 1 ? 'project' : 'projects'}
          {usage ? ` · ${formatBytes(usage.usage)} used` : ''}. Your videos never leave the phone unless you share them.
        </p>
        <button className="btn danger small" disabled={count === 0} onClick={() => setConfirmWipe(true)}>
          Delete all projects
        </button>
      </div>

      <p className="footnote">Cutline · captions and cuts made on your phone</p>

      {confirmWipe && (
        <Sheet title="Delete every project?" onClose={() => setConfirmWipe(false)}>
          <p className="hint">This removes all projects and their copies of your videos from Cutline. Your Photos are untouched.</p>
          <div className="actions">
            <button
              className="btn danger block"
              onClick={async () => {
                const all = await listProjects().catch(() => [] as unknown[])
                for (const p of all) {
                  const id = (p as { id?: unknown }).id
                  if (typeof id === 'string') await deleteProject(id).catch(() => {})
                }
                setConfirmWipe(false)
                refreshStorage()
              }}
            >
              Delete everything
            </button>
            <button className="btn ghost block" onClick={() => setConfirmWipe(false)}>
              Keep them
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
