import { useState } from 'react'
import { addStep, editGoal, editStep, moveStep, type Goal, type Plan } from '../lib/plan'
import { doneOnEnter, GrowingText } from './Fields'
import { CloseIcon, DownIcon, PlusIcon, TrashIcon, UpIcon } from './Icons'
import { Sheet } from './Sheet'

interface Props {
  goal: Goal
  /** Just added: the name field is ready to type in. */
  fresh: boolean
  update: (change: (p: Plan) => Plan) => void
  onRemoveStep: (stepId: string) => void
  onRemove: () => void
  onClose: () => void
}

/** A goal's popout: its name, the finish line, and the plan of attack step by step, in order. */
export function GoalSheet({ goal, fresh, update, onRemoveStep, onRemove, onClose }: Props) {
  const [added, setAdded] = useState<string | null>(null)
  const id = goal.id
  const last = goal.steps.length - 1

  const newStep = () => {
    let stepId = ''
    update((p) => {
      const [next, made] = addStep(p, id)
      stepId = made
      return next
    })
    setAdded(stepId)
  }

  return (
    <Sheet label={goal.title.trim() || 'New goal'} onClose={onClose}>
      <div className="sheet-head">
        <input
          className="sheet-title"
          type="text"
          value={goal.title}
          placeholder="Name the goal"
          aria-label="Goal"
          autoComplete="off"
          enterKeyHint="done"
          autoFocus={fresh}
          onChange={(e) => update((p) => editGoal(p, id, { title: e.target.value }))}
          onKeyDown={doneOnEnter}
        />
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <label className="field">
        <span className="field-label">Finish line</span>
        <GrowingText
          className="text-input"
          value={goal.finish}
          placeholder="What done looks like"
          onChange={(e) => update((p) => editGoal(p, id, { finish: e.target.value }))}
        />
      </label>

      <label className="field">
        <span className="field-label">Plan of attack</span>
        <GrowingText
          className="text-input"
          value={goal.approach}
          placeholder="How you'll get there, in a sentence or two"
          onChange={(e) => update((p) => editGoal(p, id, { approach: e.target.value }))}
        />
      </label>

      <div className="field">
        <span className="field-label">Steps, in order</span>
        {goal.steps.length > 0 && (
          <ol className="step-edits">
            {goal.steps.map((s, i) => (
              <li className="step-edit" key={s.id}>
                <span className="step-num num" aria-hidden="true">
                  {i + 1}
                </span>
                <input
                  className="step-input step-text-input"
                  type="text"
                  value={s.text}
                  placeholder="What to do"
                  aria-label={`Step ${i + 1}`}
                  autoComplete="off"
                  enterKeyHint="done"
                  autoFocus={s.id === added}
                  onChange={(e) => update((p) => editStep(p, id, s.id, { text: e.target.value }))}
                  onKeyDown={doneOnEnter}
                />
                <GrowingText
                  className="step-input step-detail-input"
                  value={s.detail}
                  placeholder="How, or why (optional)"
                  aria-label={`Step ${i + 1}: how, or why`}
                  onChange={(e) => update((p) => editStep(p, id, s.id, { detail: e.target.value }))}
                />
                <div className="step-tools">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Move step ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => update((p) => moveStep(p, id, s.id, -1))}
                  >
                    <UpIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Move step ${i + 1} down`}
                    disabled={i === last}
                    onClick={() => update((p) => moveStep(p, id, s.id, 1))}
                  >
                    <DownIcon />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Remove step ${i + 1}`} onClick={() => onRemoveStep(s.id)}>
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <button type="button" className="add-line" onClick={newStep}>
          <PlusIcon />
          Add a step
        </button>
      </div>

      <div className="sheet-row">
        <button type="button" className="btn fill" onClick={onClose}>
          Done
        </button>
        <button type="button" className="btn danger push" onClick={onRemove}>
          <TrashIcon />
          Delete goal
        </button>
      </div>
    </Sheet>
  )
}
