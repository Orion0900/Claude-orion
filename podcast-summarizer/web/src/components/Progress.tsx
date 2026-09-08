import type { Stage } from '../types'

const STEPS: { key: Stage[]; label: string }[] = [
  { key: ['queued', 'resolving'], label: 'Reading link' },
  { key: ['finding_audio', 'needs_source'], label: 'Finding audio' },
  { key: ['transcribing'], label: 'Transcribing' },
  { key: ['summarizing'], label: 'Summarizing' },
]

export function Progress({ stage, message }: { stage: Stage; message: string }) {
  const current = STEPS.findIndex((s) => s.key.includes(stage))
  const done = stage === 'done'
  return (
    <div className="progress">
      <ol className="steps">
        {STEPS.map((s, i) => {
          const state = done || i < current ? 'done' : i === current ? (stage === 'failed' ? 'failed' : 'active') : 'todo'
          return (
            <li key={s.label} className={state}>
              <span className="dot" />
              <span>{s.label}</span>
            </li>
          )
        })}
      </ol>
      {!done && stage !== 'failed' && stage !== 'needs_source' && (
        <p className="muted status">
          <span className="spinner" /> {message}
        </p>
      )}
      {stage === 'transcribing' && <p className="muted small">Transcribing a long episode can take several minutes. You can lock your phone; this runs on the server.</p>}
    </div>
  )
}
