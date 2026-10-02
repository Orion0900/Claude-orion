/** Background music: a track from Files, its level, and ducking under your voice. */
import { useRef, useState } from 'react'
import type { Project } from '../../lib/types'
import type { UpdateOptions } from '../../hooks/useProject'
import { deleteFile, putFile } from '../../store/db'
import { SliderRow, ToggleRow } from '../Controls'
import { MusicIcon, TrashIcon } from '../Icons'

interface Props {
  project: Project
  update: (recipe: (p: Project) => Project, options?: UpdateOptions) => void
  onMusic: (blob: Blob | null) => void
  showToast: (message: string) => void
}

export function MusicPanel({ project, update, onMusic, showToast }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const music = project.music

  const pick = async (file: File) => {
    setBusy(true)
    try {
      await putFile(project.id, 'music', file)
      onMusic(file)
      const name = file.name.replace(/\.[a-z0-9]{2,4}$/i, '') || 'Music'
      update((p) => ({ ...p, music: { name, volume: p.music?.volume ?? 0.25, ducking: p.music?.ducking ?? true } }))
    } catch {
      showToast("Couldn't add that track — the phone may be out of space.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="group">
        <h3>Music</h3>
        {music ? (
          <>
            <div className="row">
              <span className="ai-icon" style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent-hi)' }}>
                <MusicIcon width={22} height={22} />
              </span>
              <div className="label">
                <strong>{music.name}</strong>
                <small>Loops to the length of the video</small>
              </div>
              <button
                className="icon-btn"
                aria-label="Remove music"
                onClick={async () => {
                  await deleteFile(project.id, 'music').catch(() => {})
                  onMusic(null)
                  update((p) => ({ ...p, music: null }))
                }}
              >
                <TrashIcon />
              </button>
            </div>
            <SliderRow
              label="Volume"
              value={music.volume}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => update((p) => (p.music ? { ...p, music: { ...p.music, volume: v } } : p), { group: 'music-volume' })}
            />
            <ToggleRow
              title="Duck under speech"
              detail="Music dips while you talk (in the exported video)"
              checked={music.ducking}
              onChange={(v) => update((p) => (p.music ? { ...p, music: { ...p.music, ducking: v } } : p))}
            />
            <button className="btn small" style={{ marginTop: 8 }} onClick={() => input.current?.click()} disabled={busy}>
              Replace track
            </button>
          </>
        ) : (
          <>
            <p className="hint" style={{ marginBottom: 12 }}>
              Add a song or beat from the Files app. Use music you have the rights to — platforms mute tracks they
              recognise.
            </p>
            <button className="btn primary" onClick={() => input.current?.click()} disabled={busy}>
              <MusicIcon /> {busy ? 'Adding…' : 'Add music'}
            </button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.wav"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void pick(file)
          }}
        />
      </div>
    </>
  )
}
