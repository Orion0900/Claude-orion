/**
 * The editor: the preview on top, a scrubber, and five tool panels below.
 * Every change goes straight into the project, re-plans the edit and shows
 * up in the preview on the next frame.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ensureFont } from '../captions/fonts'
import { outputSize } from '../lib/format'
import { formatClock } from '../lib/project'
import type { AudioAnalysis } from '../lib/types'
import { buildPlan } from '../render/plan'
import type { AppSettings } from '../services/settings'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { useProject } from '../hooks/useProject'
import { describeStep, useTranscription } from '../hooks/useTranscription'
import { getBlob } from '../store/db'
import { useToast } from './Controls'
import { ExportSheet } from './ExportSheet'
import {
  BackIcon,
  CaptionsIcon,
  FrameIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  RedoIcon,
  ScissorsIcon,
  SparklesIcon,
  UndoIcon,
} from './Icons'
import { AiPanel } from './panels/AiPanel'
import { CaptionsPanel } from './panels/CaptionsPanel'
import { EditPanel } from './panels/EditPanel'
import { FormatPanel } from './panels/FormatPanel'
import { MusicPanel } from './panels/MusicPanel'
import { Preview, type PlayerHandle } from './Preview'
import { Scrubber } from './Scrubber'

type Tab = 'captions' | 'edit' | 'ai' | 'format' | 'music'

const TABS: { id: Tab; label: string; Icon: typeof CaptionsIcon }[] = [
  { id: 'captions', label: 'Captions', Icon: CaptionsIcon },
  { id: 'edit', label: 'Edit', Icon: ScissorsIcon },
  { id: 'ai', label: 'AI', Icon: SparklesIcon },
  { id: 'format', label: 'Format', Icon: FrameIcon },
  { id: 'music', label: 'Music', Icon: MusicIcon },
]

interface Props {
  id: string
  settings: AppSettings
  onBack: () => void
  onOpenSettings: () => void
}

export function Editor({ id, settings, onBack, onOpenSettings }: Props) {
  const state = useProject(id)
  const { project, source, analysis, update, setAnalysis } = state
  const [tab, setTab] = useState<Tab>('captions')
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [redrawKey, setRedrawKey] = useState(0)
  const [musicBlob, setMusicBlob] = useState<Blob | null>(null)
  const [toast, showToast] = useToast()
  const player = useRef<PlayerHandle>(null)
  const sourceUrl = useObjectUrl(source)
  const musicUrl = useObjectUrl(project?.music ? musicBlob : null)

  const transcription = useTranscription(project, source, settings, update, setAnalysis)

  const plan = useMemo(() => (project ? buildPlan(project, analysis) : null), [project, analysis])
  const out = useMemo(
    () => (project ? outputSize(project.format.aspect, project.media, 1080) : { width: 1080, height: 1920 }),
    [project?.format.aspect, project?.media],
  )

  // Canvas can't wait for a webfont, so load the faces in use and redraw once they're in.
  const font = project?.style.font
  const weight = project?.style.weight
  useEffect(() => {
    if (!font || weight === undefined) return
    let live = true
    Promise.all([ensureFont(font, weight), ensureFont('montserrat', 800)])
      .catch(() => {})
      .then(() => {
        if (live) setRedrawKey((n) => n + 1)
      })
    return () => {
      live = false
    }
  }, [font, weight])

  const hasMusic = !!project?.music
  useEffect(() => {
    if (!hasMusic) {
      setMusicBlob(null)
      return
    }
    let live = true
    getBlob(id, 'music').then((blob) => {
      if (live) setMusicBlob(blob)
    })
    return () => {
      live = false
    }
  }, [id, hasMusic])

  const seek = useCallback((t: number) => {
    player.current?.seek(t)
    setTime(t)
  }, [])

  const togglePlay = useCallback(() => player.current?.toggle(), [])

  if (state.error) {
    return (
      <div className="screen">
        <div className="topbar">
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <BackIcon />
          </button>
          <h1>Can't open this project</h1>
          <span style={{ width: 44 }} />
        </div>
        <div className="error-card">{state.error}</div>
      </div>
    )
  }

  if (!project || !plan || !sourceUrl) {
    return (
      <div className="busy">
        <div className="spinner" />
      </div>
    )
  }

  const job = transcription.job
  const banner = job.kind === 'running' ? describeStep(job.step) : null

  return (
    <div className="editor">
      <header className="editor-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back to projects">
          <BackIcon />
        </button>
        <button className="icon-btn" onClick={state.undo} disabled={!state.canUndo} aria-label="Undo">
          <UndoIcon />
        </button>
        <button className="icon-btn" onClick={state.redo} disabled={!state.canRedo} aria-label="Redo">
          <RedoIcon />
        </button>
        <div className="title">{project.name}</div>
        <button
          className="btn primary export-btn"
          onClick={() => {
            player.current?.pause()
            setShowExport(true)
          }}
          disabled={plan.duration <= 0}
        >
          Export
        </button>
      </header>

      <Preview
        ref={player}
        sourceUrl={sourceUrl}
        plan={plan}
        out={out}
        music={project.music && musicUrl ? { url: musicUrl, volume: project.music.volume } : null}
        onTime={setTime}
        onPlayingChange={setPlaying}
        redrawKey={redrawKey}
      >
        {banner && (
          <div className="stage-banner" role="status">
            <div className="row">
              <strong>{banner.title}</strong>
              <button className="btn ghost small" onClick={transcription.cancel}>
                Stop
              </button>
            </div>
            <div className={`bar${banner.fraction === null ? ' indeterminate' : ''}`}>
              <i style={{ width: `${Math.round((banner.fraction ?? 0) * 100)}%` }} />
            </div>
            <small style={{ color: 'var(--dim)' }}>{banner.detail}</small>
          </div>
        )}
        {job.kind === 'stopped' && (
          <div className="stage-banner" role="status">
            <div className="row">
              <strong>Captions stopped</strong>
              <button className="btn small" onClick={transcription.start}>
                Start again
              </button>
            </div>
          </div>
        )}
        {job.kind === 'error' && (
          <div className="stage-banner" role="alert">
            <strong>Captions didn't work this time</strong>
            <small style={{ color: 'var(--dim)' }}>{job.message}</small>
            <div className="row">
              <button className="btn small" onClick={transcription.start}>
                Try again
              </button>
              <button className="btn ghost small" onClick={onOpenSettings}>
                Settings
              </button>
            </div>
          </div>
        )}
      </Preview>

      <div className="transport">
        <button className="play-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="time">
          <b>{formatClock(time)}</b> / {formatClock(plan.duration)}
        </div>
        <Scrubber
          plan={plan}
          analysis={analysis as AudioAnalysis | null}
          time={time}
          onSeek={seek}
          onScrub={(active) => {
            if (active) player.current?.pause()
          }}
        />
      </div>

      {/* Keyed by tab so each one opens at its top, not where the last was scrolled to. */}
      <section key={tab} className="panel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === 'captions' && <CaptionsPanel project={project} update={update} />}
        {tab === 'edit' && (
          <EditPanel
            project={project}
            plan={plan}
            analysis={analysis}
            update={update}
            time={time}
            playing={playing}
            seek={seek}
            settings={settings}
            transcribing={job.kind === 'running'}
            onRetranscribe={() => {
              transcription.allowStart()
              update((p) => ({ ...p, words: [], translation: null, transcript: { status: 'none', language: null, model: null } }))
            }}
            showToast={showToast}
          />
        )}
        {tab === 'ai' && (
          <AiPanel
            project={project}
            plan={plan}
            update={update}
            seek={seek}
            showToast={showToast}
            onOpenSettings={onOpenSettings}
          />
        )}
        {tab === 'format' && <FormatPanel project={project} update={update} />}
        {tab === 'music' && <MusicPanel project={project} update={update} onMusic={setMusicBlob} showToast={showToast} />}
      </section>

      <nav className="tabs" role="tablist">
        {TABS.map(({ id: tabId, label, Icon }) => (
          <button
            key={tabId}
            className="tab"
            role="tab"
            aria-selected={tab === tabId}
            onClick={() => setTab(tabId)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      {showExport && source && (
        <ExportSheet
          project={project}
          plan={plan}
          source={source}
          music={musicBlob}
          settings={settings}
          onClose={() => setShowExport(false)}
        />
      )}
      {state.saveError && <div className="toast">Changes aren't saving — the phone may be out of space.</div>}
      {toast}
    </div>
  )
}
