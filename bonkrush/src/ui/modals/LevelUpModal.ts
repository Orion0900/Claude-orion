import type { Offer } from '../../game/types'
import { runLookups } from '../defs'
import { SHAKE, type ActionButton, actionButton, activateFocused, arrowDir, bouncyText, digitKey, el, moveFocus, pulse } from '../dom'
import { charges, describeOffer } from '../format'
import { offerCard, peekOnHold } from '../panels'
import { Modal, type ModalEnv } from './Modal'

/** Seconds the picked card flashes before the next round or the close. */
const PICK_DELAY = 0.24
const BANISH_DELAY = 0.3
/** Each new round of cards ignores picks this long, so mashing a key can't choose unseen. */
const ROUND_GUARD = 0.3

/**
 * Level-up: loops while level-ups are pending, one round of cards each.
 * Reroll, skip and banish spend the run's limited charges.
 */
export class LevelUpModal extends Modal {
  private offers: Offer[] = []
  private cards: HTMLButtonElement[] = []
  private banishing = false
  private busy = 0
  private next: (() => void) | null = null
  private roundAt = 0
  /**
   * Set once the modal has closed. Its node lingers for the leave animation,
   * and a stale click there (a Space tap on the still-focused card) must not
   * apply an offer again.
   */
  private done = false
  private readonly sub: HTMLDivElement
  private readonly row: HTMLDivElement
  private readonly hint: HTMLDivElement
  private readonly reroll: ActionButton
  private readonly skip: ActionButton
  private readonly banish: ActionButton

  constructor(env: ModalEnv) {
    super(env, 'levelup')
    const head = el('div', 'modal-head', undefined, this.panel)
    bouncyText('LEVEL UP!', 'modal-title title-levelup ol', head)
    this.sub = el('div', 'modal-sub ol', '', head)
    this.row = el('div', 'card-row', undefined, this.panel)
    const actions = el('div', 'modal-actions', undefined, this.panel)
    const touch = env.shell.input.isTouch
    this.reroll = actionButton('Reroll', touch ? '' : 'R', 'btn-blue', () => this.doReroll(), actions)
    this.skip = actionButton('Skip', touch ? '' : 'S', 'btn-ghost', () => this.doSkip(), actions)
    this.banish = actionButton('Banish', touch ? '' : 'B', 'btn-red', () => this.toggleBanish(), actions)
    // A click or tap leaves focus on the button; drop it so a later Space (jump) can't fire it again unseen.
    // Keyboard activation (detail 0) keeps focus so arrow-key players can repeat on purpose.
    for (const b of [this.reroll.btn, this.skip.btn, this.banish.btn]) {
      b.addEventListener('click', (e) => {
        if (e.detail > 0) b.blur()
      })
    }
    this.hint = el('div', 'modal-hint', '', this.panel)
    this.roll()
  }

  override onKey(e: KeyboardEvent): boolean {
    const n = digitKey(e)
    if (n > 0) {
      if (!e.repeat) this.choose(n - 1)
      return true
    }
    const dir = arrowDir(e)
    if (dir) {
      if (moveFocus(this.panel, dir)) this.env.sfx('uiMove', { volume: 0.5 })
      return true
    }
    if (!e.repeat && activateFocused(this.panel, e)) return true
    const action = this.keyAction(e.key.toLowerCase())
    if (action === undefined) return false
    if (action && !e.repeat) action()
    return true
  }

  /** The action for a key; null means "swallow it but do nothing", undefined means "not ours". */
  private keyAction(key: string): (() => void) | null | undefined {
    switch (key) {
      case 'r':
        return () => this.doReroll()
      case 's':
        return () => this.doSkip()
      case 'b':
        return () => this.toggleBanish()
      case 'escape':
        return this.banishing ? () => this.toggleBanish() : null
      case ' ':
      case 'enter':
        // Space is also jump: with nothing focused it must not pick blindly.
        return null
      default:
        return undefined
    }
  }

  protected override tick(dt: number): void {
    if (this.busy <= 0) return
    this.busy -= dt
    if (this.busy <= 0 && this.next) {
      const fn = this.next
      this.next = null
      fn()
    }
  }

  override destroy(): void {
    this.done = true
  }

  protected override auto(): void {
    if (this.busy > 0) return
    if (this.banishing) this.toggleBanish()
    if (this.cards.length > 0) this.choose(0)
    else this.doSkip()
  }

  private after(seconds: number, fn: () => void): void {
    this.busy = seconds
    this.next = fn
  }

