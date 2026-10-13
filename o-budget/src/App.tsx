import { useEffect, useState } from 'react'
import {
  addCategory,
  addStep,
  isBlankCategory,
  isBlankStep,
  monthlyIncome,
  removeCategory,
  removeItem,
  removeStep,
  shares,
  type Budget,
} from './lib/budget'
import type { SyncStatus } from './lib/sync'
import { CategorySheet, ExpensesSection } from './components/ExpensesSection'
import { GrossSection } from './components/GrossSection'
import { IncomeSection } from './components/IncomeSection'
import { Ring } from './components/Marks'
import { ProcessSection, StepSheet } from './components/ProcessSection'
import { useBudget } from './useBudget'

type Open = { kind: 'step' | 'category'; id: string; fresh: boolean }

const SYNC_TEXT: Record<SyncStatus, string> = {
  loading: 'Loading',
  device: 'Saved on this device',
  unsaved: "This browser isn't saving",
  synced: 'Saved',
  saving: 'Saving',
  offline: 'Not saved yet',
  readonly: 'View only',
}

export default function App() {
  const { budget, status, update } = useBudget()
  const [open, setOpen] = useState<Open | null>(null)
  const [undo, setUndo] = useState<{ label: string; before: Budget } | null>(null)

  // The undo offer goes after a few seconds.
  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(timer)
  }, [undo])

  if (!budget) return <Loading />

  /** Removes something, keeping what was there for Undo. */
  const removeWithUndo = (label: string, change: (b: Budget) => Budget) => {
    setUndo({ label, before: budget })
    update(change)
  }

  const add = (kind: Open['kind']) => {
    let id = ''
    update((b) => {
      const [next, added] = kind === 'step' ? addStep(b) : addCategory(b)
      id = added
      return next
    })
    setOpen({ kind, id, fresh: true })
  }

  /** Closing a step or category that was opened and left blank doesn't keep it. */
  const close = () => {
    if (open?.kind === 'step') {
      const s = budget.steps.find((x) => x.id === open.id)
      if (s && isBlankStep(s)) update((b) => removeStep(b, s.id))
    } else if (open?.kind === 'category') {
      const c = budget.categories.find((x) => x.id === open.id)
      if (c && isBlankCategory(c)) update((b) => removeCategory(b, c.id))
    }
    setOpen(null)
  }

  return (
    <div className="app">
      <header className="top">
        <Ring investing={monthlyIncome(budget) > 0 ? shares(budget).investing : null} />
        <h1 className="wordmark">O-Budget</h1>
        <span className="sync" data-status={status} role="status">
          <span className="sync-dot" aria-hidden="true" />
          {SYNC_TEXT[status]}
        </span>
      </header>

      <main className="layout">
        <div className="col">
          <IncomeSection budget={budget} update={update} />
          <ProcessSection
            budget={budget}
            update={update}
            onOpen={(id) => setOpen({ kind: 'step', id, fresh: false })}
            onAdd={() => add('step')}
          />
        </div>
        <div className="col">
          <GrossSection budget={budget} update={update} />
          <ExpensesSection
            budget={budget}
            onOpen={(id) => setOpen({ kind: 'category', id, fresh: false })}
            onAdd={() => add('category')}
          />
        </div>
      </main>

      {open?.kind === 'step' && (
        <StepSheet
          key={open.id}
          budget={budget}
          id={open.id}
          fresh={open.fresh}
          update={update}
          onClose={close}
          onRemove={(id) => {
            const s = budget.steps.find((x) => x.id === id)
            setOpen(null)
            if (s && isBlankStep(s)) update((b) => removeStep(b, id))
            else removeWithUndo(`Deleted ${s?.text.trim() || 'step'}`, (b) => removeStep(b, id))
          }}
        />
      )}

      {open?.kind === 'category' && (
        <CategorySheet
          key={open.id}
          budget={budget}
          id={open.id}
          fresh={open.fresh}
          update={update}
          onClose={close}
          onRemove={(id) => {
            const c = budget.categories.find((x) => x.id === id)
            setOpen(null)
            if (c && isBlankCategory(c)) update((b) => removeCategory(b, id))
            else removeWithUndo(`Deleted ${c?.name.trim() || 'category'}`, (b) => removeCategory(b, id))
          }}
          onRemoveItem={(categoryId, itemId) => {
            const item = budget.categories.find((x) => x.id === categoryId)?.items.find((x) => x.id === itemId)
            removeWithUndo(`Removed ${item?.name.trim() || 'item'}`, (b) => removeItem(b, categoryId, itemId))
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

/** What shows while an artifact's saved budget is on its way. */
function Loading() {
  return (
    <div className="app" aria-busy="true">
      <header className="top">
        <Ring investing={null} />
        <h1 className="wordmark">O-Budget</h1>
        <span className="sync" data-status="loading" role="status">
          <span className="sync-dot" aria-hidden="true" />
          Loading your budget
        </span>
      </header>
      <main className="layout">
        {[
          [
            ['income', 'Income', 3],
            ['process', 'Paycheck process', 3],
          ],
          [
            ['gross', 'Gross pay', 2],
            ['expenses', 'Living expenses', 5],
          ],
        ].map((col, i) => (
          <div className="col" key={i}>
            {col.map(([kind, title, lines]) => (
              <section className={`section ${kind}`} key={kind}>
                <h2 className="eyebrow">{title}</h2>
                <div className="skeleton big" />
                {Array.from({ length: Number(lines) - 1 }, (_, j) => (
                  <div className="skeleton" key={j} />
                ))}
                <div className="skeleton short" />
              </section>
            ))}
          </div>
        ))}
      </main>
    </div>
  )
}
