import type { GameContext, SfxId, ShellApi } from '../../game/types'
import type { Tooltip } from '../Tooltip'
import { el } from '../dom'

/** What a modal may ask of the UI around it. */
export interface ModalEnv {
  readonly shell: ShellApi
  readonly ctx: GameContext
  readonly tooltip: Tooltip
  /** Read live: tests can switch it on while a modal is already up. */
  autoPick(): boolean
  /**
   * Ends the modal. The UI finishes the close on its next update, so the
   * game never resumes inside the key event that closed it (the same Space or
   * Esc would otherwise jump or re-pause).
   */
  close(): void
  sfx(id: SfxId, opts?: { volume?: number; pitch?: number }): void
  /** Opens the settings panel on top of this modal. */
  openSettings(): void
}

/** Delay before autoPick chooses, seconds. */
export const AUTO_PICK_DELAY = 0.25
/**
 * Choices are ignored this long after a modal opens, so a key already held
 * for jumping or a mid-fight click can't pick a card unseen.
 */
export const INPUT_GUARD = 0.35

export abstract class Modal {
  readonly root: HTMLDivElement
  protected readonly panel: HTMLDivElement
  protected age = 0
  /** Focused once the modal is in the document (keyboard players only). */
  protected initialFocus: HTMLElement | null = null
  private autoIn = AUTO_PICK_DELAY

  constructor(
    protected readonly env: ModalEnv,
    kind: string,
  ) {
    this.root = el('div', `modal modal-${kind}`)
    this.panel = el('div', 'modal-panel', undefined, this.root)
  }

  protected get ready(): boolean {
    return this.age >= INPUT_GUARD || this.env.autoPick()
  }

  /** Restarts the autoPick countdown (e.g. for the next level-up round). */
  protected rearmAuto(): void {
    this.autoIn = AUTO_PICK_DELAY
  }

  /** Called by the UI right after the modal is mounted. */
  shown(): void {
    if (this.initialFocus && !this.env.shell.input.isTouch) this.initialFocus.focus({ preventScroll: true })
  }

  /** Returns true when the key was used, so the UI can swallow its default. */
  onKey(_e: KeyboardEvent): boolean {
    return false
  }

  update(dt: number): void {
    this.age += dt
    if (this.env.autoPick()) {
      this.autoIn -= dt
      if (this.autoIn <= 0) {
        this.autoIn = AUTO_PICK_DELAY
        this.auto()
      }
    }
    this.tick(dt)
  }

  /** Per-frame animation hook. */
  protected tick(_dt: number): void {}

  /** What autoPick does; the default stays open. */
  protected auto(): void {}

  /** Called once when the modal leaves; clear anything that outlives the DOM. */
  destroy(): void {}
}
