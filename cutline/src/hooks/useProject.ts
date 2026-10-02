/**
 * The project open in the editor: loaded from storage, saved back a moment
 * after every change, with undo and redo.
 *
 * Slider drags fire dozens of changes a second; changes that share a
 * `group` within a short window collapse into one undo step, so undo goes
 * back to before the drag rather than one pixel at a time.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { presetStyle } from '../captions/presets'
import { normalizeProject } from '../lib/project'
import type { AudioAnalysis, Project } from '../lib/types'
import { getAnalysis, getBlob, getProject, saveProject } from '../store/db'

export interface UpdateOptions {
  /** Leave this change out of undo history (e.g. transcription arriving). */
  history?: boolean
  /** Changes in the same group close together become one undo step. */
  group?: string
}

export interface ProjectState {
  project: Project | null
  source: Blob | null
  analysis: AudioAnalysis | null
  error: string | null
  saveError: boolean
  update: (recipe: (p: Project) => Project, options?: UpdateOptions) => void
  setAnalysis: (analysis: AudioAnalysis | null) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

const HISTORY_LIMIT = 80
const GROUP_WINDOW = 700
const SAVE_DELAY = 400

export function useProject(id: string): ProjectState {
  const [project, setProject] = useState<Project | null>(null)
  const [source, setSource] = useState<Blob | null>(null)
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [, bump] = useState(0)

  const current = useRef<Project | null>(null)
  const past = useRef<Project[]>([])
  const future = useRef<Project[]>([])
  const lastGroup = useRef<{ key: string; at: number } | null>(null)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [raw, blob, stored] = await Promise.all([getProject(id), getBlob(id, 'source'), getAnalysis(id)])
        if (cancelled) return
        const loaded = normalizeProject(raw, presetStyle('bold'))
        if (!loaded) throw new Error('This project could not be found.')
        if (!blob) throw new Error("This project's video is missing from the phone's storage.")
        current.current = loaded
        setProject(loaded)
        setSource(blob)
        setAnalysis(stored)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const p = current.current
    if (!p) return
    saveProject(p).then(
      () => setSaveError(false),
      () => setSaveError(true),
    )
  }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(flush, SAVE_DELAY)
  }, [flush])

  // Leaving the editor or backgrounding the app saves straight away.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      if (saveTimer.current !== null) flush()
    }
  }, [flush])

  const commit = useCallback(
    (next: Project) => {
      current.current = next
      setProject(next)
      scheduleSave()
    },
    [scheduleSave],
  )

  const update = useCallback(
    (recipe: (p: Project) => Project, options: UpdateOptions = {}) => {
      const prev = current.current
      if (!prev) return
      const next = recipe(prev)
      if (next === prev) return
      if (options.history !== false) {
        const now = Date.now()
        const group = options.group
        const coalesce = group && lastGroup.current?.key === group && now - lastGroup.current.at < GROUP_WINDOW
        if (!coalesce) {
          past.current.push(prev)
          if (past.current.length > HISTORY_LIMIT) past.current.shift()
        }
        lastGroup.current = group ? { key: group, at: now } : null
        future.current = []
      }
      commit({ ...next, updatedAt: Date.now() })
    },
    [commit],
  )

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev || !current.current) return
    future.current.push(current.current)
    lastGroup.current = null
    commit({ ...prev, updatedAt: Date.now() })
    bump((n) => n + 1)
  }, [commit])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next || !current.current) return
    past.current.push(current.current)
    lastGroup.current = null
    commit({ ...next, updatedAt: Date.now() })
    bump((n) => n + 1)
  }, [commit])

  return {
    project,
    source,
    analysis,
    error,
    saveError,
    update,
    setAnalysis,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
