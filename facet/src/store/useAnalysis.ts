import { useCallback, useEffect, useState } from 'react'
import { saveAnalysis } from './analysis'
import { getAnalysis, getPhoto, listAnalyses, photoKey, type StoredAnalysis } from './db'

/** An object URL for a stored photo, revoked when no longer shown. */
export function usePhotoUrl(key: string | null, version = 0): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!key) {
      setUrl(null)
      return
    }
    let alive = true
    let made: string | null = null
    getPhoto(key).then((blob) => {
      if (!alive || !blob) return
      made = URL.createObjectURL(blob)
      setUrl(made)
    })
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [key, version])
  return url
}

/** One stored analysis: `undefined` while loading, `null` if it doesn't exist. */
export function useAnalysis(id: string) {
  const [analysis, setAnalysis] = useState<StoredAnalysis | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    setAnalysis(undefined)
    getAnalysis(id).then((a) => alive && setAnalysis(a ?? null))
    return () => {
      alive = false
    }
  }, [id])
  const frontUrl = usePhotoUrl(analysis ? photoKey(id, 'front') : null)
  // The profile photo can be replaced, so its URL follows when it was attached.
  const profileUrl = usePhotoUrl(analysis?.profile ? photoKey(id, 'profile') : null, analysis?.profile?.attachedAt)
  const save = useCallback(async (next: StoredAnalysis) => {
    setAnalysis(next)
    const saved = await saveAnalysis(next)
    setAnalysis(saved)
    return saved
  }, [])
  return { analysis, frontUrl, profileUrl, save, setAnalysis }
}

export function useAnalyses() {
  const [list, setList] = useState<StoredAnalysis[] | null>(null)
  const reload = useCallback(() => {
    listAnalyses()
      .then(setList)
      .catch(() => setList([]))
  }, [])
  useEffect(reload, [reload])
  return { list, reload }
}
