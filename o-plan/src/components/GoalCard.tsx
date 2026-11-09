import { useId, useState } from 'react'
import { dayLabel, isInPlay, markLabel, statusOf, STATUSES, type Goal, type Status } from '../lib/plan'
import { GrowingText } from './Fields'
import { CheckIcon, ChevronIcon, EditIcon, FlagIcon } from './Icons'

interface Props {
  goal: Goal
  open: boolean
  onToggle: () => void
  onStep: (stepId: string) => void
  /** The goal marked in progress, changed, complete or scrapped, with an optional note. */
  onStatus: (status: Status, note: string) => void
  onEdit: () => void
}

/**
 * One goal, like a question on an FAQ page: its name, where it stands and
 * how far along it is. Tap it and it opens onto the plan of attack, a route
 * of steps to tick off that ends at the finish line, then where it stands,
 * which can be changed at any time, with every mark it's had.
 */
export function GoalCard({ goal, open, onToggle, onStep, onStatus, onEdit }: Props) {
  const [picking, setPicking] = useState<Status | null>(null)
  const [note, setNote] = useState('')
  const uid = useId()
  const panelId = `${uid}-plan`
  const noteId = `${uid}-note`
  const done = goal.steps.filter((s) => s.done).length
  const total = goal.steps.length
  const title = goal.title.trim() || 'Untitled goal'
  const pick = picking ? statusOf(picking) : null

  const cancel = () => {
    setPicking(null)
    setNote('')
  }

  return (
    <li className={`goal${open ? ' open' : ''}`} data-status={goal.status}>
      <h3 className="goal-head">
        <button type="button" className="goal-toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
          <span className="goal-title">{title}</span>
          <span className="goal-meta">
            <span className="pill">{statusOf(goal.status).label}</span>
            {total > 0 && (
              <span className="goal-count num">
                {done} of {total} {total === 1 ? 'step' : 'steps'}
              </span>
            )}
          </span>
          {total > 0 && (
            <span className="goal-bar" aria-hidden="true">
              <span style={{ width: `${(done / total) * 100}%` }} />
            </span>
          )}
          <span className="chev" aria-hidden="true">
            <ChevronIcon />
          </span>
        </button>
      </h3>

      <div id={panelId} className="goal-panel" role="region" aria-label={`${title}: plan of attack`} hidden={!open}>
        <div className="panel-head">
          <h4 className="eyebrow">Plan of attack</h4>
          <button type="button" className="edit-btn" onClick={onEdit}>
            <EditIcon />
            Edit plan
          </button>
        </div>
        {goal.approach.trim() && <p className="approach">{goal.approach}</p>}

        <ol className="route">
          {goal.steps.map((s, i) => (
            <li key={s.id} className={`waypoint${s.done ? ' done' : ''}`}>
              <button type="button" role="checkbox" aria-checked={s.done} className="waypoint-row" onClick={() => onStep(s.id)}>
                <span className="waypoint-mark num">{s.done ? <CheckIcon /> : i + 1}</span>
                <span className="waypoint-text">{s.text.trim() || `Step ${i + 1}`}</span>
                {s.detail.trim() && <span className="waypoint-detail">{s.detail}</span>}
              </button>
            </li>
          ))}
          <li className="waypoint finish-line">
            <div className="waypoint-row">
              <span className="waypoint-mark">
                <FlagIcon />
              </span>
              <span className="waypoint-text">Finish line</span>
              <span className="waypoint-detail">{goal.finish.trim() || 'Not set yet: say what done looks like in Edit plan.'}</span>
            </div>
          </li>
        </ol>
        {total === 0 && <p className="note-line">No steps yet. Add them in Edit plan, in the order you'll take them.</p>}
        {total > 0 && done === total && isInPlay(goal) && (
          <p className="note-line ready">Every step is done. At the finish line? Mark it complete.</p>
        )}

        <div className="standing">
          <h4 className="eyebrow">Where it stands</h4>
          <div className="status-picker" role="group" aria-label="Where it stands">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`status-opt${picking === s.id ? ' picking' : ''}`}
                data-status={s.id}
                aria-pressed={goal.status === s.id}
                onClick={() => (s.id === goal.status ? cancel() : setPicking(s.id))}
              >
                {s.label}
              </button>
            ))}
          </div>

          {pick && (
            <form
              className="composer"
              data-status={pick.id}
              onSubmit={(e) => {
                e.preventDefault()
                onStatus(pick.id, note)
                cancel()
              }}
            >
              <label className="composer-label" htmlFor={noteId}>
                {pick.prompt} <span className="optional">Optional</span>
              </label>
              <GrowingText id={noteId} className="text-input" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="actions">
                <button type="submit" className={`btn ${pick.id === 'scrapped' ? 'danger' : 'fill'}`} data-status={pick.id}>
                  {pick.action}
                </button>
                <button type="button" className="btn quiet" onClick={cancel}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <ol className="log" aria-label="History">
            {goal.log.map((m, i) => (
              <li key={i} data-status={m.status}>
                <span className="log-what">{markLabel(goal.log, i)}</span>
                {m.on && <span className="log-when num">{dayLabel(m.on)}</span>}
                {m.note && <span className="log-note">“{m.note}”</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </li>
  )
}
