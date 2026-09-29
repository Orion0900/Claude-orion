/**
 * The DOM face of the game: title and character select, the HUD, banners and
 * toasts, and every modal. The game pauses while a modal is open; each
 * `openModal` promise resolves when its modal closes.
 */
import type { AudioApi, GameContext, ModalRequest, SfxId, ShellApi, UiApi } from '../game/types'
import { el } from './dom'
import { STAGE_GOAL } from './format'
import { Hud } from './Hud'
import { ChestModal } from './modals/ChestModal'
import { EndModal } from './modals/EndModal'
import { LevelUpModal } from './modals/LevelUpModal'
import type { Modal, ModalEnv } from './modals/Modal'
import { PauseModal } from './modals/PauseModal'
import { ShrineModal } from './modals/ShrineModal'
import { StageClearModal } from './modals/StageClearModal'
import { Notices } from './Notices'
import { SettingsPanel } from './SettingsPanel'
import { TitleScreen } from './TitleScreen'
import { Tooltip } from './Tooltip'

interface Pending {
  req: ModalRequest
  resolve: () => void
}

interface Active {
  modal: Modal
  resolve: () => void
  /** Set by the modal (possibly from its constructor); the UI finishes the close on its next update. */
  handle: { closing: boolean }
}

/** Matches the modal leave animation in styles.css. */
const MODAL_LEAVE_MS = 220

export class Ui implements UiApi {
  autoPick = false

  private readonly root: HTMLDivElement
  private readonly hud: Hud
  private readonly notices: Notices
  private readonly title: TitleScreen
  private readonly modalLayer: HTMLDivElement
  private readonly settingsLayer: HTMLDivElement
  private readonly tooltip: Tooltip
  private settings: SettingsPanel | null = null
  /** The button that opened Settings, to hand focus back to on the title. */
  private settingsReturn: HTMLElement | null = null
  private active: Active | null = null
  private queue: Pending[] = []
  private ctx: GameContext | null = null
  private unsubs: Array<() => void> = []
  private touchShown: boolean | null = null
  private modalClass = false
  private tabClass = false
  private disposed = false

  constructor(
    private readonly shell: ShellApi,
    host: HTMLElement,
  ) {
    this.root = el('div', 'ui-root', undefined, host)
    // Touch layouts move the prompt clear of the thumbs.
    this.root.classList.toggle('touch', shell.input.isTouch)
    this.hud = new Hud(this.root)
    // Fewer toasts on phones, where the stack would bury the controls.
    this.notices = new Notices(this.root, shell.input.isTouch ? 3 : 5)
    this.title = new TitleScreen(shell, this.root, (id, opts) => this.sfx(id, opts), () => this.openSettings())
    this.modalLayer = el('div', 'modal-layer', undefined, this.root)
    this.settingsLayer = el('div', 'settings-layer', undefined, this.root)
    this.tooltip = new Tooltip(this.root)
    // Capture phase: menus see keys before game input can swallow their defaults.
    window.addEventListener('keydown', this.onKeyDown, true)
  }

  get modalOpen(): boolean {
    return this.active !== null || this.queue.length > 0
  }

  get menuOpen(): boolean {
    return this.title.visible || this.modalOpen || this.settings !== null
  }

  // ─────────────────────────── run binding ───────────────────────────

  attach(ctx: GameContext | null): void {
    for (const off of this.unsubs) off()
    this.unsubs = []
    if (!ctx) {
      this.flushModals()
      this.closeSettings()
      this.notices.clear()
      this.tooltip.hide()
      this.hud.bind(null)
      this.ctx = null
      return
    }
    this.ctx = ctx
    this.title.hide()
    this.hud.bind(ctx)
    const ev = ctx.events
    this.unsubs.push(
      ev.on('levelUp', () => this.hud.flashLevelUp()),
      ev.on('goldChanged', ({ delta }) => {
        if (delta > 0) this.hud.pulseGold()
      }),
      ev.on('playerDamaged', ({ amount }) => {
        if (amount > 0) this.hud.hurt()
      }),
      // The banner-less wave pulse; an encirclement's SURROUNDED! banner is the spawner's.
      ev.on('wave', ({ encircle }) => this.hud.pulseWave(encircle)),
    )
    // Every stage opens with its name and the goal; attach runs once per stage.
    this.notices.banner(ctx.stage.name.toUpperCase(), STAGE_GOAL, ctx.stage.palette.accent)
  }

  showTitle(): void {
    this.flushModals()
    this.closeSettings()
    this.hud.bind(null)
    this.title.show()
  }

  // ─────────────────────────── modals ───────────────────────────

