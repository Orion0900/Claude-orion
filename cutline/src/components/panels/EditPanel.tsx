/**
 * Cutting: the one-tap AI edit, pause and filler removal, and the transcript
 * itself — tap a word to jump there, select words to cut them, fix a word
 * Whisper misheard, mark a keyword or give it an emoji.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { isFiller } from '../../lib/cuts'
import { suggestEmojis, suggestEmphasis } from '../../lib/emoji'
import { formatClock } from '../../lib/project'
import type { AudioAnalysis, Project, Word } from '../../lib/types'
import type { RenderPlan } from '../../render/plan'
import type { UpdateOptions } from '../../hooks/useProject'
import { languageLabel, type AppSettings } from '../../services/settings'
import { Sheet, SliderRow, ToggleRow } from '../Controls'
import { EditIcon, ReturnIcon, ScissorsIcon, SmileIcon, SparklesIcon, StarIcon, RestoreIcon } from '../Icons'

interface Props {
  project: Project
  plan: RenderPlan
  analysis: AudioAnalysis | null
  update: (recipe: (p: Project) => Project, options?: UpdateOptions) => void
  time: number
  playing: boolean
  seek: (t: number) => void
  settings: AppSettings
  transcribing: boolean
  onRetranscribe: () => void
  showToast: (message: string) => void
}

export function EditPanel(props: Props) {
  const { project, plan, update, settings, transcribing } = props
  const { edit, media } = project
  const words = project.words
  const saved = Math.max(0, media.duration - plan.duration)
  const cuts = plan.map.cutPoints().length

  const magic = () => {
    update((p) => {
      const anyDecor = p.words.some((w) => w.emphasis || w.emoji)
      const emphasis = anyDecor ? null : suggestEmphasis(p.words)
      const emojis = anyDecor ? null : suggestEmojis(p.words)
      return {
        ...p,
        edit: { ...p.edit, removeSilences: true, removeFillers: true },
        format: { ...p.format, autoZoom: true },
        style: { ...p.style, emojis: true },
        captionsOff: false,
        words:
          emphasis && emojis
            ? p.words.map((w) => ({
                ...w,
                ...(emphasis.has(w.id) ? { emphasis: true } : {}),
                ...(emojis.get(w.id) ? { emoji: emojis.get(w.id) } : {}),
              }))
            : p.words,
      }
    })
    props.showToast('Pauses and ums cut, zooms and emojis added')
  }

  return (
    <>
      <div className="group">
        <button className="ai-hero" onClick={magic} disabled={words.length === 0}>
          <span className="sparkle">
            <SparklesIcon />
          </span>
          <span>
            <strong>AI Edit</strong>
            <small>Cut pauses and ums, punch in on the big moments, add emojis — one tap, undo any time.</small>
          </span>
        </button>
        <div className="stat-line">
          <span>
            Original <b>{formatClock(media.duration)}</b>
          </span>
          <span>
            Edited <b>{formatClock(plan.duration)}</b>
          </span>
          {saved >= 0.5 && (
            <span>
              Saved <b>{saved.toFixed(1)} s</b> in <b>{cuts}</b> {cuts === 1 ? 'cut' : 'cuts'}
            </span>
          )}
        </div>
      </div>

      <div className="group">
        <ToggleRow
          title="Remove pauses"
          detail="Shortens every silence to a natural beat"
          checked={edit.removeSilences}
          onChange={(v) => update((p) => ({ ...p, edit: { ...p.edit, removeSilences: v } }))}
        />
        {edit.removeSilences && (
          <SliderRow
            label="Longest pause"
            value={edit.maxPause}
            min={0.1}
            max={1.2}
            step={0.05}
            format={(v) => `${v.toFixed(2)} s`}
            onChange={(v) => update((p) => ({ ...p, edit: { ...p.edit, maxPause: v } }), { group: 'max-pause' })}
          />
        )}
        <ToggleRow
          title="Remove filler words"
          detail="Um, uh, er and the like"
          checked={edit.removeFillers}
          onChange={(v) => update((p) => ({ ...p, edit: { ...p.edit, removeFillers: v } }))}
        />
      </div>

      <div className="group">
        <h3>Transcript</h3>
        {words.length === 0 ? (
          <p className="hint">
            {transcribing
              ? 'Your words will appear here in a moment.'
              : media.hasAudio
                ? 'No speech was found in this video.'
                : 'This video has no sound, so there is nothing to caption.'}
          </p>
        ) : (
          <Transcript {...props} />
        )}
      </div>

      <TrimGroup project={project} update={update} />

      <div className="group">
        <h3>Transcription</h3>
        <p className="hint" style={{ marginBottom: 10 }}>
          {project.transcript.model
            ? `Made with the ${project.transcript.model} model${
                project.transcript.language ? ` in ${languageLabel(project.transcript.language)}` : ''
              }. `
            : ''}
          Transcribing again uses the language and model from Settings ({languageLabel(settings.language)}, {settings.model}) and
          replaces your word edits.
        </p>
        <button className="btn small" onClick={props.onRetranscribe} disabled={transcribing || !media.hasAudio}>
          Transcribe again
        </button>
      </div>
    </>
  )
}

/* ---- Transcript ---- */

