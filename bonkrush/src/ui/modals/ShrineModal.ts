import type { Offer } from '../../game/types'
import { runLookups } from '../defs'
import { activateFocused, arrowDir, bouncyText, button, digitKey, el, moveFocus } from '../dom'
import { describeOffer } from '../format'
import { offerCard, peekOnHold } from '../panels'
import { Modal, type ModalEnv } from './Modal'

const PICK_DELAY = 0.24

/** A charge shrine's reward: pick one of its stat boons. */
export class ShrineModal extends Modal {
  private cards: HTMLButtonElement[] = []
  private picked = false
  private closeIn = 0

  constructor(
    env: ModalEnv,
    private readonly offers: Offer[],
  ) {
    super(env, 'shrine')
    const golden = offers.length > 0 && offers.every((o) => o.rarity === 'legendary')
    if (golden) this.root.classList.add('golden')
    const head = el('div', 'modal-head', undefined, this.panel)
    bouncyText(golden ? 'GOLDEN SHRINE' : 'SHRINE BLESSING', 'modal-title title-shrine ol', head)
    el('div', 'modal-sub ol', 'Choose a boon', head)
    const row = el('div', 'card-row', undefined, this.panel)
    const look = runLookups(env.ctx)
    const touch = env.shell.input.isTouch
    this.cards = offers.map((offer, i) => {
      const card = offerCard(describeOffer(offer, look), i, touch ? '' : String(i + 1))
      peekOnHold(card, env.tooltip)
      card.addEventListener('click', () => this.choose(i))
      row.appendChild(card)
      return card
    })
    if (this.cards.length === 0) {
      el('div', 'card-empty ol', 'The shrine hums, then goes quiet.', row)
      const actions = el('div', 'modal-actions', undefined, this.panel)
      button('Continue', 'btn-primary', () => this.ready && env.close(), actions)
    }
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
    return e.key === ' ' || e.key === 'Enter'
  }

  protected override tick(dt: number): void {
    if (this.closeIn <= 0) return
    this.closeIn -= dt
    if (this.closeIn <= 0) this.env.close()
  }

  protected override auto(): void {
    if (this.cards.length > 0) this.choose(0)
    else this.env.close()
  }

  private choose(i: number): void {
    if (!this.ready || this.picked) return
    const offer = this.offers[i]
    if (!offer) return
    this.picked = true
    this.env.sfx('uiSelect')
    this.cards.forEach((c, k) => c.classList.add(k === i ? 'picked' : 'dismissed'))
    this.env.ctx.progression.applyOffer(offer)
    this.closeIn = PICK_DELAY
  }
}
