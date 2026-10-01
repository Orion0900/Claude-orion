import { useState, type ReactNode } from 'react'
import { fromBackup } from '../lib/backup'
import type { AppState, Totals } from '../lib/challenge'
import { TASKS } from '../lib/tasks'

/** The four rules, as written. */
export function RulesList() {
  return (
    <ol className="rules">
      {TASKS.map((task, i) => (
        <li key={task.id}>
          <span className="rule-n">{i + 1}</span>
          <span className="rule-text">{task.rule}</span>
        </li>
      ))}
    </ol>
  )
}

export function StatTiles({ totals }: { totals: Totals }) {
  const tiles: Array<[string, number]> = [
    ['Days done', totals.daysDone],
    ['Sets', totals.sets],
    ['Hyperextensions', totals.hyperextensions],
    ['Maker School', totals.makerSchool],
    ['Vlogs', totals.vlogs],
    ['Half marathons', totals.halfMarathons],
  ]
  return (
    <div className="tiles">
      {tiles.map(([label, value]) => (
        <div className="tile" key={label}>
          <span className="tile-num">{value.toLocaleString()}</span>
          <span className="tile-label">{label}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Picks a backup file and hands back the state inside it. A label around the
 * input, rather than a script clicking a hidden one, is what every browser
 * agrees opens the file picker.
 */
export function RestoreButton({
  onRestore,
  confirmMessage,
  className,
  children,
}: {
  onRestore: (state: AppState) => void
  confirmMessage?: string
  className: string
  children: ReactNode
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <label className={`${className} file-btn`}>
        <input
          className="visually-hidden"
          type="file"
          accept=".json,application/json,text/plain"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const state = fromBackup(await file.text())
              setError(null)
              if (!confirmMessage || window.confirm(confirmMessage)) onRestore(state)
            } catch (err) {
              setError(err instanceof Error ? err.message : "That file couldn't be read.")
            }
          }}
        />
        {children}
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
