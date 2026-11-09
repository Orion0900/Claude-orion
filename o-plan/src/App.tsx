import { useEffect, useState } from 'react'
import {
  addGoal,
  dayKey,
  dropBlankSteps,
  isBlankGoal,
  isInPlay,
  removeGoal,
  removeStep,
  setStatus,
  stepProgress,
  toggleStep,
  type Goal,
  type Plan,
  type Status,
} from './lib/plan'
import type { SyncStatus } from './lib/sync'
import { GoalCard } from './components/GoalCard'
import { GoalSheet } from './components/GoalSheet'
import { PlusIcon } from './components/Icons'
import { Ring } from './components/Marks'
import { usePlan } from './usePlan'

type Editing = { id: string; fresh: boolean }

const SYNC_TEXT: Record<SyncStatus, string> = {
  loading: 'Loading',
  device: 'Saved on this device',
  unsaved: "This browser isn't saving",
  synced: 'Saved',
  saving: 'Saving',
  offline: 'Not saved yet',
  readonly: 'View only',
}

/** What the toast says once a goal is marked. */
function markedText(title: string, status: Status): string {
  if (status === 'active') return `${title} is back in progress`
  if (status === 'scrapped') return `Scrapped ${title}`
  return `Marked ${title} ${status === 'changed' ? 'changed' : 'complete'}`
}

const inPlayAfter = (status: Status) => status === 'active' || status === 'changed'

export default function App() {
  const { plan, status, update } = usePlan()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [undo, setUndo] = useState<{ label: string; before: Plan } | null>(null)

  // The undo offer goes after a few seconds.
  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(timer)
  }, [undo])

  if (!plan) return <Loading />

  /** Changes the plan, keeping what was there for Undo. */
  const withUndo = (label: string, change: (p: Plan) => Plan) => {
    setUndo({ label, before: plan })
    update(change)
  }

  const setOpenFor = (id: string, on: boolean) =>
    setOpen((prev) => {
      if (prev.has(id) === on) return prev
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const add = () => {
    let id = ''
    update((p) => {
      const [next, added] = addGoal(p, dayKey())
      id = added
      return next
    })
    setOpenFor(id, true)
    setEditing({ id, fresh: true })
  }

  const editingGoal = editing ? plan.goals.find((g) => g.id === editing.id) : undefined

  /** Closing a goal left blank doesn't keep it, and steps left empty go. */
  const closeEditor = () => {
    const g = editingGoal
    if (g && isBlankGoal(g)) update((p) => removeGoal(p, g.id))
    else if (g) update((p) => dropBlankSteps(p, g.id))
    setEditing(null)
  }

  const mark = (g: Goal, to: Status, note: string) => {
    // A goal leaving play, or coming back into it, folds up on its way to the other list.
    if (isInPlay(g) !== inPlayAfter(to)) setOpenFor(g.id, false)
    withUndo(markedText(g.title.trim() || 'Untitled goal', to), (p) => setStatus(p, g.id, to, dayKey(), note))
  }

  const inPlay = plan.goals.filter(isInPlay)
  const complete = plan.goals.filter((g) => g.status === 'complete')
  const scrapped = plan.goals.filter((g) => g.status === 'scrapped')
  const { done, total } = stepProgress(inPlay)

  const card = (g: Goal) => (
    <GoalCard
      key={g.id}
      goal={g}
      open={open.has(g.id)}
      onToggle={() => setOpenFor(g.id, !open.has(g.id))}
      onStep={(stepId) => update((p) => toggleStep(p, g.id, stepId))}
      onStatus={(to, note) => mark(g, to, note)}
      onEdit={() => setEditing({ id: g.id, fresh: false })}
    />
  )

  return (
    <div className="app">
      <header className="top">
        <Ring done={total ? done / total : 0} />
        <h1 className="wordmark">O-Plan</h1>
        <span className="sync" data-status={status} role="status">
          <span className="sync-dot" aria-hidden="true" />
          {SYNC_TEXT[status]}
        </span>
      </header>

      <main className="layout">
        <section className="board" aria-labelledby="in-play">
          <div className="board-head">
            <h2 className="eyebrow" id="in-play">
              In play <span className="count num">{inPlay.length}</span>
            </h2>
            {total > 0 && (
              <span className="board-sum num">
                {done} of {total} {total === 1 ? 'step' : 'steps'} done
              </span>
            )}
          </div>
          {inPlay.length > 0 ? <ul className="goals">{inPlay.map(card)}</ul> : <Empty anyGoals={plan.goals.length > 0} />}
          <button type="button" className="add-goal" onClick={add}>
            <PlusIcon />
            Add a goal
          </button>
        </section>

        {complete.length > 0 && (
          <section className="board closed" aria-labelledby="complete">
            <div className="board-head">
              <h2 className="eyebrow" id="complete">
                Complete <span className="count num">{complete.length}</span>
              </h2>
            </div>
            <ul className="goals">{complete.map(card)}</ul>
          </section>
        )}

        {scrapped.length > 0 && (
          <section className="board closed" aria-labelledby="scrapped">
            <div className="board-head">
              <h2 className="eyebrow" id="scrapped">
                Scrapped <span className="count num">{scrapped.length}</span>
              </h2>
            </div>
            <ul className="goals">{scrapped.map(card)}</ul>
          </section>
        )}
      </main>

      {editing && editingGoal && (
        <GoalSheet
          key={editing.id}
          goal={editingGoal}
          fresh={editing.fresh}
          update={update}
          onClose={closeEditor}
          onRemoveStep={(stepId) => {
            const g = editingGoal
            const i = g.steps.findIndex((s) => s.id === stepId)
            const step = g.steps[i]
            if (step && !step.text.trim() && !step.detail.trim()) update((p) => removeStep(p, g.id, stepId))
            else withUndo(`Removed step ${i + 1}`, (p) => removeStep(p, g.id, stepId))
          }}
          onRemove={() => {
            const g = editingGoal
            setEditing(null)
            if (isBlankGoal(g)) update((p) => removeGoal(p, g.id))
            else withUndo(`Deleted ${g.title.trim() || 'Untitled goal'}`, (p) => removeGoal(p, g.id))
          }}
        />
      )}

      {undo && (
        <div className="toast" role="status">
          <span className="toast-text">{undo.label}</span>
          <button
            type="button"
            onClick={() => {
              update(() => undo.before)
              setUndo(null)
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  )
}

/** What In play shows with nothing in it. */
function Empty({ anyGoals }: { anyGoals: boolean }) {
  return (
    <div className="empty">
      <p className="empty-title">{anyGoals ? 'Nothing in play' : 'No goals yet'}</p>
      <p className="empty-text">
        {anyGoals
          ? 'Add a goal, or open one below and put it back in progress.'
          : 'Add a goal, then write the plan of attack to get there: the finish line, and the steps in the order you’ll take them.'}
      </p>
    </div>
  )
}

/** What shows while an artifact's saved plan is on its way. */
function Loading() {
  return (
    <div className="app" aria-busy="true">
      <header className="top">
        <Ring done={null} />
        <h1 className="wordmark">O-Plan</h1>
        <span className="sync" data-status="loading" role="status">
          <span className="sync-dot" aria-hidden="true" />
          Loading your plan
        </span>
      </header>
      <main className="layout">
        <section className="board">
          <div className="board-head">
            <h2 className="eyebrow">In play</h2>
          </div>
          <ul className="goals">
            {[0, 1].map((i) => (
              <li className="goal skeleton-goal" key={i}>
                <div className="skeleton big" />
                <div className="skeleton short" />
                <div className="skeleton bar" />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
