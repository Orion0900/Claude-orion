import { STAGES } from '../../data/stages'
import { activateFocused, arrowDir, bouncyText, button, el, moveFocus } from '../dom'
import { formatCount, formatTime } from '../format'
import { buildDamageBars, buildInventory } from '../panels'
import { Modal, type ModalEnv } from './Modal'

/** Game over and victory: the run's story, then Retry or Title. It never closes by itself. */
export class EndModal extends Modal {
  private readonly unbindTips: () => void
  private readonly retry: HTMLButtonElement

  constructor(env: ModalEnv, victory: boolean) {
    super(env, victory ? 'victory' : 'gameover')
    const { ctx } = env
    const run = ctx.run
    const head = el('div', 'modal-head', undefined, this.panel)
    bouncyText(victory ? 'VICTORY!' : 'GAME OVER', `modal-title ${victory ? 'title-victory' : 'title-gameover'} ol`, head)
    const stage = STAGES[run.stageIndex] ?? ctx.stage
    el(
      'div',
      'modal-sub ol',
      victory
        ? `${ctx.character.icon} ${ctx.character.name} crushed all ${STAGES.length} stages!`
        : `${ctx.character.icon} ${ctx.character.name} fell in ${stage.name} (Stage ${run.stageIndex + 1}/${STAGES.length})`,
      head,
    )

    const grid = el('div', 'end-stats', undefined, this.panel)
    const bosses = run.bossesKilled
    // Bosses ride under the elites as a small note: in the value they overflowed the cell.
    const bossNote = bosses > 0 ? `+${formatCount(bosses)} boss${bosses > 1 ? 'es' : ''}` : ''
    const cells: Array<[string, string, string, string?]> = [
      ['⏱️', 'Time', formatTime(run.totalTime)],
      ['⭐', 'Level', String(ctx.progression.level)],
      ['💀', 'Kills', formatCount(run.kills)],
      ['◆', 'Elites', formatCount(run.elitesKilled), bossNote],
      ['🪙', 'Gold', formatCount(run.gold)],
      ['🥈', 'Silver earned', `+${formatCount(run.silver)}`],
    ]
    cells.forEach(([icon, label, value, note], i) => {
      const cell = el('div', 'end-cell', undefined, grid)
      cell.style.setProperty('--i', String(i))
      el('span', 'end-icon', icon, cell)
      el('span', 'end-value ol', value, cell)
      el('span', 'end-label', label, cell)
      if (note) el('span', 'end-note', note, cell)
    })

    const cols = el('div', 'end-cols', undefined, this.panel)
    const dmg = el('div', 'end-col', undefined, cols)
    el('div', 'panel-title ol', 'Damage by weapon', dmg)
    dmg.appendChild(buildDamageBars(ctx))
    const inv = el('div', 'end-col', undefined, cols)
    el('div', 'panel-title ol', 'Build', inv)
    inv.appendChild(buildInventory(ctx))

    const actions = el('div', 'modal-actions', undefined, this.panel)
    this.retry = button('Retry', 'btn-primary btn-big', () => this.onRetry(), actions)
    button('Title', 'btn-ghost btn-big', () => this.onTitle(), actions)

    this.unbindTips = env.tooltip.bind(this.root)
  }

  override onKey(e: KeyboardEvent): boolean {
    const dir = arrowDir(e)
    if (dir) {
      if (moveFocus(this.panel, dir)) this.env.sfx('uiMove', { volume: 0.5 })
      return true
    }
    // Space is jump: a mashed jump must never throw the summary away. Enter, R or a click retry.
    if (e.key === ' ') return true
    if (e.repeat) return false
    if (activateFocused(this.panel, e)) return true
    if (e.key === 'r' || e.key === 'R') {
      this.onRetry()
      return true
    }
    return false
  }

  protected override tick(): void {
    // Focus Retry once the entrance has played, for keyboard players.
    if (this.age > 0.9 && !this.retry.dataset.focused && !this.env.shell.input.isTouch) {
      this.retry.dataset.focused = '1'
      this.retry.focus({ preventScroll: true })
    }
  }

  override destroy(): void {
    this.unbindTips()
  }

  private onRetry(): void {
    if (!this.ready) return
    this.env.sfx('uiSelect')
    // The shell tears the run down, which closes this modal too.
    this.env.shell.startRun(this.env.ctx.run.characterId)
  }

  private onTitle(): void {
    if (!this.ready) return
    this.env.sfx('uiSelect')
    this.env.shell.quitToTitle()
  }
}
