import { Fragment, useRef } from 'react'
import { canMoveStep, moveStep, paycheckRun, resetSteps, setStepBeforePay, toggleStep, updateStep, type Budget } from '../lib/budget'
import { money } from '../lib/money'
import { MoneyInput } from './Fields'
import { CheckIcon, CloseIcon, DownIcon, PlusIcon, ResetIcon, TrashIcon, UpIcon } from './Icons'
import { Sheet } from './Sheet'

type Update = (change: (b: Budget) => Budget) => void

/**
 * The steps to run each payday, in order and numbered from 0 the way Orion
 * wrote them, with what's left of the paycheck after each one. Steps taken
 * out before the paycheck, like the 401k, come before it lands and don't
 * come out of it. Each step ticks off; "Start next paycheck" clears the
 * ticks.
 */
export function ProcessSection({
  budget: b,
  update,
  onOpen,
  onAdd,
}: {
  budget: Budget
  update: Update
  onOpen: (id: string) => void
  onAdd: () => void
}) {
  const run = paycheckRun(b)
  const done = b.steps.filter((s) => s.done).length
  const short = run.leftOver < 0
  // Steps before the paycheck come first in the list; the paycheck lands after the last of them.
  const landsAfter = b.steps.filter((s) => s.beforePay).length
  const lands = (
    <li className="step-edge lands">
      <span className="edge-dot" aria-hidden="true" />
      <div className="edge-row">
        <span className="edge-text">Paycheck lands</span>
        <span className="step-amount num">{money(run.start)}</span>
      </div>
    </li>
  )

  return (
    <section className="section process" aria-labelledby="process-title">
      <div className="section-head">
        <h2 className="eyebrow" id="process-title">
          Paycheck process
        </h2>
        {done > 0 && (
          <span className="progress num">
            {done === b.steps.length ? 'All done' : `${done} of ${b.steps.length} done`}
          </span>
        )}
      </div>

      <ol className="steps">
        {landsAfter === 0 && lands}

        {b.steps.map((s, i) => {
          const name = s.text.trim() || 'New step'
          const after = run.after[i]
          return (
            <Fragment key={s.id}>
              <li className={`step${s.done ? ' done' : ''}${s.beforePay ? ' before-pay' : ''}`}>
                <button
                  type="button"
                  className="step-check"
                  role="checkbox"
                  aria-checked={s.done}
                  aria-label={`Step ${i}: ${name}`}
                  onClick={() => update((x) => toggleStep(x, s.id))}
                >
                  {s.done ? <CheckIcon /> : <span className="num">{i}</span>}
                </button>
                <button type="button" className="step-main" onClick={() => onOpen(s.id)} aria-label={`Edit step ${i}: ${name}, ${money(s.amount)}`}>
                  <span className={`step-text${s.text.trim() ? '' : ' placeholder'}`}>{name}</span>
                  <span className="step-amount num">{money(s.amount)}</span>
                  <span className="step-left num">
                    {after === null ? 'out before the paycheck lands' : after < 0 ? `then ${money(-after)} short` : `then ${money(after)} left`}
                  </span>
                </button>
              </li>
              {i === landsAfter - 1 && lands}
            </Fragment>
          )
        })}

        <li className={`step-edge end${short ? ' short' : ''}`}>
          <span className="edge-dot" aria-hidden="true" />
          <div className="edge-row">
            <span className="edge-text">{short ? 'Short' : 'Left over'}</span>
            <span className="step-amount num">{money(Math.abs(run.leftOver))}</span>
          </div>
        </li>
      </ol>

      {b.steps.length === 0 && <p className="note-line">Add what you do first when a paycheck lands, then what comes next.</p>}

      <div className="actions">
        <button type="button" className="btn" onClick={onAdd}>
          <PlusIcon />
          Add step
        </button>
        {done > 0 && (
          <button type="button" className="btn quiet" onClick={() => update(resetSteps)}>
            <ResetIcon />
            Start next paycheck
          </button>
        )}
      </div>
    </section>
  )
}

/** Change a step's words and amount, move it up or down the order, or remove it. */
export function StepSheet({
  budget: b,
  id,
  fresh,
  update,
  onRemove,
  onClose,
}: {
  budget: Budget
  id: string
  fresh: boolean
  update: Update
  onRemove: (id: string) => void
  onClose: () => void
}) {
  const index = b.steps.findIndex((s) => s.id === id)
  const s = b.steps[index]
  const after = paycheckRun(b).after[index]
  // Only a step that was just added takes the keyboard straight away.
  const focusText = useRef(fresh)
  if (!s) return null

  return (
    <Sheet label={`Step ${index}`} onClose={onClose}>
      <div className="sheet-head">
        <h2 className="eyebrow">Step {index}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <label className="field">
        <span className="field-label">What to do</span>
        <input
          id="step-text"
          className="text-input"
          type="text"
          value={s.text}
          placeholder="Invest in VTI"
          enterKeyHint="done"
          autoFocus={focusText.current}
          onChange={(e) => update((x) => updateStep(x, id, { text: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>

      <div className="field">
        <span className="field-label">Amount</span>
        <MoneyInput id="step-amount" className="well-money" value={s.amount} label="Step amount" onChange={(n) => update((x) => updateStep(x, id, { amount: n }))} />
        <span className="field-hint num">
          {after === null
            ? `Not taken from the ${money(b.paycheck)} paycheck.`
            : after < 0
              ? `That's ${money(-after)} more than the paycheck has left.`
              : `${money(after)} of the paycheck left after this.`}
        </span>
      </div>

      <label className="toggle">
        <input
          id="step-before-pay"
          type="checkbox"
          checked={s.beforePay}
          onChange={(e) => update((x) => setStepBeforePay(x, id, e.target.checked))}
        />
        <span className="toggle-track" aria-hidden="true" />
        <span className="toggle-text">
          <span className="toggle-label">Comes out before the paycheck</span>
          <span className="field-hint">Like a 401k: taken from gross pay, so the net paycheck doesn't pay for it.</span>
        </span>
      </label>

      <div className="sheet-row">
        <button type="button" className="btn" disabled={!canMoveStep(b, id, -1)} onClick={() => update((x) => moveStep(x, id, -1))}>
          <UpIcon />
          Earlier
        </button>
        <button type="button" className="btn" disabled={!canMoveStep(b, id, 1)} onClick={() => update((x) => moveStep(x, id, 1))}>
          <DownIcon />
          Later
        </button>
        <button type="button" className="btn danger push" onClick={() => onRemove(id)}>
          <TrashIcon />
          Delete
        </button>
      </div>
    </Sheet>
  )
}
