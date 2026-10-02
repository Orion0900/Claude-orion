/**
 * Export: render every frame of the edit with its captions into a new video,
 * then hand it to the share sheet — Save Video puts it in Photos, or straight
 * to TikTok, Instagram or AirDrop.
 */
import { useEffect, useRef, useState } from 'react'
import { ensureFont } from '../captions/fonts'
import { outputSize } from '../lib/format'
import { formatBytes, formatClock } from '../lib/project'
import { toSrt } from '../lib/subtitles'
import type { Project } from '../lib/types'
import { decodeAudio } from '../media/audio'
import { exportVideo, prepareExport, type ExportResult } from '../media/export'
import { shareOrDownload } from '../media/share'
import { drawFrame, newScratch } from '../render/compose'
import type { RenderPlan } from '../render/plan'
import type { AppSettings } from '../services/settings'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { releaseModel } from '../transcribe/client'
import { Segmented, Sheet } from './Controls'
import { CaptionsIcon, DownloadIcon, ShareIcon } from './Icons'

interface Props {
  project: Project
  plan: RenderPlan
  source: Blob
  music: Blob | null
  settings: AppSettings
  onClose: () => void
}

type Phase =
  | { kind: 'setup' }
  | { kind: 'running'; fraction: number; started: number }
  | { kind: 'done'; result: ExportResult; seconds: number }
  | { kind: 'error'; message: string }

