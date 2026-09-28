/** Building blocks shared by the pause menu, the Tab overlay and the end screens. */
import type { GameContext, StatBlock, StatId } from '../game/types'
import { RARITY_COLOR, RARITY_LABEL } from '../progression/rarity'
import { BASE_STATS, STAT_IDS, STAT_INFO, describeMod, formatStat } from '../progression/stats'
import { itemDef } from './defs'
import type { Tooltip } from './Tooltip'
import { el, onHold, setTip } from './dom'
import {
  STAT_ICON,
  barShares,
  formatCount,
  offerPeek,
  sumMods,
  weaponStatRows,
  type OfferView,
} from './format'

/** Stats where a bigger number is bad news for the player. */
const HIGHER_IS_WORSE: ReadonlySet<StatId> = new Set(['difficulty'])

/** Every stat, with a live value that only touches the DOM when it changes. */
export class StatList {
  readonly el: HTMLDivElement
  private readonly rows: HTMLDivElement[] = []
  private readonly values: HTMLSpanElement[] = []
  private readonly last: number[] = []

  constructor() {
    this.el = el('div', 'stat-list')
    for (const id of STAT_IDS) {
      const row = el('div', 'stat-row', undefined, this.el)
      el('span', 'stat-icon', STAT_ICON[id], row)
      el('span', 'stat-label', STAT_INFO[id].label, row)
      this.values.push(el('span', 'stat-value', '', row))
      this.rows.push(row)
      this.last.push(NaN)
    }
  }

  update(stats: Readonly<StatBlock>): void {
    for (let i = 0; i < STAT_IDS.length; i++) {
      const id = STAT_IDS[i]
      const v = stats[id]
      if (v === this.last[i]) continue
      this.last[i] = v
      this.values[i].textContent = formatStat(id, v)
      const diff = v - BASE_STATS[id]
      const better = HIGHER_IS_WORSE.has(id) ? diff < -1e-9 : diff > 1e-9
      const worse = HIGHER_IS_WORSE.has(id) ? diff > 1e-9 : diff < -1e-9
      this.rows[i].classList.toggle('up', better)
      this.rows[i].classList.toggle('down', worse)
    }
  }
}

function slot(parent: HTMLElement, icon: string, badge: string, color: string): HTMLDivElement {
  const s = el('div', 'inv-slot', undefined, parent)
  s.tabIndex = 0
  s.style.setProperty('--sc', color)
  el('span', 'inv-icon', icon, s)
  if (badge) el('span', 'inv-badge ol', badge, s)
  return s
}

/** Weapons, tomes and items with tooltips; a snapshot, rebuilt each time a panel opens. */
export function buildInventory(ctx: GameContext): HTMLDivElement {
  const root = el('div', 'inventory')

  const weapons = el('div', 'inv-section', undefined, root)
  el('div', 'inv-title ol', 'Weapons', weapons)
  const wRow = el('div', 'inv-row', undefined, weapons)
  for (const w of ctx.weapons.owned) {
    const s = slot(wRow, w.def.icon, `${w.level}`, w.def.color)
    const rows = weaponStatRows(ctx.weapons.effective(w))
      .map(([label, v]) => `${label}: ${v}`)
      .join('\n')
    setTip(s, `${w.def.name} · Lv ${w.level}`, `${w.def.description}\n\n${rows}\n\nDealt ${formatCount(w.dealt)} · ${formatCount(w.kills)} kills`, w.def.color)
  }
  for (let i = ctx.weapons.owned.length; i < ctx.weapons.maxSlots; i++) el('div', 'inv-slot empty', undefined, wRow)

  const tomes = el('div', 'inv-section', undefined, root)
  el('div', 'inv-title ol', 'Tomes', tomes)
  const tRow = el('div', 'inv-row', undefined, tomes)
  for (const t of ctx.progression.tomes) {
    const s = slot(tRow, t.def.icon, `${t.level}`, '#c86bff')
    const mods = sumMods(t.mods).map(describeMod).join('\n')
    setTip(s, `${t.def.name} · Lv ${t.level}`, mods || t.def.description, '#c86bff')
  }
  for (let i = ctx.progression.tomes.length; i < ctx.progression.maxTomes; i++) el('div', 'inv-slot empty', undefined, tRow)

  const items = el('div', 'inv-section', undefined, root)
  el('div', 'inv-title ol', 'Items', items)
  const iRow = el('div', 'inv-row wrap', undefined, items)
  for (const [id, stacks] of ctx.progression.items) {
    if (stacks <= 0) continue
    const def = itemDef(id)
    const color = def ? RARITY_COLOR[def.rarity] : '#ffffff'
    const s = slot(iRow, def?.icon ?? '🎁', stacks > 1 ? `×${stacks}` : '', color)
    s.classList.add('item')
    setTip(s, def?.name ?? id, `${def ? RARITY_LABEL[def.rarity] : ''}\n${def?.description ?? ''}`.trim(), color)
  }
  if (iRow.childElementCount === 0) el('div', 'inv-empty', 'No items yet — open chests!', iRow)
  return root
}

