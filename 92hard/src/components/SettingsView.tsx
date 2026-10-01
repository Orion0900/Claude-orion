import { useState } from 'react'
import { backupFileName, toBackup } from '../lib/backup'
import { finishDate, type AppState, type Attempt } from '../lib/challenge'
import { shortDate } from '../lib/dates'
import { isInstalled } from '../hooks'
import { saveFile } from '../services/files'
import { useConfirm } from './Confirm'
import { RestoreButton, RulesList } from './Shared'

export function SettingsView({
  state,
  attempt,
  onEnd,
  onReplace,
}: {
  state: AppState
  attempt: Attempt
  onEnd: () => void
  onReplace: (state: AppState) => void
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [confirmSheet, ask] = useConfirm()

  const backUp = async () => {
    const now = new Date()
    await saveFile(backupFileName(now), toBackup(state, now))
  }
  const startOver = async () => {
    const ok = await ask({
      title: 'Start over at Day 1?',
      body: 'This run ends here and goes into your attempts.',
      action: 'Start over',
      danger: true,
    })
    if (ok) onEnd()
  }
  const erase = async () => {
    const ok = await ask({
      title: 'Erase everything?',
      body: 'Every run and every log on this phone goes, and there is no undo.',
      action: 'Erase everything',
      danger: true,
    })
    if (ok) onReplace({ attempt: null, history: [] })
  }

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Settings</h1>
      </header>

      <section className="card">
        <h2 className="section-label">The rules</h2>
        <RulesList />
        <p className="card-copy">Every day for 92 days. No days off, no swaps. Miss one and it's back to Day 1.</p>
      </section>

      <section className="card">
        <h2 className="section-label">This run</h2>
        <dl className="facts">
          <div>
            <dt>Day 1</dt>
            <dd>{shortDate(attempt.start)}</dd>
          </div>
          <div>
            <dt>Day 92</dt>
            <dd>{shortDate(finishDate(attempt))}</dd>
          </div>
          <div>
            <dt>Attempt</dt>
            <dd>{state.history.length + 1}</dd>
          </div>
        </dl>
        <button className="btn danger" onClick={startOver}>
          Start over at Day 1
        </button>
      </section>

      <section className="card">
        <h2 className="section-label">Your data</h2>
        <p className="card-copy">
          Everything stays on this phone. Back up now and then — it's also how you move a run to a new phone.
        </p>
        <div className="btn-row">
          <button className="btn backup-btn" onClick={backUp}>
            Back up
          </button>
          <RestoreButton
            className="btn"
            confirm={{ title: 'Restore this backup?', body: 'It replaces everything on this phone.', action: 'Restore' }}
            onRestore={(next) => {
              onReplace(next)
              setMessage('Backup restored.')
            }}
          >
            Restore
          </RestoreButton>
        </div>
        {message && (
          <p className="card-copy ok" role="status">
            {message}
          </p>
        )}
        <button className="text-btn danger" onClick={erase}>
          Erase everything
        </button>
      </section>

      {!isInstalled() && (
        <section className="card">
          <h2 className="section-label">Put it on your Home Screen</h2>
          <p className="card-copy">
            In Safari, tap Share, then Add to Home Screen. It gets its own icon, opens full screen and works with no
            signal.
          </p>
        </section>
      )}
      {confirmSheet}
    </>
  )
}
