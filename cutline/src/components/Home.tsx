/** Projects, and the two ways to start one: a video from Photos, or recording with the teleprompter. */
import { useEffect, useRef, useState } from 'react'
import { presetStyle } from '../captions/presets'
import { formatClock, normalizeProject } from '../lib/project'
import type { Project } from '../lib/types'
import { deleteProject, listProjects, saveProject } from '../store/db'
import { Sheet } from './Controls'
import { CameraIcon, CloseIcon, EditIcon, FilmIcon, GearIcon, MoreIcon, TrashIcon } from './Icons'

interface Props {
  onOpen: (id: string) => void
  onImport: (file: File) => void
  onRecord: () => void
  onSettings: () => void
}

export function Home({ onOpen, onImport, onRecord, onSettings }: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [menu, setMenu] = useState<Project | null>(null)
  const [renaming, setRenaming] = useState<Project | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const refresh = () =>
    listProjects()
      .then((raw) => {
        const fallback = presetStyle('bold')
        const list = raw.map((r) => normalizeProject(r, fallback)).filter((p): p is Project => p !== null)
        list.sort((a, b) => b.updatedAt - a.updatedAt)
        setProjects(list)
      })
      .catch((e: unknown) => {
        setProjects([])
        setLoadError(e instanceof Error ? e.message : String(e))
      })

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="screen">
      <header className="home-head">
        <div className="wordmark" aria-label="Cutline">
          Cut<span>line</span>
        </div>
        <button className="icon-btn" onClick={onSettings} aria-label="Settings">
          <GearIcon />
        </button>
      </header>

      <section className="hero">
        <h2>
          Talk to camera.
          <br />
          <em>We'll do the rest.</em>
        </h2>
        <p>Animated captions, pauses and ums cut, punch-in zooms — all on your phone.</p>
        <div className="hero-actions">
          <button className="action-tile" onClick={() => input.current?.click()}>
            <span className="tile-icon">
              <FilmIcon />
            </span>
            <strong>Import video</strong>
            <small>From Photos or Files</small>
          </button>
          <button className="action-tile record" onClick={onRecord}>
            <span className="tile-icon">
              <CameraIcon />
            </span>
            <strong>Record</strong>
            <small>With a teleprompter</small>
          </button>
        </div>
        <div className="features">
          <span>Word-by-word captions</span>
          <span>AI Edit</span>
          <span>Auto zoom</span>
          <span>Hooks</span>
          <span>Translate</span>
        </div>
        <input
          ref={input}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onImport(file)
          }}
        />
      </section>

      <InstallHint />

      <div className="section-title">
        <span>Projects</span>
        {projects && projects.length > 0 && <span>{projects.length}</span>}
      </div>
      {loadError && <div className="error-card">{loadError}</div>}
      {projects && projects.length === 0 && !loadError && (
        <div className="empty-note">Your edits will show up here. Everything stays on this phone.</div>
      )}
      <div className="projects">
        {projects?.map((p) => (
          <div key={p.id} style={{ position: 'relative' }}>
            <button className="project-card" style={{ width: '100%' }} onClick={() => onOpen(p.id)}>
              <div className="thumb" style={p.thumbnail ? { backgroundImage: `url(${p.thumbnail})` } : undefined}>
                <span className="duration">{formatClock(p.media.duration)}</span>
              </div>
              <div className="meta">
                <strong>{p.name}</strong>
                <small>{relativeDate(p.updatedAt)}</small>
              </div>
            </button>
            <button className="more" onClick={() => setMenu(p)} aria-label={`More for ${p.name}`}>
              <MoreIcon />
            </button>
          </div>
        ))}
      </div>

      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <div className="actions">
            <button
              className="btn block"
              onClick={() => {
                setRenaming(menu)
                setMenu(null)
              }}
            >
              <EditIcon /> Rename
            </button>
            <button
              className="btn danger block"
              onClick={async () => {
                const id = menu.id
                setMenu(null)
                await deleteProject(id).catch(() => {})
                void refresh()
              }}
            >
              <TrashIcon /> Delete project and its video
            </button>
          </div>
        </Sheet>
      )}
      {renaming && (
        <RenameSheet
          project={renaming}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            await saveProject({ ...renaming, name, updatedAt: Date.now() }).catch(() => {})
            setRenaming(null)
            void refresh()
          }}
        />
      )}
    </div>
  )
}

/** In Safari (not yet on the Home Screen), a one-line nudge to install, dismissible for good. */
function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      const standalone =
        (navigator as Navigator & { standalone?: boolean }).standalone === true ||
        matchMedia('(display-mode: standalone)').matches
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
      return standalone || !ios || localStorage.getItem('cutline.installHint') === 'hidden'
    } catch {
      return true
    }
  })
  if (hidden) return null
  return (
    <div className="install-hint">
      <span>
        Add Cutline to your Home Screen: tap <b>Share</b>, then <b>Add to Home Screen</b>.
      </span>
      <button
        className="icon-btn"
        aria-label="Dismiss"
        onClick={() => {
          setHidden(true)
          try {
            localStorage.setItem('cutline.installHint', 'hidden')
          } catch {
            // It'll just show again next time.
          }
        }}
      >
        <CloseIcon />
      </button>
    </div>
  )
}

function RenameSheet({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(project.name)
  return (
    <Sheet title="Rename" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSave(name.trim().slice(0, 60))
        }}
      >
        <input className="field" value={name} autoFocus onChange={(e) => setName(e.target.value)} aria-label="Project name" />
        <div className="actions">
          <button className="btn primary block" type="submit" disabled={!name.trim()}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}

function relativeDate(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