/** Damage by weapon as a bar list, biggest first. */
export function buildDamageBars(ctx: GameContext): HTMLDivElement {
  const root = el('div', 'dmg-bars')
  const owned = [...ctx.weapons.owned].sort((a, b) => b.dealt - a.dealt)
  const shares = barShares(owned.map((w) => w.dealt))
  owned.forEach((w, i) => {
    const row = el('div', 'dmg-row', undefined, root)
    row.style.setProperty('--i', String(i))
    el('span', 'dmg-icon', w.def.icon, row)
    const mid = el('div', 'dmg-mid', undefined, row)
    el('div', 'dmg-name', `${w.def.name} · Lv ${w.level}`, mid)
    const track = el('div', 'dmg-track', undefined, mid)
    const fill = el('div', 'dmg-fill', undefined, track)
    fill.style.setProperty('--w', String(shares[i]))
    fill.style.setProperty('--c', w.def.color)
    el('span', 'dmg-value ol', formatCount(w.dealt), row)
  })
  if (owned.length === 0) el('div', 'inv-empty', 'No weapons', root)
  return root
}

/** One level-up / shrine card. */
export function offerCard(view: OfferView, index: number, keyHint: string): HTMLButtonElement {
  const card = el('button', `card rarity-${view.rarity} kind-${view.kind}`)
  card.type = 'button'
  card.style.setProperty('--rc', RARITY_COLOR[view.rarity])
  card.style.setProperty('--i', String(index))
  if (keyHint) el('div', 'card-key', keyHint, card)
  el('div', 'card-rarity ol', RARITY_LABEL[view.rarity], card)
  el('div', 'card-icon', view.icon, card)
  const text = el('div', 'card-text', undefined, card)
  el('div', 'card-name ol', view.name, text)
  if (view.tag) el('div', `card-tag${view.isNew ? ' new' : ''}`, view.tag, text)
  if (view.lines.length) {
    const ul = el('ul', 'card-lines', undefined, text)
    for (const line of view.lines) el('li', '', line, ul)
  }
  if (view.description) {
    el('div', 'card-desc', view.description, text)
    // Short screens clamp the rules text; hovering still reads all of it.
    card.title = view.description
  }
  // Touch has no hover: holding the card shows this (see peekOnHold).
  setTip(card, view.name, offerPeek(view), RARITY_COLOR[view.rarity])
  return card
}

/**
 * Holding a card on touch shows its whole text beside it instead of taking
 * it; lifting the finger hides it again. Call before adding the card's click.
 */
export function peekOnHold(card: HTMLElement, tooltip: Tooltip): void {
  onHold(
    card,
    () => tooltip.show(card, true),
    () => tooltip.hide(),
  )
}