  private roll(): void {
    const p = this.env.ctx.progression
    if (p.pendingLevelUps <= 0) {
      this.env.close()
      return
    }
    this.offers = p.rollLevelUpOffers()
    this.render()
  }

  private render(): void {
    const { ctx, shell } = this.env
    const p = ctx.progression
    const look = runLookups(ctx)
    const touch = shell.input.isTouch
    this.row.replaceChildren()
    this.roundAt = this.age
    this.cards = this.offers.map((offer, i) => {
      const card = offerCard(describeOffer(offer, look), i, touch ? '' : String(i + 1))
      peekOnHold(card, this.env.tooltip)
      card.addEventListener('click', () => this.choose(i))
      this.row.appendChild(card)
      return card
    })
    if (this.cards.length === 0) el('div', 'card-empty ol', 'Nothing left to learn!', this.row)
    const more = p.pendingLevelUps - 1
    this.sub.textContent = `Level ${p.level}${more > 0 ? ` · ${more} more to pick` : ''}`
    this.rearmAuto()
    this.refresh()
  }

  private refresh(): void {
    const p = this.env.ctx.progression
    const empty = this.cards.length === 0
    this.reroll.count.textContent = charges(p.rerolls)
    this.skip.count.textContent = empty ? '' : charges(p.skips)
    this.banish.count.textContent = charges(p.banishes)
    this.reroll.btn.disabled = p.rerolls <= 0
    this.skip.btn.disabled = !empty && p.skips <= 0
    this.banish.btn.disabled = empty || (p.banishes <= 0 && !this.banishing)
    this.skip.label.textContent = empty ? 'Continue' : 'Skip'
    this.banish.btn.classList.toggle('active', this.banishing)
    this.root.classList.toggle('banishing', this.banishing)
    this.hint.classList.toggle('warn', this.banishing)
    this.hint.textContent = this.banishing
      ? 'Banish a card: it never shows up again this run, and you get fresh cards'
      : this.env.shell.input.isTouch
        ? 'Tap a card to take it · hold one to read it all'
        : `Press 1–${Math.max(1, this.cards.length)} or click a card · skipping pays 20% of the level in gold`
  }

  private choose(i: number): void {
    if (this.done) return
    const roundReady = this.age - this.roundAt >= ROUND_GUARD || this.env.autoPick()
    if (!this.ready || !roundReady || this.busy > 0) return
    const offer = this.offers[i]
    const card = this.cards[i]
    if (!offer || !card) return
    if (this.banishing) {
      this.banishAt(i)
      return
    }
    this.env.sfx('uiSelect')
    this.cards.forEach((c, k) => c.classList.add(k === i ? 'picked' : 'dismissed'))
    this.env.ctx.progression.applyOffer(offer)
    this.after(PICK_DELAY, () => this.roll())
  }

  private banishAt(i: number): void {
    const p = this.env.ctx.progression
    const card = this.cards[i]
    if (!p.banish(this.offers[i])) {
      pulse(card, SHAKE, 260)
      return
    }
    this.env.sfx('explode', { volume: 0.4, pitch: 1.4 })
    card.classList.add('banished')
    this.cards.forEach((c, k) => k !== i && c.classList.add('dismissed'))
    // A banish doesn't use up the level-up: fresh cards for the same level.
    this.banishing = false
    this.after(BANISH_DELAY, () => this.roll())
  }

  private doReroll(): void {
    if (this.done || !this.ready || this.busy > 0) return
    const p = this.env.ctx.progression
    if (!p.useReroll()) {
      pulse(this.reroll.btn, SHAKE, 260)
      return
    }
    this.env.sfx('uiSelect', { pitch: 1.2 })
    this.banishing = false
    this.offers = p.rollLevelUpOffers()
    this.render()
  }

  private doSkip(): void {
    if (this.done || !this.ready || this.busy > 0) return
    const p = this.env.ctx.progression
    const empty = this.cards.length === 0
    if (!empty && p.skips <= 0) {
      pulse(this.skip.btn, SHAKE, 260)
      return
    }
    this.env.sfx('uiMove')
    this.banishing = false
    p.skipLevelUp()
    this.cards.forEach((c) => c.classList.add('dismissed'))
    this.after(PICK_DELAY * 0.6, () => this.roll())
  }

  private toggleBanish(): void {
    if (this.done || !this.ready || this.busy > 0) return
    const p = this.env.ctx.progression
    if (!this.banishing && (p.banishes <= 0 || this.cards.length === 0)) {
      pulse(this.banish.btn, SHAKE, 260)
      return
    }
    this.banishing = !this.banishing
    this.env.sfx('uiMove')
    this.refresh()
  }
}
