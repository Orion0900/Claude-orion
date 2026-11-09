import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyPlan, orionPlan, type Plan } from './lib/plan'
import { loadPlan } from './lib/storage'
import { createSync, isHosted, type Sync, type SyncStatus } from './lib/sync'

/**
 * The installed app opens on Orion's goals as written down. The artifact
 * build opens empty, because its plan comes from the artifact's database.
 */
const fallback = import.meta.env.MODE === 'artifact' ? emptyPlan : orionPlan

/** The plan on screen, where it's saved, and the one way to change it. */
export function usePlan() {
  const [hosted] = useState(isHosted)
  const [plan, setPlan] = useState<Plan | null>(() => (hosted ? null : (loadPlan() ?? fallback())))
  const [status, setStatus] = useState<SyncStatus>(hosted ? 'loading' : 'device')
  const latest = useRef(plan)
  const sync = useRef<Sync | null>(null)

  useEffect(() => {
    const s = createSync({
      fallback,
      onPlan: (p) => {
        latest.current = p
        setPlan(p)
      },
      onStatus: setStatus,
    })
    sync.current = s
    s.start(hosted, hosted ? loadPlan() : latest.current)
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

  /** Applies an edit to the latest plan, shows it and saves it. */
  const update = useCallback((change: (p: Plan) => Plan) => {
    const prev = latest.current
    if (!prev) return
    const next = change(prev)
    if (next === prev) return
    latest.current = next
    setPlan(next)
    sync.current?.edit(next)
  }, [])

  return { plan, status, update }
}
