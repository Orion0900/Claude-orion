import { useCallback, useEffect, useRef, useState } from 'react'
import { DaySheet } from './components/DaySheet'
import { Icon, type IconName } from './components/Icons'
import { Confetti } from './components/Confetti'
import { ProgressView } from './components/ProgressView'
import { SettingsView } from './components/SettingsView'
import { StartView } from './components/StartView'
import { TodayView } from './components/TodayView'
import type { LogChange } from './components/TaskList'
import {
  canLog,
  dayNumber,
  dayState,
  endAttempt,
  getStatus,
  logFor,
  newAttempt,
  updateLog,
  type AppState,
  type Attempt,
} from './lib/challenge'
import type { DateKey } from './lib/dates'
import { loadState, saveState } from './lib/storage'
import { isDayComplete } from './lib/tasks'
import { useToday } from './hooks'

type Tab = 'today' | 'progress' | 'settings'

const TABS: Array<{ id: Tab; icon: IconName; label: string }> = [
  { id: 'today', icon: 'today', label: 'Today' },
  { id: 'progress', icon: 'grid', label: 'Progress' },
  { id: 'settings', icon: 'sliders', label: 'Settings' },
]

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [saved, setSaved] = useState(true)
  const [tab, setTab] = useState<Tab>('today')
  const [openDate, setOpenDate] = useState<DateKey | null>(null)
  // Bumped when a day is finished; the toast and the confetti key off it.
  const [cheer, setCheer] = useState<{ n: number; day: number } | null>(null)
  const today = useToday()
  // The newest state, even between a change and the render that shows it,
  // so two quick taps can never both start from the same count.
  const latest = useRef(state)
  latest.current = state

  useEffect(() => setSaved(saveState(state)), [state])
  useEffect(() => {
    // Ask the browser not to clear the run to make room; it's a long challenge.
    navigator.storage?.persist?.().catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!cheer) return
    const timer = setTimeout(() => setCheer(null), 2800)
    return () => clearTimeout(timer)
  }, [cheer])
  useEffect(() => window.scrollTo(0, 0), [tab])

  const { attempt } = state
  const status = getStatus(attempt, today)

  const changeLog =
    (date: DateKey): LogChange =>
    (change) => {
      const current = latest.current
      const before = current.attempt
      if (!before || !canLog(before, date, today)) return
      const next = updateLog(current, date, change)
      latest.current = next
      setState(next)
      if (!isDayComplete(logFor(before, date)) && next.attempt && isDayComplete(logFor(next.attempt, date))) {
        setCheer((c) => ({ n: (c?.n ?? 0) + 1, day: dayNumber(before, date) }))
      }
    }

  const begin = (next: Attempt) => {
    setState((s) => ({ ...s, attempt: next }))
    setTab('today')
  }
  const end = () => {
    setState((s) => endAttempt(s, today))
    setOpenDate(null)
    setTab('today')
  }
  const replace = (next: AppState) => {
    setState(next)
    setOpenDate(null)
    // Erasing, or restoring from the start screen, lands on Today; a restore from Settings stays to say so.
    if (!next.attempt || !state.attempt) setTab('today')
  }
  const openDay = (date: DateKey) => {
    if (date === today && status.kind === 'active') setTab('today')
    else setOpenDate(date)
  }
  const closeDay = useCallback(() => setOpenDate(null), [])

  if (!attempt || status.kind === 'none') {
    return <StartView state={state} today={today} onBegin={begin} onRestore={replace} />
  }

  return (
    <div className="app">
      <main className="screen" key={tab}>
        {tab === 'today' && (
          <TodayView
            attempt={attempt}
            status={status}
            today={today}
            onChange={changeLog}
            onOpenDay={openDay}
            onEnd={end}
            onStartToday={() => setState((s) => ({ ...s, attempt: newAttempt(today) }))}
          />
        )}
        {tab === 'progress' && <ProgressView state={state} attempt={attempt} today={today} onOpenDay={openDay} />}
        {tab === 'settings' && <SettingsView state={state} attempt={attempt} onEnd={end} onReplace={replace} />}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab on' : 'tab'}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {openDate && dayState(attempt, dayNumber(attempt, openDate), today) !== 'future' && (
        <DaySheet attempt={attempt} date={openDate} onChange={changeLog(openDate)} onClose={closeDay} />
      )}

      {cheer && (
        <div className="cheer" role="status" key={cheer.n}>
          <span className="cheer-day">Day {cheer.day}</span>
          <span className="cheer-done">Done</span>
        </div>
      )}
      <Confetti trigger={cheer?.n ?? 0} />

      {!saved && (
        <p className="save-warning" role="alert">
          This phone isn't saving 92 Hard right now. Back up from Settings before you close it.
        </p>
      )}
    </div>
  )
}
