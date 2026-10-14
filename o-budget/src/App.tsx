import { useEffect, useState } from 'react'
import { addCategory, investingTotal, isBlankCategory, monthlyIncome, removeCategory, removeItem, type Bucket, type Budget } from './lib/budget'
import type { SyncStatus } from './lib/sync'
import { CardCheck } from './components/CardCheck'
import { CategorySheet } from './components/CategorySheet'
import { GrossSection } from './components/GrossSection'
import { GroupSection } from './components/GroupSection'
import { Ring } from './components/Marks'
import { Overview } from './components/Overview'
import { PlanSection } from './components/PlanSection'
import { ProjectionSection } from './components/ProjectionSection'
import { useBudget } from './useBudget'

type Open = { id: string; fresh: boolean }

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

  const add = (bucket: Bucket) => {
    let id = ''
    update((b) => {
      const [next, added] = addCategory(b, bucket)
      id = added
      return next
    })
    setOpen({ id, fresh: true })
  }

  /** Closing a category that was opened and left blank doesn't keep it. */
  const close = () => {
    const c = open && budget.categories.find((x) => x.id === open.id)
    if (c && isBlankCategory(c)) update((b) => removeCategory(b, c.id))
    setOpen(null)
  }

  const income = monthlyIncome(budget)
  const openCategory = (id: string) => setOpen({ id, fresh: false })

  return (
    <div className="app">
      <header className="top">
        <Ring investing={income > 0 ? investingTotal(budget) / income : null} />
        <h1 className="wordmark">O-Budget</h1>
        <span className="sync" data-status={status} role="status">
          <span className="sync-dot" aria-hidden="true" />
          {SYNC_TEXT[status]}
        </span>
      </header>

      <main className="layout">
        <div className="col">
          <Overview budget={budget} update={update} />
          <PlanSection budget={budget} update={update} />
          <CardCheck budget={budget} update={update} />
          <ProjectionSection budget={budget} update={update} />
        </div>
        <div className="col">
          <GroupSection budget={budget} group="investing" update={update} onOpen={openCategory} onAdd={add} />
          <GroupSection budget={budget} group="living" update={update} onOpen={openCategory} onAdd={add} />
          <GrossSection budget={budget} update={update} />
        </div>
      </main>

      {open && (
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
            ['overview', 'This month', 3],
            ['process', 'Each paycheck', 4],
          ],
          [
            ['group', 'Investing', 3],
            ['group', 'Living', 5],
          ],
        ].map((col, i) => (
          <div className="col" key={i}>
            {col.map(([kind, title, lines]) => (
              <section className={`section ${kind}`} key={String(title)}>
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
