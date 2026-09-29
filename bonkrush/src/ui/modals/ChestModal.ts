import type { Offer, Rarity } from '../../game/types'
import { RARITY_COLOR, RARITY_LABEL } from '../../progression/rarity'
import { runLookups } from '../defs'
import { button, el } from '../dom'
import { RARITY_PITCH, describeOffer } from '../format'
import { Modal, type ModalEnv } from './Modal'

/** Better loot makes you wait a little longer for it. */
const SHAKE_TIME: Record<Rarity, number> = {
  common: 0.8,
  uncommon: 0.85,
  rare: 0.95,
  epic: 1.15,
  legendary: 1.4,
}
/** From the burst to the item popping out. */
const BURST_TIME = 0.28
const SPARKS = 14

/**
 * The chest opening: it shakes (glowing its rarity through the seams), bursts,
 * and the item rises in a beam of its rarity colour. The item is already in
 * the inventory; this only shows it.
 */
export class ChestModal extends Modal {
  private phase: 'shake' | 'burst' | 'reveal' = 'shake'
  private t = 0
  private readonly shakeTime: number
  private readonly rarity: Rarity
  private readonly take: HTMLButtonElement

  constructor(env: ModalEnv, offer: Offer) {
    super(env, 'chest')
    const view = describeOffer(offer, runLookups(env.ctx))
    this.rarity = view.rarity
    this.shakeTime = SHAKE_TIME[view.rarity] ?? 0.9
    this.root.classList.add(`rarity-${view.rarity}`)
    this.root.style.setProperty('--rc', RARITY_COLOR[view.rarity])
    this.root.style.setProperty('--shake', `${this.shakeTime}s`)

    const scene = el('div', 'chest-scene', undefined, this.panel)
    el('div', 'chest-beam', undefined, scene)
    el('div', 'chest-flash', undefined, scene)
    const chest = el('div', 'chest', undefined, scene)
    const lid = el('div', 'chest-lid', undefined, chest)
    el('div', 'chest-band', undefined, lid)
    const body = el('div', 'chest-body', undefined, chest)
    el('div', 'chest-band', undefined, body)
    el('div', 'chest-lock', undefined, chest)
    el('div', 'chest-glow', undefined, chest)
    const sparks = el('div', 'chest-sparks', undefined, scene)
    for (let i = 0; i < SPARKS; i++) {
      const s = el('i', '', undefined, sparks)
      // Cosmetic spread only.
      s.style.setProperty('--a', `${(i / SPARKS) * 360 + Math.random() * 20}deg`)
      s.style.setProperty('--d', `${90 + Math.random() * 70}px`)
    }

    const reveal = el('div', 'chest-reveal', undefined, this.panel)
    el('div', 'reveal-rarity ol', RARITY_LABEL[view.rarity], reveal)
    el('div', 'reveal-icon', view.icon, reveal)
    el('div', 'reveal-name ol', view.name, reveal)
    if (view.tag) el('div', `reveal-tag${view.isNew ? ' new' : ''}`, view.tag, reveal)
    if (view.description) el('div', 'reveal-desc', view.description, reveal)
    for (const line of view.lines) el('div', 'reveal-line', line, reveal)
    this.take = button('Take', 'btn-primary btn-big', () => this.onTake(), reveal)
    if (!env.shell.input.isTouch) el('div', 'modal-hint', 'Space / Enter', reveal)

    this.panel.addEventListener('click', (e) => {
      if (this.phase !== 'reveal' && e.target !== this.take) this.onTake()
    })
    env.sfx('chest')
  }

  override onKey(e: KeyboardEvent): boolean {
    if (e.key !== ' ' && e.key !== 'Enter') return false
    if (!e.repeat) this.onTake()
    return true
  }

  protected override tick(dt: number): void {
    this.t += dt
    if (this.phase === 'shake' && this.t >= this.shakeTime) this.burst()
    else if (this.phase === 'burst' && this.t >= this.shakeTime + BURST_TIME) this.reveal()
  }

  protected override auto(): void {
    if (this.phase !== 'reveal') this.reveal()
    this.env.close()
  }

  private onTake(): void {
    if (!this.ready) return
    if (this.phase !== 'reveal') {
      // Impatient players skip straight to the loot.
      this.reveal()
      return
    }
    this.env.sfx('uiSelect')
    this.env.close()
  }

  private burst(): void {
    this.phase = 'burst'
    this.root.classList.add('burst')
  }

  private reveal(): void {
    if (this.phase === 'shake') this.burst()
    this.phase = 'reveal'
    this.t = Math.max(this.t, this.shakeTime + BURST_TIME)
    this.root.classList.add('revealed')
    this.env.sfx('rarity', { pitch: RARITY_PITCH[this.rarity] ?? 1 })
    this.take.focus({ preventScroll: true })
  }
}
