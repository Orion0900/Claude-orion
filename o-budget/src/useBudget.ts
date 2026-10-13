import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyBudget, orionBudget, type Budget } from './lib/budget'
import { loadBudget } from './lib/storage'
import { createSync, isHosted, type Sync, type SyncStatus } from './lib/sync'

/**
 * The installed app opens on Orion's budget as written down. The artifact
 * build opens empty, because its budget comes from the artifact's database.
 */
const fallback = import.meta.env.MODE === 'artifact' ? emptyBudget : orionBudget

/** The budget on screen, where it's saved, and the one way to change it. */
export function useBudget() {
  const [hosted] = useState(isHosted)
  const [budget, setBudget] = useState<Budget | null>(() => (hosted ? null : (loadBudget() ?? fallback())))
  const [status, setStatus] = useState<SyncStatus>(hosted ? 'loading' : 'device')
  const latest = useRef(budget)
  const sync = useRef<Sync | null>(null)

  useEffect(() => {
    const s = createSync({
      fallback,
      onBudget: (b) => {
        latest.current = b
        setBudget(b)
      },
      onStatus: setStatus,
    })
    sync.current = s
    s.start(hosted, hosted ? loadBudget() : latest.current)
    // Leaving the app writes the last edit straight away.
    const save = () => void s.flush()
    const onHide = () => document.visibilityState === 'hidden' && save()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
      save()
      s.stop()
    }
  }, [hosted])

  /** Applies an edit to the latest budget, shows it and saves it. */
  const update = useCallback((change: (b: Budget) => Budget) => {
    const prev = latest.current
    if (!prev) return
    const next = change(prev)
    if (next === prev) return
    latest.current = next
    setBudget(next)
    sync.current?.edit(next)
  }, [])

  return { budget, status, update }
}
