/**
 * AI tools. The on-device ones work for everyone; the Claude ones appear
 * once an API key is added in Settings, and send only the transcript text.
 */
import { useEffect, useRef, useState } from 'react'
import { AiError } from '../../ai/claude'
import { hasAi, loadAiSettings } from '../../ai/settings'
import { findClips, fixTranscript, pickHighlights, translateSentences, writeHook } from '../../ai/tasks'
import { suggestEmojis, suggestEmphasis } from '../../lib/emoji'
import { formatClock } from '../../lib/project'
import { sentences } from '../../lib/timeline'
import type { Project, Word } from '../../lib/types'
import type { RenderPlan } from '../../render/plan'
import type { UpdateOptions } from '../../hooks/useProject'
import { Sheet } from '../Controls'
import { ClipIcon, CopyIcon, GlobeIcon, KeyIcon, MegaphoneIcon, SmileIcon, SparklesIcon, SpellIcon, TrashIcon } from '../Icons'

interface Props {
  project: Project
  plan: RenderPlan
  update: (recipe: (p: Project) => Project, options?: UpdateOptions) => void
  seek: (t: number) => void
  showToast: (message: string) => void
  onOpenSettings: () => void
}

type Task = 'highlights' | 'hook' | 'translate' | 'clips' | 'fix'

type Result =
  | { kind: 'hook'; hooks: string[]; caption: string; hashtags: string[] }
  | { kind: 'clips'; clips: { title: string; reason: string; firstWordId: string; lastWordId: string }[] }
  | { kind: 'translate' }
  | { kind: 'fix' }

const CONTEXT_KEY = 'cutline.fixContext'

function loadContext(): string {
  try {
    return localStorage.getItem(CONTEXT_KEY) ?? ''
  } catch {
    return ''
  }
}

const TARGET_LANGUAGES = [
  'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Polish', 'Turkish', 'Russian', 'Ukrainian',
  'Arabic', 'Hindi', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Vietnamese', 'Indonesian', 'English',
]

