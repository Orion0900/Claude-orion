import type { Settings, SfxId, ShellApi } from '../game/types'
import { activateFocused, arrowDir, bouncyText, button, el, moveFocus } from './dom'

type NumberKey = 'master' | 'music' | 'sfx' | 'sensitivity'
type ToggleKey = 'invertY' | 'showDamageNumbers' | 'screenShake'

const QUALITIES: ReadonlyArray<Settings['quality']> = ['low', 'medium', 'high']

/**
 * Volume, look and graphics options. Edits `shell.meta.settings` in place
 * (the run's `ctx.settings` is the same object) and saves through the shell,
 * which also applies them.
 */
export class SettingsPanel {
  readonly root: HTMLDivElement
  private readonly panel: HTMLDivElement

  constructor(
    private readonly shell: ShellApi,
    private readonly onClose: () => void,
    private readonly sfx: (id: SfxId) => void,
    inRun: boolean,
  ) {
    this.root = el('div', 'settings-screen')
    this.panel = el('div', 'panel settings-panel', undefined, this.root)
    bouncyText('SETTINGS', 'modal-title title-settings ol', this.panel)

    const audio = this.group('Audio')
    this.slider(audio, 'Master volume', 'master', 0, 1, 0.05, pct)
    this.slider(audio, 'Music', 'music', 0, 1, 0.05, pct)
    this.slider(audio, 'Sound effects', 'sfx', 0, 1, 0.05, pct)

    const controls = this.group('Controls')
    this.slider(controls, 'Look sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => `${v.toFixed(2)}×`)
    this.toggle(controls, 'Invert look Y', 'invertY')

    const gfx = this.group('Graphics')
    this.quality(gfx, inRun)
    this.toggle(gfx, 'Damage numbers', 'showDamageNumbers')
    this.toggle(gfx, 'Screen shake', 'screenShake')

    const actions = el('div', 'modal-actions', undefined, this.panel)
    button('Back', 'btn-primary btn-big', () => this.close(), actions)
  }

  /** Called once mounted; keyboard players start on the first control. */
  shown(): void {
    if (!this.shell.input.isTouch) this.panel.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true })
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      if (!e.repeat) this.close()
      return true
    }
    const dir = arrowDir(e)
    const focused = document.activeElement
    if (dir && focused instanceof HTMLInputElement && focused.type === 'range' && (dir === 'left' || dir === 'right')) {
      // Stepped by hand: game input may have swallowed the slider's own arrow handling.
      const step = Number(focused.step) || 0.05
      focused.value = String(Number(focused.value) + (dir === 'left' ? -step : step))
      focused.dispatchEvent(new Event('input'))
      focused.dispatchEvent(new Event('change'))
      return true
    }
    if (dir) {
      if (moveFocus(this.panel, dir)) this.sfx('uiMove')
      return true
    }
    return !e.repeat && activateFocused(this.panel, e)
  }

  private close(): void {
    this.sfx('uiSelect')
    this.onClose()
  }

  private save(): void {
    this.shell.saveMeta()
  }

  private group(title: string): HTMLDivElement {
    const g = el('div', 'settings-group', undefined, this.panel)
    el('div', 'settings-group-title ol', title, g)
    return g
  }

  private slider(parent: HTMLElement, label: string, key: NumberKey, min: number, max: number, step: number, show: (v: number) => string): void {
    const row = el('label', 'settings-row', undefined, parent)
    el('span', 'settings-label', label, row)
    const input = el('input', 'slider', undefined, row)
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    const value = el('span', 'settings-value ol', '', row)
    const current = this.shell.meta.settings[key]
    input.value = String(Number.isFinite(current) ? current : min)
    const sync = () => {
      const v = Math.min(max, Math.max(min, Number(input.value)))
      this.shell.meta.settings[key] = v
      value.textContent = show(v)
      input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`)
    }
    sync()
    input.addEventListener('input', sync)
    // Saving writes storage and re-applies settings, so it waits for the release.
    input.addEventListener('change', () => {
      sync()
      this.save()
      if (key !== 'sensitivity') this.sfx('uiMove')
    })
  }

  private toggle(parent: HTMLElement, label: string, key: ToggleKey): void {
    const row = el('div', 'settings-row', undefined, parent)
    el('span', 'settings-label', label, row)
    const sw = button('', 'switch', () => {
      this.shell.meta.settings[key] = !this.shell.meta.settings[key]
      paint()
      this.save()
      this.sfx('uiSelect')
    }, row)
    el('span', 'switch-knob', undefined, sw)
    const paint = () => {
      const on = this.shell.meta.settings[key]
      sw.classList.toggle('on', on)
      sw.setAttribute('aria-pressed', String(on))
      sw.setAttribute('aria-label', `${label}: ${on ? 'on' : 'off'}`)
    }
    paint()
  }

  private quality(parent: HTMLElement, inRun: boolean): void {
    const row = el('div', 'settings-row', undefined, parent)
    el('span', 'settings-label', 'Quality', row)
    const seg = el('div', 'segmented', undefined, row)
    const buttons = QUALITIES.map((q) => {
      const b = button(q[0].toUpperCase() + q.slice(1), 'seg', () => {
        this.shell.meta.settings.quality = q
        paint()
        this.save()
        this.sfx('uiSelect')
      }, seg)
      return b
    })
    const paint = () => {
      QUALITIES.forEach((q, i) => buttons[i].classList.toggle('on', this.shell.meta.settings.quality === q))
    }
    paint()
    el(
      'div',
      'settings-note',
      inRun ? 'Shadows and resolution change now; smoothing (antialiasing) after a reload.' : 'Low suits phones and older laptops.',
      parent,
    )
  }
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}
