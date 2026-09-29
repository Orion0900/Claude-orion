import { activateFocused, arrowDir, bouncyText, button, el, moveFocus } from '../dom'
import { controlsHint, formatCount, formatTime } from '../format'
import { StatList, buildInventory } from '../panels'
import { Modal, type ModalEnv } from './Modal'

/** Seconds the "really quit?" confirmation stays armed. */
const QUIT_CONFIRM = 3

/** Pause: resume, settings, quit; plus every stat and the inventory with tooltips. */
export class PauseModal extends Modal {
  private readonly quit: HTMLButtonElement
  private quitArmed = 0
  private readonly unbindTips: () => void

  constructor(env: ModalEnv) {
    super(env, 'pause')
    const { ctx } = env
    const side = el('div', 'pause-side', undefined, this.panel)
    bouncyText('PAUSED', 'modal-title title-pause ol', side)
    const info = el('div', 'run-info', undefined, side)
    el('div', 'run-info-stage ol', `${ctx.stage.name} · ${formatTime(ctx.run.totalTime - ctx.run.stageStartTime)}`, info)
    el(
      'div',
      'run-info-line',
      `Level ${ctx.progression.level} · 💀 ${formatCount(ctx.run.kills)} · 🪙 ${formatCount(ctx.run.gold)}`,
      info,
    )
    el('div', 'run-info-line dim', `${ctx.character.icon} ${ctx.character.name} · ${ctx.character.passiveText}`, info)

    const menu = el('div', 'menu-col', undefined, side)
    const resume = button('Resume', 'btn-primary btn-big', () => this.resume(), menu)
    button('Settings', 'btn-purple', () => this.ready && env.openSettings(), menu)
    this.quit = button('Quit to title', 'btn-red', () => this.onQuit(), menu)
    if (!env.shell.input.isTouch) {
      // Touch players see their controls on screen; keyboard ones get a reminder.
      const keys = el('div', 'pause-keys', undefined, side)
      for (const part of controlsHint(false).split(' · ')) el('span', 'pause-key', part, keys)
    }

    const main = el('div', 'pause-main', undefined, this.panel)
    const statsBox = el('div', 'pause-stats', undefined, main)
    el('div', 'panel-title ol', 'Stats', statsBox)
    const stats = new StatList()
    stats.update(ctx.progression.stats)
    statsBox.appendChild(stats.el)
    const invBox = el('div', 'pause-inv', undefined, main)
    el('div', 'panel-title ol', 'Inventory', invBox)
    invBox.appendChild(buildInventory(ctx))

    this.unbindTips = env.tooltip.bind(this.root)
    this.initialFocus = resume
  }

  override onKey(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (!e.repeat) this.resume()
      return true
    }
    const dir = arrowDir(e)
    if (dir) {
      if (moveFocus(this.panel, dir)) this.env.sfx('uiMove', { volume: 0.5 })
      return true
    }
    return !e.repeat && activateFocused(this.panel, e)
  }

  protected override tick(dt: number): void {
    if (this.quitArmed <= 0) return
    this.quitArmed -= dt
    if (this.quitArmed <= 0) {
      this.quit.textContent = 'Quit to title'
      this.quit.classList.remove('armed', 'two-line')
    }
  }

  protected override auto(): void {
    this.env.close()
  }

  override destroy(): void {
    this.unbindTips()
  }

  private resume(): void {
    if (!this.ready) return
    this.env.sfx('uiSelect')
    this.env.close()
  }

  private onQuit(): void {
    if (!this.ready) return
    if (this.quitArmed <= 0) {
      this.quitArmed = QUIT_CONFIRM
      // Quitting ends the run like a death would: silver and records are kept.
      this.quit.replaceChildren('Quit to title?', el('span', 'btn-note', 'Your silver is kept'))
      this.quit.classList.add('armed', 'two-line')
      this.env.sfx('uiMove')
      return
    }
    this.env.sfx('uiSelect')
    // The shell tears the run down, which closes this modal too.
    this.env.shell.quitToTitle()
  }
}