  openModal(req: ModalRequest): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.disposed || !(this.ctx ?? this.shell.ctx)) {
        resolve()
        return
      }
      if (req.kind === 'gameOver' || req.kind === 'victory') {
        // The end screen replaces whatever was up.
        this.flushModals()
        this.closeSettings()
      }
      this.queue.push({ req, resolve })
      if (!this.active) this.showNext()
    })
  }

  private showNext(): void {
    const next = this.queue.shift()
    if (!next) return
    const ctx = this.ctx ?? this.shell.ctx
    if (!ctx) {
      next.resolve()
      this.showNext()
      return
    }
    const handle = { closing: false }
    const env: ModalEnv = {
      shell: this.shell,
      ctx,
      tooltip: this.tooltip,
      autoPick: () => this.autoPick,
      close: () => {
        handle.closing = true
      },
      sfx: (id, opts) => this.sfx(id, opts),
      openSettings: () => this.openSettings(),
    }
    let modal: Modal
    try {
      modal = this.createModal(next.req, env)
    } catch (err) {
      // A broken modal must never leave the game paused forever.
      console.error('[ui] modal failed to open', next.req.kind, err)
      next.resolve()
      this.showNext()
      return
    }
    this.active = { modal, resolve: next.resolve, handle }
    this.modalLayer.appendChild(modal.root)
    this.tooltip.hide()
    modal.shown()
  }

  private createModal(req: ModalRequest, env: ModalEnv): Modal {
    switch (req.kind) {
      case 'levelUp':
        return new LevelUpModal(env)
      case 'chest':
        return new ChestModal(env, req.offer)
      case 'shrine':
        return new ShrineModal(env, req.offers)
      case 'pause':
        return new PauseModal(env)
      case 'gameOver':
        return new EndModal(env, false)
      case 'victory':
        return new EndModal(env, true)
      case 'stageClear':
        return new StageClearModal(env, req.nextStage)
    }
  }

  /** Removes the open modal, resolves its promise and shows the next queued one. */
  private finishActive(): void {
    const a = this.active
    if (!a) return
    this.active = null
    this.tooltip.hide()
    try {
      a.modal.destroy()
    } catch (err) {
      console.error('[ui] modal cleanup failed', err)
    }
    const node = a.modal.root
    // The node lingers for its leave animation: make it unreachable, and drop
    // focus from it so a Space or Enter meant as a jump can't click a stale button.
    node.inert = true
    const focused = document.activeElement
    if (focused instanceof HTMLElement && node.contains(focused)) focused.blur()
    node.classList.add('leaving')
    window.setTimeout(() => node.remove(), MODAL_LEAVE_MS)
    a.resolve()
    this.showNext()
  }

  /** Closes everything at once (run teardown, end screen): no queued modal ever opens. */
  private flushModals(): void {
    const queued = this.queue
    this.queue = []
    for (const p of queued) p.resolve()
    const a = this.active
    if (!a) return
    this.active = null
    try {
      a.modal.destroy()
    } catch (err) {
      console.error('[ui] modal cleanup failed', err)
    }
    a.modal.root.remove()
    a.resolve()
  }

  // ─────────────────────────── settings ───────────────────────────

  private openSettings(): void {
    if (this.settings || this.disposed) return
    const f = document.activeElement
    this.settingsReturn = f instanceof HTMLElement && f !== document.body ? f : null
    const panel = new SettingsPanel(this.shell, () => this.closeSettings(), (id) => this.sfx(id), !!this.ctx)
    this.settings = panel
    this.settingsLayer.appendChild(panel.root)
    this.sfx('uiSelect')
    panel.shown()
  }

  private closeSettings(): void {
    const s = this.settings
    if (!s) return
    this.settings = null
    s.root.remove()
    // Hand keyboard focus back to whatever is underneath.
    if (this.active) this.active.modal.shown()
    else if (!this.shell.input.isTouch && this.settingsReturn?.isConnected) this.settingsReturn.focus({ preventScroll: true })
    this.settingsReturn = null
  }

  // ─────────────────────────── notices ───────────────────────────

  banner(text: string, sub?: string, color?: string): void {
    if (!this.disposed) this.notices.banner(text, sub, color)
  }

  toast(text: string, color?: string): void {
    if (!this.disposed) this.notices.toast(text, color)
  }

  // ─────────────────────────── frame ───────────────────────────

  update(dt: number): void {
    if (this.disposed) return
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0

    const a = this.active
    if (a && !a.handle.closing) {
      try {
        a.modal.update(step)
      } catch (err) {
        console.error('[ui] modal update failed', err)
        a.handle.closing = true
      }
    }
    if (this.active?.handle.closing) this.finishActive()

    const modal = this.modalOpen
    if (modal !== this.modalClass) {
      this.modalClass = modal
      this.root.classList.toggle('modal-up', modal)
    }

    const ctx = this.ctx
    if (ctx && !modal) {
      this.notices.update(step)
      this.hud.update(ctx, step, ctx.input.state.tabHeld && !this.settings)
    } else if (!ctx) {
      this.notices.update(step)
    }
    if (this.title.visible) this.title.update(step)

    const tab = !!ctx && this.hud.tabVisible
    if (tab !== this.tabClass) {
      this.tabClass = tab
      this.root.classList.toggle('tab-open', tab)
    }

    const wantTouch = !!ctx && !this.menuOpen && this.shell.input.isTouch
    if (wantTouch !== this.touchShown) {
      this.touchShown = wantTouch
      this.shell.input.setTouchControlsVisible(wantTouch)
    }
  }

  dispose(): void {
    if (this.disposed) return
    window.removeEventListener('keydown', this.onKeyDown, true)
    for (const off of this.unsubs) off()
    this.unsubs = []
    this.flushModals()
    this.closeSettings()
    this.notices.clear()
    this.hud.dispose()
    this.ctx = null
    this.disposed = true
    this.root.remove()
  }

  // ─────────────────────────── helpers ───────────────────────────

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    let used = false
    if (this.settings) used = this.settings.onKey(e)
    else if (this.active && !this.active.handle.closing) used = this.active.modal.onKey(e)
    else if (this.title.visible) used = this.title.onKey(e)
    if (used) e.preventDefault()
  }

  /**
   * UI sounds. In a run they go through the run's audio; on the title there is
   * no run, so the shell's own engine is used if it exposes one.
   */
  private sfx(id: SfxId, opts?: { volume?: number; pitch?: number }): void {
    const audio: AudioApi | undefined = this.shell.ctx?.audio ?? (this.shell as { audio?: AudioApi }).audio
    try {
      audio?.play(id, opts)
    } catch {
      // Sound is never worth breaking a menu over.
    }
  }
}