export function ExportSheet({ project, plan, source, music, settings, onClose }: Props) {
  const [shortSide, setShortSide] = useState<720 | 1080>(settings.exportShortSide)
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const controller = useRef<AbortController | null>(null)
  const resultUrl = useObjectUrl(phase.kind === 'done' ? phase.result.blob : null)
  const out = outputSize(project.format.aspect, project.media, shortSide)
  const baseName = safeName(project.name)

  useEffect(() => () => controller.current?.abort(), [])

  const start = async () => {
    // Where the export has to record in real time it needs an audio context,
    // which iOS only starts during a tap: so this comes before any await.
    prepareExport()
    const ac = new AbortController()
    controller.current = ac
    const started = performance.now()
    setPhase({ kind: 'running', fraction: 0, started })
    let wakeLock: { release: () => Promise<void> } | null = null
    try {
      // Keep the screen on: a phone that locks mid-export suspends it.
      wakeLock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
        ?.request('screen')
        .catch(() => null) ?? null
      // The speech model holds a few hundred MB; an export needs that memory more.
      if (project.transcript.status !== 'running') releaseModel()
      const text = plan.pages.map((p) => p.words.map((w) => w.text).join(' ')).join(' ')
      await Promise.all([ensureFont(project.style.font, project.style.weight, text), ensureFont('montserrat', 800, project.hook.text)]).catch(
        () => {},
      )
      const musicAudio = project.music && music ? await decodeAudio(music, { signal: ac.signal }).catch(() => null) : null
      const scratch = newScratch()
      const result = await exportVideo({
        source,
        ranges: plan.map.ranges,
        width: out.width,
        height: out.height,
        fps: 30,
        decodeSize: decodeSize(project, out),
        draw: (ctx, frame, frameSize, t) => drawFrame(ctx, frame, frameSize, t, plan, out, scratch),
        music: musicAudio && project.music ? { audio: musicAudio, volume: project.music.volume, ducking: project.music.ducking } : undefined,
        onProgress: (fraction) => setPhase((p) => (p.kind === 'running' ? { ...p, fraction } : p)),
        signal: ac.signal,
      })
      setPhase({ kind: 'done', result, seconds: (performance.now() - started) / 1000 })
    } catch (error) {
      if (ac.signal.aborted) setPhase({ kind: 'setup' })
      else setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      void wakeLock?.release().catch(() => {})
      if (controller.current === ac) controller.current = null
    }
  }

  const close = () => {
    controller.current?.abort()
    onClose()
  }

  return (
    <Sheet title={phase.kind === 'done' ? 'Ready to post' : 'Export'} onClose={phase.kind === 'running' ? () => {} : close}>
      {phase.kind === 'setup' && (
        <>
          <Segmented
            label="Resolution"
            value={shortSide}
            onChange={setShortSide}
            options={[
              { value: 1080, label: '1080p · best' },
              { value: 720, label: '720p · faster' },
            ]}
          />
          <p className="hint">
            {out.width}×{out.height}, {formatClock(plan.duration)} long, captions burned in. Keep Cutline open while it
            renders.
          </p>
          <div className="actions">
            <button className="btn primary block" onClick={start} disabled={plan.duration <= 0}>
              Export video
            </button>
            <SrtButton project={project} plan={plan} baseName={baseName} />
          </div>
        </>
      )}

      {phase.kind === 'running' && (
        <div style={{ display: 'grid', gap: 14, padding: '8px 0' }}>
          <div className="bar">
            <i style={{ width: `${Math.round(phase.fraction * 100)}%` }} />
          </div>
          <div className="row" style={{ minHeight: 0 }}>
            <strong style={{ flex: 1 }}>{Math.round(phase.fraction * 100)}%</strong>
            <span className="hint" style={{ margin: 0 }}>
              {eta(phase.fraction, phase.started)}
            </span>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            Rendering every frame on your phone. Leaving the app pauses it.
          </p>
          <button className="btn block" onClick={() => controller.current?.abort()}>
            Cancel
          </button>
        </div>
      )}

      {phase.kind === 'done' && resultUrl && (
        <>
          <video className="result-video" src={resultUrl} controls playsInline />
          <p className="hint">
            {formatBytes(phase.result.blob.size)} · {phase.result.extension.toUpperCase()} · made in{' '}
            {Math.max(1, Math.round(phase.seconds))} s
          </p>
          <div className="actions">
            <button
              className="btn primary block"
              onClick={() => void shareOrDownload(phase.result.blob, `${baseName}.${phase.result.extension}`, project.name)}
            >
              <ShareIcon /> Save or share
            </button>
            <SrtButton project={project} plan={plan} baseName={baseName} />
            <button className="btn ghost block" onClick={close}>
              Done
            </button>
          </div>
          <p className="hint">In the share sheet, “Save Video” puts it in Photos.</p>
        </>
      )}

      {phase.kind === 'error' && (
        <>
          <div className="error-card">{phase.message}</div>
          <div className="actions">
            <button className="btn primary block" onClick={start}>
              Try again
            </button>
            <button className="btn ghost block" onClick={close}>
              Close
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function SrtButton({ project, plan, baseName }: { project: Project; plan: RenderPlan; baseName: string }) {
  const disabled = plan.pages.length === 0
  return (
    <button
      className="btn block"
      disabled={disabled}
      onClick={() => {
        const blob = new Blob([toSrt(plan.pages)], { type: 'application/x-subrip' })
        void shareOrDownload(blob, `${baseName}.srt`, `${project.name} captions`)
      }}
    >
      {disabled ? <CaptionsIcon /> : <DownloadIcon />} Captions file (.srt)
    </button>
  )
}

/** The biggest source frame worth decoding: enough for the frame at its most zoomed in, never more than the source. */
function decodeSize(project: Project, out: { width: number; height: number }) {
  const { media, format } = project
  if (!(media.width > 0 && media.height > 0)) return undefined
  const cover = Math.max(out.width / media.width, out.height / media.height)
  const contain = Math.min(out.width / media.width, out.height / media.height)
  const scale =
    (format.fit === 'fill' ? cover : contain) * Math.max(1, format.zoom) * (1 + (format.autoZoom ? format.zoomStrength : 0))
  return {
    width: Math.min(media.width, Math.ceil(media.width * scale)),
    height: Math.min(media.height, Math.ceil(media.height * scale)),
  }
}

function eta(fraction: number, started: number): string {
  if (fraction < 0.04) return 'Starting…'
  const elapsed = (performance.now() - started) / 1000
  const left = Math.max(0, (elapsed / fraction) * (1 - fraction))
  return left < 60 ? `About ${Math.max(1, Math.round(left))} s left` : `About ${Math.round(left / 60)} min left`
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Cutline video'
}
