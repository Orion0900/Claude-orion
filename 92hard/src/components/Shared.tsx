import { useState, type ReactNode } from 'react'
import { fromBackup } from '../lib/backup'
import type { AppState, Totals } from '../lib/challenge'
import { FAIL_RULE, RULES } from '../lib/tasks'
import { useConfirm, type ConfirmRequest } from './Confirm'

/** The rules, as written on the board, and the one that makes them hard. */
export function RulesList() {
  return (
    <div className="rules-wrap">
      <ol className="rules">
        {RULES.map((rule, i) => (
          <li key={rule}>
            <span className="rule-n">{i + 1}</span>
            <span className="rule-text">{rule}</span>
          </li>
        ))}
      </ol>
      <p className="fail-rule">
        <span aria-hidden="true">✱</span> {FAIL_RULE}
      </p>
    </div>
  )
}

export function StatTiles({ totals }: { totals: Totals }) {
  const tiles: Array<[string, number]> = [
    ['Days done', totals.daysDone],
    ['Lifts', totals.lifts],
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
  confirm,
  className,
  children,
}: {
  onRestore: (state: AppState) => void
  /** Asked before replacing a run that's already on the phone. */
  confirm?: ConfirmRequest
  className: string
  children: ReactNode
}) {
  const [error, setError] = useState<string | null>(null)
  const [confirmSheet, ask] = useConfirm()
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
              if (!confirm || (await ask(confirm))) onRestore(state)
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
      {confirmSheet}
    </>
  )
}
