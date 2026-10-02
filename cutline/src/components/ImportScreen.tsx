/** The short wait between picking a video and the editor: reading it and keeping a copy on the phone. */
import { useEffect, useRef, useState } from 'react'
import { importVideo } from '../services/pipeline'
import type { AppSettings } from '../services/settings'

interface Props {
  file: Blob
  fileName: string
  settings: AppSettings
  onDone: (projectId: string) => void
  onCancel: () => void
}

export function ImportScreen({ file, fileName, settings, onDone, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // Strict mode runs effects twice in development; one import is enough.
    if (started.current) return
    started.current = true
    importVideo(file, fileName, settings).then(
      (project) => onDone(project.id),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [file, fileName, settings, onDone])

  if (error) {
    return (
      <div className="screen">
        <div className="busy">
          <h2>That video didn't open</h2>
          <div className="error-card" style={{ maxWidth: 360 }}>
            {error}
          </div>
          <button className="btn" onClick={onCancel}>
            Back
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="screen">
      <div className="busy">
        <div className="spinner" />
        <h2>Opening your video</h2>
        <p>Keeping a copy on this phone so it's here next time.</p>
      </div>
    </div>
  )
}