export function AiPanel({ project, update, seek, plan, showToast, onOpenSettings }: Props) {
  const [ai] = useState(loadAiSettings)
  const [running, setRunning] = useState<Task | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const controller = useRef<AbortController | null>(null)
  const words = project.words
  const kept = words.filter((w) => !w.removed)
  const ready = kept.length > 0
  const connected = hasAi(ai)

  useEffect(() => () => controller.current?.abort(), [])

  const run = async (task: Task, job: (signal: AbortSignal) => Promise<void>) => {
    controller.current?.abort()
    const ac = new AbortController()
    controller.current = ac
    setRunning(task)
    try {
      await job(ac.signal)
    } catch (error) {
      if (ac.signal.aborted) return
      showToast(error instanceof AiError || error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      if (controller.current === ac) {
        controller.current = null
        setRunning(null)
      }
    }
  }

  const localHighlights = () => {
    const emphasis = suggestEmphasis(words)
    const emojis = suggestEmojis(words)
    update((p) => ({
      ...p,
      style: { ...p.style, emojis: true },
      words: p.words.map((w) => {
        const next: Word = { ...w }
        delete next.emoji
        delete next.emphasis
        if (emphasis.has(w.id)) next.emphasis = true
        const e = emojis.get(w.id)
        if (e) next.emoji = e
        return next
      }),
    }))
    showToast(`${emphasis.size} keywords and ${emojis.size} emojis added`)
  }

  const clearHighlights = () => {
    update((p) => ({
      ...p,
      words: p.words.map((w) => {
        if (!w.emoji && !w.emphasis) return w
        const next: Word = { ...w }
        delete next.emoji
        delete next.emphasis
        return next
      }),
    }))
    showToast('Emojis and keywords cleared')
  }

  const claudeHighlights = () =>
    run('highlights', async (signal) => {
      const r = await pickHighlights(ai, words, signal)
      const emphasis = new Set(r.emphasis)
      const emojis = new Map(r.emojis.map((e) => [e.wordId, e.emoji]))
      update((p) => ({
        ...p,
        style: { ...p.style, emojis: true },
        words: p.words.map((w) => {
          const next: Word = { ...w }
          delete next.emoji
          delete next.emphasis
          if (emphasis.has(w.id)) next.emphasis = true
          const e = emojis.get(w.id)
          if (e) next.emoji = e
          return next
        }),
      }))
      showToast(`Claude picked ${emphasis.size} keywords and ${emojis.size} emojis`)
    })

  const hook = () =>
    run('hook', async (signal) => {
      const r = await writeHook(ai, words, signal)
      setResult({ kind: 'hook', ...r })
    })

  const clips = () =>
    run('clips', async (signal) => {
      const r = await findClips(ai, words, { min: 20, max: 60 }, signal)
      if (r.length === 0) showToast('No stand-alone clip found in this one')
      else setResult({ kind: 'clips', clips: r })
    })

  const fix = (context: string) =>
    run('fix', async (signal) => {
      setResult(null)
      const r = await fixTranscript(ai, words, context, signal)
      const changes = new Map(r.map((c) => [c.wordId, c.text]))
      if (changes.size === 0) {
        showToast('The transcript looks right already')
        return
      }
      update((p) => ({ ...p, words: p.words.map((w) => (changes.has(w.id) ? { ...w, text: changes.get(w.id)! } : w)) }))
      showToast(`Fixed ${changes.size} ${changes.size === 1 ? 'word' : 'words'}`)
    })

  const translate = (language: string) =>
    run('translate', async (signal) => {
      setResult(null)
      const list = sentences(words.filter((w) => !w.removed))
      const r = await translateSentences(
        ai,
        list.map((s, i) => ({ id: String(i), text: s.text })),
        language,
        signal,
      )
      const byId = new Map(r.map((x) => [x.id, x.text]))
      update((p) => ({
        ...p,
        translation: {
          language,
          sentences: list.flatMap((s, i) =>
            byId.has(String(i)) ? [{ firstWordId: s.firstWordId, lastWordId: s.lastWordId, text: byId.get(String(i))! }] : [],
          ),
        },
      }))
      showToast(`Captions now in ${language}`)
    })

  const busy = (task: Task) => running === task

  return (
    <>
      <div className="group">
        <h3>On this phone · free</h3>
        <AiCard
          icon={<SmileIcon />}
          title="Emojis & keywords"
          detail="Colour the words that matter and add emojis that fit"
          disabled={!ready}
          onClick={localHighlights}
        />
        <AiCard
          icon={<TrashIcon />}
          title="Clear emojis & keywords"
          detail="Back to plain captions"
          disabled={!words.some((w) => w.emoji || w.emphasis)}
          onClick={clearHighlights}
        />
      </div>

      <div className="group">
        <h3>With Claude</h3>
        {!connected ? (
          <>
            <p className="hint" style={{ marginBottom: 12 }}>
              Add your Anthropic API key in Settings to write hooks, find the best clips, translate captions and fix
              misheard words. Only the transcript text is sent — never the video.
            </p>
            <button className="btn" onClick={onOpenSettings}>
              <KeyIcon /> Add API key
            </button>
          </>
        ) : (
          <>
            <AiCard
              icon={<SparklesIcon />}
              title="Smart highlights"
              detail="Claude picks the keywords and emojis an editor would"
              busy={busy('highlights')}
              disabled={!ready || !!running}
              onClick={claudeHighlights}
            />
            <AiCard
              icon={<MegaphoneIcon />}
              title="Hook, caption & hashtags"
              detail="Scroll-stopping title ideas and a ready-to-post caption"
              busy={busy('hook')}
              disabled={!ready || !!running}
              onClick={hook}
            />
            <AiCard
              icon={<ClipIcon />}
              title="Find the best clips"
              detail="Pulls 20–60 second moments that stand on their own"
              busy={busy('clips')}
              disabled={!ready || !!running}
              onClick={clips}
            />
            <AiCard
              icon={<GlobeIcon />}
              title={project.translation ? `Captions in ${project.translation.language}` : 'Translate captions'}
              detail={project.translation ? 'Tap to change language or switch back' : 'Same timing, another language'}
              busy={busy('translate')}
              disabled={!ready || !!running}
              onClick={() => setResult({ kind: 'translate' })}
            />
            <AiCard
              icon={<SpellIcon />}
              title="Fix the transcript"
              detail="Names, jargon and punctuation Whisper got wrong"
              busy={busy('fix')}
              disabled={!ready || !!running}
              onClick={() => setResult({ kind: 'fix' })}
            />
            {running && (
              <button className="btn ghost small" onClick={() => controller.current?.abort()}>
                Stop
              </button>
            )}
          </>
        )}
      </div>

      {result?.kind === 'hook' && (
        <Sheet title="Hook ideas" onClose={() => setResult(null)}>
          <p className="hint" style={{ marginBottom: 10 }}>
            Tap one to put it on screen for the first seconds.
          </p>
          {result.hooks.map((h) => (
            <button
              key={h}
              className="choice"
              onClick={() => {
                update((p) => ({ ...p, hook: { ...p.hook, enabled: true, text: h } }))
                seek(0)
                setResult(null)
                showToast('Hook added — see Format to adjust it')
              }}
            >
              {h}
            </button>
          ))}
          <h3 style={{ fontSize: 13, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '18px 0 8px' }}>
            Post caption
          </h3>
          <div className="choice" style={{ whiteSpace: 'pre-wrap', userSelect: 'text', WebkitUserSelect: 'text' }}>
            {result.caption}
            {result.hashtags.length > 0 && <small>{result.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}</small>}
          </div>
          <button
            className="btn block"
            onClick={() => {
              const text = `${result.caption}\n\n${result.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}`.trim()
              navigator.clipboard?.writeText(text).then(
                () => showToast('Caption copied'),
                () => showToast("Couldn't copy — press and hold the text instead"),
              )
            }}
          >
            <CopyIcon /> Copy caption
          </button>
        </Sheet>
      )}

      {result?.kind === 'clips' && (
        <Sheet title="Best clips" onClose={() => setResult(null)}>
          <p className="hint" style={{ marginBottom: 10 }}>
            Using a clip trims the video to it. Undo brings the rest back.
          </p>
          {result.clips.map((c) => {
            const first = words.find((w) => w.id === c.firstWordId)
            const last = words.find((w) => w.id === c.lastWordId)
            if (!first || !last) return null
            return (
              <button
                key={c.firstWordId + c.lastWordId}
                className="choice"
                onClick={() => {
                  update((p) => ({
                    ...p,
                    edit: {
                      ...p.edit,
                      trimStart: Math.max(0, first.start - 0.15),
                      trimEnd: Math.min(p.media.duration, last.end + 0.35),
                    },
                  }))
                  seek(0)
                  setResult(null)
                  showToast(`Trimmed to “${c.title}”`)
                }}
              >
                <strong>{c.title}</strong> · {formatClock(last.end - first.start)}
                <small>{c.reason}</small>
              </button>
            )
          })}
        </Sheet>
      )}

      {result?.kind === 'translate' && (
        <Sheet title="Caption language" onClose={() => setResult(null)}>
          {project.translation && (
            <button
              className="choice"
              onClick={() => {
                update((p) => ({ ...p, translation: null }))
                setResult(null)
                showToast('Captions back in the original language')
              }}
            >
              <strong>Original</strong>
              <small>As spoken</small>
            </button>
          )}
          <div className="chips wrap">
            {TARGET_LANGUAGES.map((l) => (
              <button key={l} className="pill" aria-pressed={project.translation?.language === l} onClick={() => translate(l)}>
                {l}
              </button>
            ))}
          </div>
          <p className="hint">Takes a few seconds per minute of video. Editing words later keeps the translation in step.</p>
        </Sheet>
      )}
      {result?.kind === 'fix' && <FixSheet onClose={() => setResult(null)} onRun={fix} />}
      {plan.duration <= 0 && <p className="hint">Nothing left in the edit — undo or turn some cuts off.</p>}
    </>
  )
}

/** Names and jargon make the biggest difference to a transcript fix, so ask for them first. */
function FixSheet({ onClose, onRun }: { onClose: () => void; onRun: (context: string) => void }) {
  const [context, setContext] = useState(loadContext)
  return (
    <Sheet title="Fix the transcript" onClose={onClose}>
      <textarea
        className="field"
        placeholder="Names, brands or jargon in this video — e.g. Orion, Maker School, 92 Hard, hyperextensions"
        value={context}
        onChange={(e) => setContext(e.target.value)}
        aria-label="Names and jargon"
      />
      <p className="hint">Optional, and remembered for next time. Word timings never change; only spellings do.</p>
      <div className="actions">
        <button
          className="btn primary block"
          onClick={() => {
            try {
              localStorage.setItem(CONTEXT_KEY, context.trim())
            } catch {
              // Not remembered; still used this time.
            }
            onRun(context.trim())
          }}
        >
          <SpellIcon /> Fix it
        </button>
      </div>
    </Sheet>
  )
}

function AiCard({
  icon,
  title,
  detail,
  onClick,
  disabled,
  busy,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <button className="ai-card" onClick={busy ? undefined : onClick} disabled={disabled && !busy} aria-busy={busy}>
      <span className="ai-icon">{busy ? <span className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} /> : icon}</span>
      <span className="label">
        <strong>{title}</strong>
        <small>{busy ? 'Working on it…' : detail}</small>
      </span>
    </button>
  )
}
