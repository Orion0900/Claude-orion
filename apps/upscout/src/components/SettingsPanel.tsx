/**
 * You, your sources, and what the ranking cares about.
 *
 * The weights are here rather than buried: they're the difference between "I
 * want the best-paid work" and "I want anything I can win", and they're the
 * first thing worth changing when the order looks wrong.
 */
import { useState } from 'react'
import { REFRESH_CHOICES } from '../lib/refresh'
import { exportState, importState, type AppState } from '../lib/store'
import { parseTerms } from '../lib/text'
import type { SourceConfig, SourceKind, Weights } from '../lib/types'
import { bridgeLink, fetchBridgeStatus, type SourceResult } from '../services/sources'

const WEIGHT_LABELS: { key: keyof Weights; label: string; describes: string }[] = [
  { key: 'pay', label: 'Pay', describes: 'Rate or budget against your target' },
  { key: 'skills', label: 'Skills', describes: 'How much of it you already do' },
  { key: 'client', label: 'Client', describes: 'Verified, spending, well rated' },
  { key: 'competition', label: 'Competition', describes: 'How many have bid already' },
  { key: 'freshness', label: 'Freshness', describes: 'How long ago it was posted' },
  { key: 'fit', label: 'Fit', describes: 'Sounds like your kind of work' },
]

const SOURCE_KINDS: { value: SourceKind; label: string }[] = [
  { value: 'bridge', label: 'UpScout bridge — set up once, then it just refreshes' },
  { value: 'rss', label: 'Saved-search feed (RSS)' },
  { value: 'json', label: 'Any endpoint returning JSON jobs' },
  { value: 'upwork-api', label: 'Upwork GraphQL API through a plain proxy' },
]

