import { useState, type ReactNode } from 'react'
import {
  HALF_MARATHON_KM,
  HYPEREXTENSIONS_TARGET,
  SETS_TARGET,
  cleanCount,
  isTaskDone,
  type DayLog,
} from '../lib/tasks'
import { Icon } from './Icons'

export type LogChange = (change: (log: DayLog) => DayLog) => void

interface CardProps {
  log: DayLog
  onChange: LogChange
}

/** One day's four tasks and its note. Keyed by date, so undo never crosses days. */
export function TaskList({ log, onChange }: CardProps) {
  return (
    <div className="tasks">
      <TrainingCard log={log} onChange={onChange} />
      <HyperextensionsCard log={log} onChange={onChange} />
      <ToggleCard
        title="Maker School"
        detail="One session"
        done={log.makerSchool}
        onToggle={() => onChange((l) => ({ ...l, makerSchool: !l.makerSchool }))}
      />
      <ToggleCard
        title="Vlog"
        detail="One vlog"
        done={log.vlog}
        onToggle={() => onChange((l) => ({ ...l, vlog: !l.vlog }))}
      />
      <label className="note">
        <span className="section-label">Notes</span>
        <textarea
          value={log.note}
          onChange={(e) => {
            const note = e.target.value
            onChange((l) => ({ ...l, note }))
          }}
          placeholder="How did it go?"
          rows={3}
          maxLength={5000}
        />
      </label>
    </div>
  )
}

function TaskHead({ done, title, detail, count }: { done: boolean; title: string; detail: string; count?: ReactNode }) {
  return (
    <span className="task-head">
      <span className={done ? 'check on' : 'check'} aria-hidden="true">
        <Icon name="check" size={18} />
      </span>
      <span className="task-titles">
        <span className="task-title">{title}</span>
        <span className="task-detail">{detail}</span>
      </span>
      {count !== undefined && <span className="task-count">{count}</span>}
    </span>
  )
}

/** Gym: fifteen sets plus neck. Or a half marathon, which covers it on its own. */
function TrainingCard({ log, onChange }: CardProps) {
  const done = isTaskDone(log, 'training')
  const changeSets = (next: (sets: number) => number) => onChange((l) => ({ ...l, sets: cleanCount(next(l.sets), 999) }))

  if (log.halfMarathon) {
    return (
      <article className="task done" aria-label="Gym or half marathon">
        <TaskHead done title="Half marathon" detail={`${HALF_MARATHON_KM} km, in place of the gym`} />
        <button className="text-btn" onClick={() => onChange((l) => ({ ...l, halfMarathon: false }))}>
          Undo — back to the gym
        </button>
      </article>
    )
  }

  const count = log.sets > SETS_TARGET ? `${log.sets} sets` : `${log.sets}/${SETS_TARGET}`
  return (
    <article className={done ? 'task done' : 'task'} aria-label="Gym or half marathon">
      <TaskHead done={done} title="Gym" detail="15 sets + neck" count={count} />
      <div className="pips" role="group" aria-label="Sets">
        {Array.from({ length: SETS_TARGET }, (_, i) => (
          <button
            key={i}
            className={i < log.sets ? 'pip on' : 'pip'}
            aria-label={`${i + 1} ${i ? 'sets' : 'set'}`}
            aria-pressed={i < log.sets}
            // Tapping the last filled pip takes it back off.
            onClick={() => changeSets((sets) => (sets === i + 1 ? i : i + 1))}
          />
        ))}
      </div>
      <div className="gym-controls">
        <button className="icon-btn" aria-label="One set fewer" disabled={log.sets === 0} onClick={() => changeSets((sets) => sets - 1)}>
          <Icon name="minus" />
        </button>
        <button className={log.sets >= SETS_TARGET ? 'add-set met' : 'add-set'} onClick={() => changeSets((sets) => sets + 1)}>
          <Icon name="plus" size={22} />
          Set
        </button>
        <button
          className={log.neck ? 'toggle-chip on' : 'toggle-chip'}
          role="checkbox"
          aria-checked={log.neck}
          onClick={() => onChange((l) => ({ ...l, neck: !l.neck }))}
        >
          <span className="mini-check" aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
          Neck
        </button>
      </div>
      <div className="or" aria-hidden="true">
        <span>or</span>
      </div>
      <button className="alt-btn" onClick={() => onChange((l) => ({ ...l, halfMarathon: true }))}>
        Ran a half marathon today
      </button>
    </article>
  )
}

const STEPS = [10, 15, 20, 25]

function HyperextensionsCard({ log, onChange }: CardProps) {
  const [history, setHistory] = useState<number[]>([])
  const [editing, setEditing] = useState(false)
  const done = isTaskDone(log, 'hyperextensions')
  const add = (n: number) => {
    setHistory((h) => [...h, n])
    onChange((l) => ({ ...l, hyperextensions: cleanCount(l.hyperextensions + n) }))
  }
  const undo = () => {
    const last = history[history.length - 1]
    if (last === undefined) return
    setHistory((h) => h.slice(0, -1))
    onChange((l) => ({ ...l, hyperextensions: cleanCount(l.hyperextensions - last) }))
  }
  const set = (n: number) => {
    setEditing(false)
    setHistory([])
    onChange((l) => ({ ...l, hyperextensions: cleanCount(n) }))
  }

  const count = editing ? (
    <CountInput value={log.hyperextensions} onDone={set} label="Hyperextensions done" />
  ) : (
    <button className="count-btn" onClick={() => setEditing(true)} aria-label={`${log.hyperextensions} done. Edit`}>
      {log.hyperextensions}/{HYPEREXTENSIONS_TARGET}
    </button>
  )

  return (
    <article className={done ? 'task done' : 'task'} aria-label="Hyperextensions">
      <TaskHead done={done} title="Hyperextensions" detail="100, split however you like" count={count} />
      <div className="bar" aria-hidden="true">
        <div className="bar-fill" style={{ width: `${Math.min(100, (log.hyperextensions / HYPEREXTENSIONS_TARGET) * 100)}%` }} />
      </div>
      <div className="steps">
        {STEPS.map((n) => (
          <button key={n} className="step" onClick={() => add(n)} aria-label={`Add ${n}`}>
            +{n}
          </button>
        ))}
        <button className="icon-btn" aria-label="Undo" disabled={history.length === 0} onClick={undo}>
          <Icon name="undo" />
        </button>
      </div>
    </article>
  )
}

function CountInput({ value, onDone, label }: { value: number; onDone: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value))
  const commit = () => {
    const n = Number.parseInt(text, 10)
    onDone(Number.isFinite(n) ? n : value)
  }
  return (
    <input
      className="count-input"
      type="number"
      inputMode="numeric"
      pattern="[0-9]*"
      min={0}
      autoFocus
      aria-label={label}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

function ToggleCard({ title, detail, done, onToggle }: { title: string; detail: string; done: boolean; onToggle: () => void }) {
  return (
    <button className={done ? 'task task-toggle done' : 'task task-toggle'} role="checkbox" aria-checked={done} onClick={onToggle}>
      <TaskHead
        done={done}
        title={title}
        detail={detail}
        count={
          <>
            1<span className="times">×</span>
          </>
        }
      />
    </button>
  )
}
