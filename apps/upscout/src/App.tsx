/**
 * The app itself: one piece of state, five tabs over it.
 *
 * Everything that decides anything — what's shown, what's ranked where, what
 * auto-apply would send — is a pure function in lib/, called from here. This
 * file only holds the state, saves it, and wires the buttons up, which is what
 * keeps the interesting parts testable without a browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AutoApplyPanel from './components/AutoApplyPanel'
import CriteriaForm from './components/CriteriaForm'
import JobList from './components/JobList'
import JobSheet from './components/JobSheet'
import SettingsPanel from './components/SettingsPanel'
import TemplateEditor from './components/TemplateEditor'
import Toast from './components/Toast'
import { applicationsFromPlan, draftApplication, planAutoApply } from './lib/autoApply'
import { filterJobs } from './lib/criteria'
import { liveSources, shouldAutoRefresh } from './lib/refresh'
import { rankJobs, type ScoredJob } from './lib/scoring'
import { createLocalStore, MAX_APPLICATIONS, type AppState } from './lib/store'
import type { Application, Job } from './lib/types'
import { fetchAllSources, type SourceResult } from './services/sources'
import { applyUrl, copyToClipboard, NotConfiguredError, submitApplication } from './services/submit'

export type Tab = 'jobs' | 'search' | 'letters' | 'auto' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'jobs', label: 'Jobs', icon: '◎' },
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'letters', label: 'Letters', icon: '✎' },
  { id: 'auto', label: 'Auto', icon: '⚡' },
  { id: 'settings', label: 'You', icon: '☰' },
]

export default function App() {
  const store = useMemo(() => createLocalStore(), [])
  const [state, setState] = useState<AppState>(() => store.read())
  const [tab, setTab] = useState<Tab>('jobs')
  const [openJobId, setOpenJobId] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [sourceResults, setSourceResults] = useState<SourceResult[]>([])
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null)
  // Re-ranking depends on the clock: freshness decays whether or not you touch
  // anything, so the list is recomputed on a slow tick rather than going stale.
  const [clock, setClock] = useState(() => Date.now())
  const inFlight = useRef<AbortController | null>(null)
  const contentRef = useRef<HTMLElement>(null)
  // When a fetch was last *attempted*, success or not, so a bridge that's
  // down is retried on the same schedule rather than every tick.
  const attemptedAt = useRef(0)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')

  useEffect(() => {
    try {
      store.write(state)
    } catch {
      setToast({ text: 'This device is out of storage — older jobs were dropped.', tone: 'bad' })
    }
  }, [state, store])

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // Coming back to the app is the moment a stale list matters most, so it
  // counts as a tick as well as a change of visibility.
  useEffect(() => {
    const onVisibility = () => {
      setVisible(document.visibilityState === 'visible')
      setClock(Date.now())
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // A new tab starts at its top, rather than wherever the last one was left.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [tab])

  const update = useCallback((change: Partial<AppState> | ((previous: AppState) => Partial<AppState>)) => {
    setState((previous) => ({ ...previous, ...(typeof change === 'function' ? change(previous) : change) }))
  }, [])

  const filtered = useMemo(
    () => filterJobs(state.jobs, state.criteria, new Date(clock)),
    [state.jobs, state.criteria, clock],
  )
  const ranked = useMemo(
    () => rankJobs(filtered.kept, state.profile, state.weights, new Date(clock)),
    [filtered.kept, state.profile, state.weights, clock],
  )
  const plan = useMemo(
    () =>
      planAutoApply({
        ranked,
        profile: state.profile,
        templates: state.templates,
        settings: state.autoApply,
        history: state.applications,
        now: new Date(clock),
      }),
    [ranked, state.profile, state.templates, state.autoApply, state.applications, clock],
  )

  const openJob = useMemo(() => ranked.find((entry) => entry.job.id === openJobId), [ranked, openJobId])
  const appliedIds = useMemo(
    () => new Set(state.applications.filter((entry) => entry.status !== 'skipped').map((entry) => entry.jobId)),
    [state.applications],
  )

  /**
   * Fetch everything. `silent` is for the automatic runs: they say nothing
   * unless something actually arrived or a source broke, because a toast
   * every ten minutes is just noise.
   */
  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
    const usable = liveSources(state.sources)
    if (usable.length === 0) {
      if (silent) return
      setToast({ text: 'No live source set up yet — set up the bridge, or paste jobs in Search.', tone: 'bad' })
      setTab('settings')
      return
    }
    attemptedAt.current = Date.now()
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setFetching(true)
    try {
      const outcome = await fetchAllSources(state.sources, state.criteria, {
        existing: state.jobs,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setSourceResults(outcome.results)
      const before = new Set(state.jobs.map((job) => job.id))
      const added = outcome.jobs.filter((job) => !before.has(job.id)).length
      update({ jobs: outcome.jobs, lastFetchedAt: new Date().toISOString() })
      const failed = outcome.results.filter((result) => result.error)
      if (failed.length) {
        setToast({ text: `${failed.length} source${failed.length > 1 ? 's' : ''} failed — see You → Sources.`, tone: 'bad' })
      } else if (added) {
        setToast({ text: `${added} new job${added === 1 ? '' : 's'}.`, tone: 'ok' })
      } else if (!silent) {
        setToast({ text: 'Nothing new since last time.', tone: 'ok' })
      }
    } finally {
      if (!controller.signal.aborted) setFetching(false)
    }
  },
    [state.sources, state.criteria, state.jobs, update],
  )

  /**
   * The automatic pull. Everything about whether it's due lives in
   * shouldAutoRefresh; this only adds "and we didn't just try", so a bridge
   * that's down is retried on the interval rather than on every tick.
   */
  useEffect(() => {
    const due = shouldAutoRefresh({
      sources: state.sources,
      lastFetchedAt: state.lastFetchedAt,
      everyMinutes: state.autoRefreshMinutes,
      fetching,
      visible,
      now: new Date(clock),
    })
    if (!due) return
    if (Date.now() - attemptedAt.current < state.autoRefreshMinutes * 60_000) return
    // Not while you're editing a source: a half-typed URL would fetch and
    // fail, and be reported as though something were wrong.
    if (tab === 'settings') return
    void refresh({ silent: true })
  }, [clock, visible, fetching, tab, state.sources, state.lastFetchedAt, state.autoRefreshMinutes, refresh])

  const addJobs = useCallback(
    (jobs: Job[]) => {
      update((previous) => ({ jobs: [...jobs, ...previous.jobs], lastFetchedAt: new Date().toISOString() }))
      setToast({ text: `Added ${jobs.length} job${jobs.length === 1 ? '' : 's'}.`, tone: 'ok' })
      setTab('jobs')
    },
    [update],
  )

  const saveApplication = useCallback(
    (application: Application) => {
      update((previous) => ({
        applications: [application, ...previous.applications.filter((entry) => entry.id !== application.id)].slice(
          0,
          MAX_APPLICATIONS,
        ),
      }))
    },
    [update],
  )

  /**
   * The manual send, and the reason the app is useful before any bridge
   * exists: the letter goes to the clipboard, Upwork's own apply page opens,
   * and the application is recorded as queued until you say it went.
   */
  const applyManually = useCallback(
    async (scored: ScoredJob, letter: string) => {
      const existing = state.applications.find((entry) => entry.jobId === scored.job.id && entry.status !== 'skipped')
      const application: Application = {
        ...(existing ?? draftApplication(scored, state.profile, state.templates)),
        letter,
        status: 'queued',
      }
      saveApplication(application)
      const copied = await copyToClipboard(letter)
      window.open(applyUrl(scored.job.url), '_blank', 'noopener,noreferrer')
      setToast({
        text: copied ? 'Letter copied — paste it into Upwork.' : "Couldn't copy; select the letter and copy it.",
        tone: copied ? 'ok' : 'bad',
      })
    },
    [state.applications, state.profile, state.templates, saveApplication],
  )

  const setApplicationStatus = useCallback(
    (id: string, status: Application['status'], reason?: string) => {
      update((previous) => ({
        applications: previous.applications.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status,
                reason,
                submittedAt: status === 'submitted' ? new Date().toISOString() : entry.submittedAt,
              }
            : entry,
        ),
      }))
    },
    [update],
  )

  /** Turns the plan into queued applications; nothing leaves the device here. */
  const runAutoApply = useCallback(() => {
    const drafted = applicationsFromPlan(plan, new Date())
    if (drafted.length === 0) {
      setToast({ text: plan.blocked ?? 'Nothing clears the bar right now.', tone: 'bad' })
      return
    }
    update((previous) => ({ applications: [...drafted, ...previous.applications].slice(0, MAX_APPLICATIONS) }))
    setToast({ text: `Queued ${drafted.length} application${drafted.length === 1 ? '' : 's'}.`, tone: 'ok' })
  }, [plan, update])

  /** Sends everything queued through the bridge, one at a time. */
  const sendQueued = useCallback(async () => {
    const queued = state.applications.filter((entry) => entry.status === 'queued')
    if (queued.length === 0) {
      setToast({ text: 'Nothing is queued.', tone: 'bad' })
      return
    }
    let sent = 0
    for (const application of queued) {
      try {
        const result = await submitApplication(application, state.autoApply)
        saveApplication(result)
        if (result.status === 'submitted') sent += 1
      } catch (error) {
        if (error instanceof NotConfiguredError) {
          setToast({ text: 'No bridge configured — send these from the queue by hand.', tone: 'bad' })
          return
        }
        saveApplication({ ...application, status: 'failed', reason: String(error) })
      }
    }
    setToast({
      text: sent === queued.length ? `Sent ${sent}.` : `Sent ${sent} of ${queued.length}; the rest are marked failed.`,
      tone: sent === queued.length ? 'ok' : 'bad',
    })
  }, [state.applications, state.autoApply, saveApplication])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ▲
          </span>
          <span className="brand-name">UpScout</span>
        </div>
        <button className="ghost" onClick={() => void refresh()} disabled={fetching}>
          {fetching ? 'Fetching…' : 'Refresh'}
        </button>
      </header>

      <nav className="rail" aria-label="Sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className={`rail-item${tab === entry.id ? ' is-active' : ''}`}
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? 'page' : undefined}
          >
            <span className="rail-icon" aria-hidden="true">
              {entry.icon}
            </span>
            <span className="rail-label">{entry.label}</span>
            {entry.id === 'auto' && plan.toApply.length > 0 ? <span className="rail-dot" /> : null}
          </button>
        ))}
      </nav>

      <main className="content" ref={contentRef}>
        {tab === 'jobs' && (
          <JobList
            ranked={ranked}
            filtered={filtered}
            appliedIds={appliedIds}
            lastFetchedAt={state.lastFetchedAt}
            fetching={fetching}
            criteria={state.criteria}
            onRefresh={() => void refresh()}
            now={new Date(clock)}
            onOpen={setOpenJobId}
            onEditCriteria={() => setTab('search')}
          />
        )}
        {tab === 'search' && (
          <CriteriaForm
            criteria={state.criteria}
            onChange={(criteria) => update({ criteria })}
            onPasteJobs={addJobs}
            dropped={filtered.reasons}
          />
        )}
        {tab === 'letters' && (
          <TemplateEditor
            templates={state.templates}
            profile={state.profile}
            sample={ranked[0]}
            onChange={(templates) => update({ templates })}
          />
        )}
        {tab === 'auto' && (
          <AutoApplyPanel
            settings={state.autoApply}
            plan={plan}
            applications={state.applications}
            onChange={(autoApply) => update({ autoApply })}
            onRun={runAutoApply}
            onSendQueued={sendQueued}
            onStatus={setApplicationStatus}
            onOpenJob={setOpenJobId}
          />
        )}
        {tab === 'settings' && (
          <SettingsPanel
            state={state}
            sourceResults={sourceResults}
            onChange={update}
            onReplaceState={setState}
            onNotify={(text, tone) => setToast({ text, tone })}
          />
        )}
      </main>

      {openJob && (
        <JobSheet
          scored={openJob}
          profile={state.profile}
          templates={state.templates}
          application={state.applications.find((entry) => entry.jobId === openJob.job.id)}
          onClose={() => setOpenJobId(null)}
          onApply={applyManually}
          onStatus={setApplicationStatus}
        />
      )}

      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}