export default function SettingsPanel({
  state,
  sourceResults,
  onChange,
  onReplaceState,
  onNotify,
}: {
  state: AppState
  sourceResults: SourceResult[]
  onChange: (change: Partial<AppState>) => void
  onReplaceState: (state: AppState) => void
  onNotify: (text: string, tone: 'ok' | 'bad') => void
}) {
  const [importText, setImportText] = useState('')
  // Connection checks, per source, so one bridge saying "not connected yet"
  // doesn't look like a verdict on the others.
  const [checks, setChecks] = useState<Record<string, { text: string; tone: 'ok' | 'bad' | 'busy' }>>({})
  const [includeTokens, setIncludeTokens] = useState(false)
  const { profile, weights, sources, autoApply } = state

  const setProfile = (change: Partial<typeof profile>) => onChange({ profile: { ...profile, ...change } })
  const setSource = (id: string, change: Partial<SourceConfig>) =>
    onChange({ sources: sources.map((source) => (source.id === id ? { ...source, ...change } : source)) })

  /** Asks the bridge whether it's connected to Upwork, and says so plainly. */
  const check = async (source: SourceConfig) => {
    setChecks((previous) => ({ ...previous, [source.id]: { text: 'Checking…', tone: 'busy' } }))
    try {
      const status = await fetchBridgeStatus(source.url, source.token)
      setChecks((previous) => ({
        ...previous,
        [source.id]: status.connected
          ? { text: 'Connected to Upwork. Refresh will pull live jobs.', tone: 'ok' }
          : { text: 'The bridge is up but not connected to Upwork yet — press Connect.', tone: 'bad' },
      }))
    } catch (error) {
      setChecks((previous) => ({
        ...previous,
        [source.id]: { text: error instanceof Error ? error.message : String(error), tone: 'bad' },
      }))
    }
  }

  const addSource = () =>
    onChange({
      sources: [
        ...sources,
        {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          kind: 'bridge',
          label: `Source ${sources.length + 1}`,
          enabled: true,
          url: '',
        },
      ],
    })

  const copyExport = async () => {
    const json = exportState(state, { includeTokens })
    try {
      await navigator.clipboard.writeText(json)
      onNotify('Settings copied — paste them into the other device.', 'ok')
    } catch {
      setImportText(json)
      onNotify('Copy blocked; the settings are in the box below instead.', 'bad')
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>You</h1>
          <p className="sub">Everything here stays on this device.</p>
        </div>
      </div>

      <fieldset>
        <legend>Profile</legend>
        <div className="row">
          <label className="field grow">
            <span>Name</span>
            <input type="text" value={profile.name} onChange={(event) => setProfile({ name: event.target.value })} />
          </label>
          <label className="field grow">
            <span>Headline</span>
            <input
              type="text"
              value={profile.headline}
              placeholder="Front-end engineer"
              onChange={(event) => setProfile({ headline: event.target.value })}
            />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>Target $/hr</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={profile.targetHourly}
              onChange={(event) => setProfile({ targetHourly: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="field">
            <span>Won't work under</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={profile.minHourly}
              onChange={(event) => setProfile({ minHourly: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="field">
            <span>Min fixed $</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={profile.minFixed}
              onChange={(event) => setProfile({ minFixed: Number(event.target.value) || 0 })}
            />
          </label>
        </div>
        <label className="field">
          <span>Your skills</span>
          <input
            type="text"
            value={profile.skills.join(', ')}
            placeholder="React, TypeScript, Node.js"
            onChange={(event) => setProfile({ skills: parseTerms(event.target.value) })}
          />
          <small>Used for ranking and for the letters. Worth being specific.</small>
        </label>
        <label className="field">
          <span>What you're unusually good at</span>
          <input
            type="text"
            value={profile.strengths.join(', ')}
            placeholder="dashboards, design systems, migrations"
            onChange={(event) => setProfile({ strengths: parseTerms(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Never, however well it pays</span>
          <input
            type="text"
            value={profile.avoid.join(', ')}
            onChange={(event) => setProfile({ avoid: parseTerms(event.target.value) })}
          />
          <small>A job mentioning one of these loses points and is never auto-applied to.</small>
        </label>
        <div className="row">
          <label className="field grow">
            <span>Portfolio link</span>
            <input
              type="url"
              inputMode="url"
              value={profile.portfolio}
              placeholder="https://"
              onChange={(event) => setProfile({ portfolio: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Timezone</span>
            <input type="text" value={profile.timezone} onChange={(event) => setProfile({ timezone: event.target.value })} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>What matters in the ranking</legend>
        {WEIGHT_LABELS.map((entry) => (
          <label key={entry.key} className="field weight">
            <span>
              {entry.label} <em>{entry.describes}</em>
              <strong>{weights[entry.key]}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={40}
              value={weights[entry.key]}
              onChange={(event) => onChange({ weights: { ...weights, [entry.key]: Number(event.target.value) } })}
            />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Sources</legend>
        <p className="hint">
          A browser may only fetch from a server that permits it, and upwork.com permits nobody — so an Upwork URL
          pasted straight in will be blocked. The way round it is the bridge in
          <code>connector/upwork-bridge</code>: deploy it once, press Connect once, and Refresh works by itself from
          then on, here and on your phone. Until it's up, <strong>Search → Paste jobs in</strong> needs no setup at all.
        </p>

        {sources.map((source) => {
          const result = sourceResults.find((entry) => entry.sourceId === source.id)
          return (
            <div key={source.id} className="source">
              <div className="row">
                <label className="field grow">
                  <span>Name</span>
                  <input type="text" value={source.label} onChange={(event) => setSource(source.id, { label: event.target.value })} />
                </label>
                <label className="check">
                  <input type="checkbox" checked={source.enabled} onChange={(event) => setSource(source.id, { enabled: event.target.checked })} />
                  <span>On</span>
                </label>
              </div>
              <label className="field">
                <span>Kind</span>
                <select value={source.kind} onChange={(event) => setSource(source.id, { kind: event.target.value as SourceKind })}>
                  {SOURCE_KINDS.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>URL</span>
                <input
                  type="url"
                  inputMode="url"
                  value={source.url}
                  placeholder="https://your-bridge.example.com/jobs"
                  onChange={(event) => setSource(source.id, { url: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Token</span>
                <input
                  type="password"
                  value={source.token ?? ''}
                  placeholder={source.kind === 'rss' ? 'only if your bridge asks for one' : 'sent as a bearer token'}
                  onChange={(event) => setSource(source.id, { token: event.target.value })}
                />
                <small>Kept on this device. Exported settings leave it out unless you ask for it below.</small>
              </label>
              {source.kind === 'bridge' && (
                <>
                  <div className="actions">
                    <button className="ghost small" onClick={() => void check(source)} disabled={!source.url.trim()}>
                      Check connection
                    </button>
                    <a
                      className="ghost small"
                      href={bridgeLink(source.url, '/connect', source.token)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Connect Upwork
                    </a>
                    <a
                      className="link"
                      href={bridgeLink(source.url, '', source.token)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open bridge
                    </a>
                  </div>
                  {checks[source.id] && (
                    <p className={checks[source.id].tone === 'ok' ? 'hint ok' : checks[source.id].tone === 'busy' ? 'hint' : 'flag'}>
                      {checks[source.id].text}
                    </p>
                  )}
                </>
              )}

              {result && (
                <p className={result.error ? 'flag' : 'hint'}>
                  {result.error ? result.error : `Last pull: ${result.jobs.length} job${result.jobs.length === 1 ? '' : 's'}.`}
                </p>
              )}
              <button className="danger small" onClick={() => onChange({ sources: sources.filter((entry) => entry.id !== source.id) })}>
                Remove
              </button>
            </div>
          )
        })}
        <button className="ghost" onClick={addSource}>
          Add a source
        </button>
      </fieldset>

      <fieldset>
        <legend>Refreshing</legend>
        <label className="field">
          <span>Fetch by itself</span>
          <select
            value={state.autoRefreshMinutes}
            onChange={(event) => onChange({ autoRefreshMinutes: Number(event.target.value) })}
          >
            {REFRESH_CHOICES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? 'Only when I press Refresh' : `Every ${minutes} minutes`}
              </option>
            ))}
          </select>
          <small>
            Also when you open the app or come back to it. Nothing is fetched while the app is in the background, so
            this costs you nothing when you're not looking.
          </small>
        </label>
      </fieldset>

      <fieldset>
        <legend>Sending</legend>
        <label className="field">
          <span>Bridge URL</span>
          <input
            type="url"
            inputMode="url"
            value={autoApply.submitUrl}
            placeholder="https://your-bridge.example.com/apply"
            onChange={(event) => onChange({ autoApply: { ...autoApply, submitUrl: event.target.value } })}
          />
          <small>
            Left empty, sending is manual: the letter is copied and Upwork's apply page opens. Upwork has no public
            endpoint that submits a proposal, so anything automatic is something you run.
          </small>
        </label>
        <label className="field">
          <span>Bridge token</span>
          <input
            type="password"
            value={autoApply.submitToken ?? ''}
            onChange={(event) => onChange({ autoApply: { ...autoApply, submitToken: event.target.value } })}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Move this to another device</legend>
        <p className="hint">
          Settings, letters and history as a block of text — copy it on the laptop, paste it on the phone. Cached jobs
          are left out; they belong to the device that fetched them.
        </p>
        <div className="actions">
          <button className="ghost" onClick={copyExport}>
            Copy my settings
          </button>
          <label className="check">
            <input type="checkbox" checked={includeTokens} onChange={(event) => setIncludeTokens(event.target.checked)} />
            <span>Include bridge tokens</span>
          </label>
        </div>
        {includeTokens && (
          <p className="flag">
            This copy contains the key to your bridge. Fine for pasting into your own phone; not something to leave
            lying around.
          </p>
        )}
        <textarea
          className="paste"
          rows={4}
          value={importText}
          placeholder="Paste settings here to load them"
          onChange={(event) => setImportText(event.target.value)}
        />
        <button
          className="primary"
          disabled={!importText.trim()}
          onClick={() => {
            try {
              // Cached jobs belong to this device; everything else is replaced.
              onReplaceState({ ...importState(importText), jobs: state.jobs })
              setImportText('')
              onNotify('Settings loaded.', 'ok')
            } catch {
              onNotify("That doesn't look like exported settings.", 'bad')
            }
          }}
        >
          Load these settings
        </button>
      </fieldset>

      <fieldset>
        <legend>Housekeeping</legend>
        <div className="actions">
          <button className="ghost" onClick={() => onChange({ jobs: [], lastFetchedAt: undefined })}>
            Clear cached jobs ({state.jobs.length})
          </button>
          <button
            className="danger"
            onClick={() => {
              if (confirm('Delete every application record? Letters and settings are kept.')) onChange({ applications: [] })
            }}
          >
            Clear history ({state.applications.length})
          </button>
        </div>
      </fieldset>
    </section>
  )
}
