/**
 * Runs a project's transcription while the editor is open: decode the audio,
 * fetch the speech model the first time, transcribe, and drop the words into
 * the project. The video is watchable and editable the whole time.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioAnalysis, Project } from '../lib/types'
import { isAbort, transcribeProject, type PrepareStep } from '../services/pipeline'
import type { AppSettings } from '../services/settings'
import type { UpdateOptions } from './useProject'

export type JobState =
  | { kind: 'idle' }
  | { kind: 'running'; step: PrepareStep }
  | { kind: 'stopped' }
  | { kind: 'error'; message: string }

export function useTranscription(
  project: Project | null,
  source: Blob | null,
  settings: Pick<AppSettings, 'model' | 'language'>,
  update: (recipe: (p: Project) => Project, options?: UpdateOptions) => void,
  setAnalysis: (a: AudioAnalysis | null) => void,
) {
  const [job, setJob] = useState<JobState>({ kind: 'idle' })
  const controller = useRef<AbortController | null>(null)
  // Set when the person taps Stop, so the auto-start below doesn't simply
  // begin again the moment the cancelled job hands the project back.
  const stopped = useRef(false)
  const status = project?.transcript.status
  const projectRef = useRef(project)
  projectRef.current = project
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const start = useCallback(() => {
    const p = projectRef.current
    if (!p || !source || controller.current) return
    stopped.current = false
    const ac = new AbortController()
    controller.current = ac
    setJob({ kind: 'running', step: { step: 'audio', fraction: 0 } })
    update((q) => ({ ...q, transcript: { ...q.transcript, status: 'running', error: undefined } }), { history: false })
    transcribeProject(p, source, settingsRef.current, (step) => setJob({ kind: 'running', step }), ac.signal)
      .then((result) => {
        setAnalysis(result.analysis)
        update(
          (q) => ({
            ...q,
            words: result.words,
            translation: null,
            transcript: { status: 'done', language: result.language ?? settingsRef.current.language, model: result.model },
          }),
          { history: false },
        )
        setJob({ kind: 'idle' })
      })
      .catch((error: unknown) => {
        if (isAbort(error)) {
          update((q) => ({ ...q, transcript: { ...q.transcript, status: 'none' } }), { history: false })
          setJob(stopped.current ? { kind: 'stopped' } : { kind: 'idle' })
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        update((q) => ({ ...q, transcript: { ...q.transcript, status: 'error', error: message } }), { history: false })
        setJob({ kind: 'error', message })
      })
      .finally(() => {
        if (controller.current === ac) controller.current = null
      })
  }, [source, update, setAnalysis])

  const cancel = useCallback(() => {
    stopped.current = true
    controller.current?.abort()
  }, [])

  /** Let an untranscribed project start on its own again, e.g. after "Transcribe again". */
  const allowStart = useCallback(() => {
    stopped.current = false
  }, [])

  // A project that has never been transcribed starts as soon as it opens.
  useEffect(() => {
    if (status === 'none' && project?.media.hasAudio && source && !controller.current && !stopped.current) start()
  }, [status, project?.media.hasAudio, source, start])

  useEffect(() => () => controller.current?.abort(), [])

  return { job, start, cancel, allowStart }
}

/** What the transcription banner says. */
export function describeStep(step: PrepareStep): { title: string; detail: string; fraction: number | null } {
  switch (step.step) {
    case 'audio':
      return { title: 'Listening to your video', detail: 'Reading the audio track', fraction: step.fraction > 0 ? step.fraction : null }
    case 'model': {
      const mb = (n: number) => Math.round(n / 1024 / 1024)
      return {
        title: 'Getting the speech model',
        detail:
          step.total > 0
            ? `${mb(step.loaded)} of ${mb(step.total)} MB · only the first time`
            : 'Only the first time · then it works offline',
        fraction: step.total > 0 ? step.loaded / step.total : null,
      }
    }
    case 'loading-model':
      return { title: 'Warming up', detail: 'Loading the speech model', fraction: null }
    case 'transcribe':
      return {
        title: 'Writing your captions',
        detail: `${Math.round(step.done)} of ${Math.round(step.total)} seconds`,
        fraction: step.total > 0 ? step.done / step.total : null,
      }
  }
}
