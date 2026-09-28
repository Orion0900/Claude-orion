import { STAGES } from '../../data/stages'
import { bouncyText, button, el } from '../dom'
import { formatCount, formatTime } from '../format'
import { Modal, type ModalEnv } from './Modal'

/** Between stages: a short summary and a Continue into the next map. */
export class StageClearModal extends Modal {
  constructor(env: ModalEnv, nextStage: number) {
    super(env, 'stageclear')
    const { ctx } = env
    const run = ctx.run
    const head = el('div', 'modal-head', undefined, this.panel)
    bouncyText('STAGE CLEARED!', 'modal-title title-clear ol', head)
    el('div', 'modal-sub ol', `${ctx.stage.name} conquered`, head)

    const grid = el('div', 'end-stats', undefined, this.panel)
    const cells: Array<[string, string, string]> = [
      ['⏱️', 'Stage time', formatTime(run.stageTime)],
      ['⭐', 'Level', String(ctx.progression.level)],
      ['💀', 'Kills', formatCount(run.kills)],
      ['🪙', 'Gold', formatCount(run.gold)],
    ]
    cells.forEach(([icon, label, value], i) => {
      const cell = el('div', 'end-cell', undefined, grid)
      cell.style.setProperty('--i', String(i))
      el('span', 'end-icon', icon, cell)
      el('span', 'end-value ol', value, cell)
      el('span', 'end-label', label, cell)
    })

    const next = STAGES[nextStage]
    if (next) {
      const box = el('div', 'next-stage', undefined, this.panel)
      el('div', 'next-label', 'Next up', box)
      el('div', 'next-name ol', next.name, box)
      el('div', 'next-sub', next.subtitle, box)
      box.style.setProperty('--accent', next.palette.accent)
    }

    const actions = el('div', 'modal-actions', undefined, this.panel)
    this.initialFocus = button('Continue', 'btn-primary btn-big', () => this.onContinue(), actions)
  }

  override onKey(e: KeyboardEvent): boolean {
    if (e.key !== ' ' && e.key !== 'Enter') return false
    if (!e.repeat) this.onContinue()
    return true
  }

  protected override auto(): void {
    this.env.close()
  }

  private onContinue(): void {
    if (!this.ready) return
    this.env.sfx('uiSelect')
    this.env.close()
  }
}
