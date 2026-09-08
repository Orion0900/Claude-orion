import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { savedJobs } from './storage'
import { isActive, type Job } from './types'
import { UrlForm } from './components/UrlForm'
import { JobView } from './components/JobView'
import { History } from './components/History'
import { Settings } from './components/Settings'

type Route = { name: 'home' } | { name: 'job'; id: string } | { name: 'settings' }

function routeFromHash(): Route {
  const hash = location.hash.replace(/^#\/?/, '')
  if (hash === 'settings') return { name: 'settings' }
  const m = hash.match(/^job\/([\w-]+)$/)
  if (m) return { name: 'job', id: m[1] }
  return { name: 'home' }
}

export function App() {
  const [route, setRoute] = useState<Route>(routeFromHash)
  const [jobs, setJobs] = useState<Job[]>(() => savedJobs.all())
  const [offline, setOffline] = useState(!navigator.onLine)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const navigate = (r: Route) => {
    location.hash = r.name === 'home' ? '' : r.name === 'settings' ? '/settings' : `/job/${r.id}`
  }

  /** Merge the server's list with what the device remembers. */
  const refresh = useCallback(async () => {
    try {
      const remote = await api.listJobs()
      const local = savedJobs.all()
      const byId = new Map<string, Job>()
      for (const j of local) byId.set(j.id, j)
      for (const j of remote) byId.set(j.id, { ...byId.get(j.id), ...j, summary: byId.get(j.id)?.summary })
      setJobs([...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setError(undefined)
    } catch (err) {
      setError(`Can’t reach the server: ${(err as Error).message}`)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const anyActive = jobs.some((j) => isActive(j.stage))
  useEffect(() => {
    if (!anyActive || route.name === 'job') return
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  }, [anyActive, refresh, route.name])

  const submit = async (url: string) => {
    const job = await api.createJob(url)
    setJobs((prev) => [job, ...prev])
    navigate({ name: 'job', id: job.id })
  }

  const remove = async (id: string) => {
    savedJobs.remove(id)
    setJobs((prev) => prev.filter((j) => j.id !== id))
    try {
      await api.deleteJob(id)
    } catch {
      /* it is gone locally, which is what the user sees */
    }
    if (route.name === 'job' && route.id === id) navigate({ name: 'home' })
  }

  const onJobUpdate = (job: Job) => {
    savedJobs.put(job)
    setJobs((prev) => {
      const rest = prev.filter((j) => j.id !== job.id)
      return [job, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    })
  }

  const headerRef = useRef<HTMLElement>(null)

  return (
    <div className="app">
      <header className="topbar" ref={headerRef}>
        {route.name !== 'home' ? (
          <button className="link back" onClick={() => navigate({ name: 'home' })} aria-label="Back">
            ‹ Back
          </button>
        ) : (
          <h1 className="brand">PodBrief</h1>
        )}
        {route.name === 'home' && (
          <button className="link" onClick={() => navigate({ name: 'settings' })} aria-label="Settings">
            Settings
          </button>
        )}
      </header>

      {offline && <div className="banner">Offline — saved summaries still open.</div>}
      {error && !offline && route.name === 'home' && <div className="banner warn">{error}</div>}

      <main className="content">
        {route.name === 'home' && (
          <>
            <UrlForm onSubmit={submit} />
            <History jobs={jobs} onOpen={(id) => navigate({ name: 'job', id })} onDelete={remove} />
          </>
        )}
        {route.name === 'job' && (
          <JobView id={route.id} initial={jobs.find((j) => j.id === route.id) ?? savedJobs.get(route.id)} onUpdate={onJobUpdate} onDelete={remove} />
        )}
        {route.name === 'settings' && <Settings />}
      </main>
    </div>
  )
}