interface Selection {
  anchor: number
  focus: number
}

const PAUSE_SHOWN = 0.5

function Transcript({ project, plan, update, time, playing, seek }: Props) {
  const words = project.words
  const [selection, setSelection] = useState<Selection | null>(null)
  const [editing, setEditing] = useState<{ kind: 'text' | 'emoji'; index: number } | null>(null)
  const spans = useRef(new Map<string, HTMLSpanElement>())
  const current = useRef<string | null>(null)

  const lo = selection ? Math.min(selection.anchor, selection.focus) : -1
  const hi = selection ? Math.max(selection.anchor, selection.focus) : -1

  // Paragraphs break at long pauses, so the transcript reads like the talk.
  const paragraphs = useMemo(() => {
    const out: number[][] = []
    let para: number[] = []
    words.forEach((w, i) => {
      const prev = words[i - 1]
      if (prev && (w.start - prev.end > 1.5 || (para.length > 45 && /[.!?]$/.test(prev.text)))) {
        out.push(para)
        para = []
      }
      para.push(i)
    })
    if (para.length) out.push(para)
    return out
  }, [words])

  // Which words and pauses the edit drops, for strike-throughs.
  const dropped = useMemo(() => {
    const set = new Set<string>()
    for (const w of words) {
      if (!w.removed && plan.map.toEdited((w.start + w.end) / 2) === null) set.add(w.id)
    }
    return set
  }, [words, plan])

  // The spoken word lights up as the video plays, without re-rendering the transcript.
  useEffect(() => {
    const s = plan.map.toSource(time)
    let lo = 0
    let hi = words.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (words[mid].start <= s + 0.02) {
        found = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    const id = found >= 0 && s < words[found].end + 0.6 ? words[found].id : null
    if (id === current.current) return
    if (current.current) spans.current.get(current.current)?.classList.remove('current')
    current.current = id
    const span = id ? spans.current.get(id) : null
    if (span) {
      span.classList.add('current')
      if (playing) {
        const panel = span.closest('.panel')
        if (panel) {
          const a = span.getBoundingClientRect()
          const b = panel.getBoundingClientRect()
          if (a.top < b.top + 40 || a.bottom > b.bottom - 20) span.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }
    }
  }, [time, plan, words, playing])

  const tapWord = (i: number) => {
    const w = words[i]
    const t = plan.map.toEdited(w.start + 0.01) ?? plan.map.toEditedClamped(w.start)
    seek(t)
    setSelection((sel) => {
      if (!sel) return { anchor: i, focus: i }
      if (sel.anchor === sel.focus && sel.anchor === i) return null
      return { anchor: sel.anchor, focus: i }
    })
  }

  const patchRange = (patch: (w: Word) => Word) =>
    update((p) => ({ ...p, words: p.words.map((w, i) => (i >= lo && i <= hi ? patch(w) : w)) }))

  const selected = selection ? words.slice(lo, hi + 1) : []
  const allRemoved = selected.length > 0 && selected.every((w) => w.removed)
  const allEmphasis = selected.length > 0 && selected.every((w) => w.emphasis)
  const single = selected.length === 1 ? selected[0] : null

  return (
    <>
      {selection && (
        <div className="word-actions" role="toolbar" aria-label="Selected words">
          <button
            className={`pill${allRemoved ? '' : ' on'}`}
            onClick={() => {
              patchRange((w) => ({ ...w, removed: !allRemoved }))
              setSelection(null)
            }}
          >
            {allRemoved ? <RestoreIcon /> : <ScissorsIcon />}
            {allRemoved ? 'Restore' : selected.length > 1 ? `Cut ${selected.length} words` : 'Cut'}
          </button>
          {single && (
            <button className="pill" onClick={() => setEditing({ kind: 'text', index: lo })}>
              <EditIcon /> Fix word
            </button>
          )}
          <button className="pill" onClick={() => patchRange((w) => ({ ...w, emphasis: !allEmphasis }))}>
            <StarIcon /> {allEmphasis ? 'Unmark' : 'Keyword'}
          </button>
          {single && (
            <button className="pill" onClick={() => setEditing({ kind: 'emoji', index: lo })}>
              <SmileIcon /> {single.emoji ? single.emoji : 'Emoji'}
            </button>
          )}
          <button
            className="pill"
            aria-pressed={!!words[hi]?.breakAfter}
            onClick={() =>
              update((p) => ({ ...p, words: p.words.map((w, i) => (i === hi ? { ...w, breakAfter: !w.breakAfter } : w)) }))
            }
          >
            <ReturnIcon /> New caption after
          </button>
          <button className="pill" onClick={() => setSelection(null)}>
            Done
          </button>
        </div>
      )}
      <div className="transcript">
        {paragraphs.map((para, pi) => (
          <p key={pi}>
            {para.map((i) => {
              const w = words[i]
              const prev = words[i - 1]
              const gap = prev ? w.start - prev.end : 0
              const gapCut = gap >= PAUSE_SHOWN && plan.map.toEdited(prev!.end + gap / 2) === null
              const filler = project.edit.removeFillers && isFiller(w.text)
              const cls = [
                'word',
                w.removed ? 'removed' : filler || dropped.has(w.id) ? 'filler' : '',
                w.emphasis && !w.removed ? 'emphasis' : '',
                i >= lo && i <= hi ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <span key={w.id}>
                  {gap >= PAUSE_SHOWN && i !== para[0] && (
                    <span className={`gap-mark${gapCut ? ' cut' : ''}`}>{gap.toFixed(1)}s</span>
                  )}
                  <span
                    ref={(el) => {
                      if (el) spans.current.set(w.id, el)
                      else spans.current.delete(w.id)
                    }}
                    className={cls}
                    role="button"
                    tabIndex={0}
                    onClick={() => tapWord(i)}
                  >
                    {w.text}
                    {w.emoji && <span className="emo">{w.emoji}</span>}
                  </span>{' '}
                </span>
              )
            })}
          </p>
        ))}
      </div>
      {editing?.kind === 'text' && (
        <FixWordSheet
          word={words[editing.index]}
          onClose={() => setEditing(null)}
          onSave={(text) => {
            const id = words[editing.index].id
            update((p) => ({ ...p, words: p.words.map((w) => (w.id === id ? { ...w, text } : w)) }))
            setEditing(null)
          }}
        />
      )}
      {editing?.kind === 'emoji' && (
        <EmojiSheet
          current={words[editing.index].emoji ?? null}
          onClose={() => setEditing(null)}
          onPick={(emoji) => {
            const id = words[editing.index].id
            update((p) => ({
              ...p,
              style: emoji ? { ...p.style, emojis: true } : p.style,
              words: p.words.map((w) => {
                if (w.id !== id) return w
                const next = { ...w }
                if (emoji) next.emoji = emoji
                else delete next.emoji
                return next
              }),
            }))
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function FixWordSheet({ word, onClose, onSave }: { word: Word; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState(word.text)
  return (
    <Sheet title="Fix this word" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const t = text.trim()
          if (t) onSave(t)
        }}
      >
        <input className="field" value={text} autoFocus onChange={(e) => setText(e.target.value)} aria-label="Word" />
        <p className="hint">Its timing stays the same; only the caption text changes.</p>
        <div className="actions">
          <button className="btn primary block" type="submit" disabled={!text.trim()}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}

const EMOJIS = [
  '🔥', '💯', '😂', '🤯', '😍', '😱', '🙌', '👏', '💪', '🚀', '💰', '💸', '📈', '🧠', '💡', '⏰',
  '❤️', '✨', '🎯', '✅', '❌', '⚠️', '👀', '🤔', '😎', '🥳', '🙏', '🎉', '📱', '💻', '🏆', '⭐',
  '🍕', '☕', '🏃', '🏋️', '✈️', '🌍', '🎬', '🎵', '📚', '🛑', '👉', '🤝', '😴', '🤑',
]

function EmojiSheet({
  current,
  onClose,
  onPick,
}: {
  current: string | null
  onClose: () => void
  onPick: (emoji: string | null) => void
}) {
  return (
    <Sheet title="Emoji for this word" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            aria-pressed={current === e}
            style={{
              fontSize: 26,
              height: 44,
              borderRadius: 10,
              background: current === e ? 'var(--accent-soft)' : 'var(--surface-2)',
            }}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="actions">
        {current && (
          <button className="btn block" onClick={() => onPick(null)}>
            Remove emoji
          </button>
        )}
      </div>
    </Sheet>
  )
}

/* ---- Trim ---- */

function TrimGroup({ project, update }: Pick<Props, 'project' | 'update'>) {
  const duration = project.media.duration
  const start = project.edit.trimStart
  const end = project.edit.trimEnd ?? duration
  return (
    <div className="group">
      <h3>Trim</h3>
      <SliderRow
        label="Start"
        value={start}
        min={0}
        max={Math.max(0, duration - 0.5)}
        step={0.05}
        format={formatClock}
        onChange={(v) =>
          update((p) => ({ ...p, edit: { ...p.edit, trimStart: Math.min(v, (p.edit.trimEnd ?? duration) - 0.5) } }), {
            group: 'trim-start',
          })
        }
      />
      <SliderRow
        label="End"
        value={end}
        min={0.5}
        max={duration}
        step={0.05}
        format={formatClock}
        onChange={(v) =>
          update(
            (p) => ({
              ...p,
              edit: { ...p.edit, trimEnd: v >= duration - 0.02 ? null : Math.max(v, p.edit.trimStart + 0.5) },
            }),
            { group: 'trim-end' },
          )
        }
      />
    </div>
  )
}
