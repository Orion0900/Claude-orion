import type { CharacterDef, SfxId, ShellApi } from '../game/types'
import { STAGES } from '../data/stages'
import { weaponDef } from './defs'
import { SHAKE, activateFocused, arrowDir, bouncyText, button, el, moveFocus, pulse, scrollIntoBox } from './dom'
import { bestStageLabel, formatCount, formatTime } from './format'

type View = 'main' | 'chars' | 'records'

interface CharCard {
  def: CharacterDef
  card: HTMLButtonElement
  art: HTMLDivElement
  lock: HTMLDivElement
}

const PORTRAIT_SIZE = 256
const LAST_KEY = 'bonkrush.lastCharacter'

/**
 * The title: logo and main menu, character select with portraits and
 * unlocks, and the records board. Settings open on top through `openSettings`.
 */
export class TitleScreen {
  readonly root: HTMLDivElement
  private view: View = 'main'
  private readonly main: HTMLDivElement
  private readonly chars: HTMLDivElement
  private readonly records: HTMLDivElement
  private readonly silverPills: HTMLSpanElement[] = []
  private readonly grid: HTMLDivElement
  private readonly footName: HTMLDivElement
  private readonly footDesc: HTMLDivElement
  private readonly start: HTMLButtonElement
  private readonly recordsBody: HTMLDivElement
  private readonly playBtn: HTMLButtonElement
  private cards: CharCard[] = []
  private selected: string
  /** Rendered portraits by character id; '' means rendering failed, keep the emoji. */
  private readonly portraits = new Map<string, string>()
  private shownFlag = false

  constructor(
    private readonly shell: ShellApi,
    parent: HTMLElement,
    private readonly sfx: (id: SfxId, opts?: { volume?: number; pitch?: number }) => void,
    private readonly openSettings: () => void,
  ) {
    this.root = el('div', 'title-screen hidden', undefined, parent)
    const last = readLast()
    this.selected = shell.characters.some((c) => c.id === last) ? (last as string) : (shell.characters[0]?.id ?? '')

    // Main menu.
    this.main = el('div', 'title-main', undefined, this.root)
    this.silverPill(el('div', 'title-top', undefined, this.main))
    const logoBox = el('div', 'logo-box', undefined, this.main)
    bouncyText('BONKRUSH', 'logo ol', logoBox)
    el('div', 'tagline ol', 'Run. Jump. Slide. Bonk everything.', logoBox)
    const menu = el('div', 'menu-col title-menu', undefined, this.main)
    this.playBtn = button('Play', 'btn-primary btn-huge', () => this.go('chars', true), menu)
    button('Characters', 'btn-purple', () => this.go('chars', false), menu)
    button('Settings', 'btn-blue', () => this.openSettings(), menu)
    button('Records', 'btn-green', () => this.go('records'), menu)
    el(
      'div',
      'title-hint',
      shell.input.isTouch
        ? 'Left thumb: move · Drag right: look · ⤒ jump · ⤓ slide · ✋ interact'
        : 'WASD move · Mouse look · Space jump · Shift slide · E interact · Tab stats · Esc pause',
      this.main,
    )

    // Character select.
    this.chars = el('div', 'title-chars hidden', undefined, this.root)
    const head = el('div', 'chars-head', undefined, this.chars)
    button('◀ Back', 'btn-ghost', () => this.go('main'), head)
    bouncyText('PICK YOUR BONKER', 'screen-title ol', head)
    this.silverPill(head)
    this.grid = el('div', 'char-grid', undefined, this.chars)
    const foot = el('div', 'chars-foot', undefined, this.chars)
    const info = el('div', 'chars-info', undefined, foot)
    this.footName = el('div', 'chars-info-name ol', '', info)
    this.footDesc = el('div', 'chars-info-desc', '', info)
    this.start = button('Start ▶', 'btn-primary btn-big', () => this.startOrUnlock(), foot)

    // Records.
    this.records = el('div', 'title-records hidden', undefined, this.root)
    const recPanel = el('div', 'panel records-panel', undefined, this.records)
    bouncyText('RECORDS', 'modal-title title-records-h ol', recPanel)
    this.recordsBody = el('div', 'records-body', undefined, recPanel)
    const recActions = el('div', 'modal-actions', undefined, recPanel)
    button('◀ Back', 'btn-primary btn-big', () => this.go('main'), recActions)

    this.buildCards()
  }

  get visible(): boolean {
    return this.shownFlag
  }

  show(): void {
    this.shownFlag = true
    this.root.classList.remove('hidden')
    this.go('main')
  }

  hide(): void {
    this.shownFlag = false
    this.root.classList.add('hidden')
  }

  /** Portraits render one per frame while the character grid is open, so it never hitches. */
  update(): void {
    if (!this.shownFlag || this.view !== 'chars') return
    for (const c of this.cards) {
      if (this.portraits.has(c.def.id)) continue
      const url = this.shell.renderPortrait(c.def.id, PORTRAIT_SIZE)
      this.portraits.set(c.def.id, url)
      if (url) this.setPortrait(c, url)
      return
    }
  }

  onKey(e: KeyboardEvent): boolean {
    if (!this.shownFlag) return false
    const panel = this.view === 'main' ? this.main : this.view === 'chars' ? this.chars : this.records
    if (e.key === 'Escape' || e.key === 'Backspace') {
      if (this.view === 'main') return false
      if (!e.repeat) this.go('main')
      return true
    }
    const dir = arrowDir(e)
    if (dir) {
      const scope = this.view === 'chars' && !(document.activeElement instanceof HTMLButtonElement && this.grid.contains(document.activeElement))
        ? this.grid
        : panel
      if (moveFocus(scope, dir)) this.sfx('uiMove', { volume: 0.5 })
      return true
    }
    if (e.repeat) return false
    if (activateFocused(panel, e)) return true
    if (e.key === 'Enter') {
      if (this.view === 'main') this.playBtn.click()
      else if (this.view === 'chars') this.startOrUnlock()
      return true
    }
    return false
  }

  private go(view: View, focusStart = false): void {
    this.view = view
    this.main.classList.toggle('hidden', view !== 'main')
    this.chars.classList.toggle('hidden', view !== 'chars')
    this.records.classList.toggle('hidden', view !== 'records')
    if (view !== 'main') this.sfx('uiSelect')
    this.refreshSilver()
    const touch = this.shell.input.isTouch
    if (view === 'main') {
      if (!touch) this.playBtn.focus({ preventScroll: true })
    } else if (view === 'chars') {
      this.refreshCards()
      const card = this.cards.find((c) => c.def.id === this.selected)
      if (!touch) (focusStart ? this.start : card?.card)?.focus({ preventScroll: true })
      if (card) scrollIntoBox(card.card, this.grid)
    } else {
      this.buildRecords()
      if (!touch) this.records.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
    }
  }

  private silverPill(parent: HTMLElement): void {
    const pill = el('div', 'silver-pill', undefined, parent)
    el('span', 'coin silver', undefined, pill)
    this.silverPills.push(el('span', 'silver-amount ol', '0', pill))
  }

  private refreshSilver(): void {
    const text = formatCount(this.shell.meta.silver)
    for (const s of this.silverPills) s.textContent = text
  }

  private buildCards(): void {
    this.grid.replaceChildren()
    this.cards = this.shell.characters.map((def, i) => {
      const card = el('button', 'char-card', undefined, this.grid)
      card.type = 'button'
      card.style.setProperty('--c1', def.colors.body)
      card.style.setProperty('--c2', def.colors.accent)
      card.style.setProperty('--c3', def.colors.detail)
      card.style.setProperty('--i', String(i))
      const art = el('div', 'char-art', undefined, card)
      el('span', 'char-emoji', def.icon, art)
      el('div', 'char-name ol', def.name, card)
      el('div', 'char-passive', def.passiveText, card)
      const w = weaponDef(def.startWeapon)
      const weapon = el('div', 'char-weapon', undefined, card)
      el('span', 'char-weapon-icon', w?.icon ?? '⚔️', weapon)
      el('span', '', w?.name ?? def.startWeapon, weapon)
      const lock = el('div', 'char-lock', undefined, card)
      el('span', 'char-lock-icon', '🔒', lock)
      const cost = el('span', 'char-lock-cost ol', formatCount(def.unlockCost), lock)
      cost.prepend(el('span', 'coin silver'))
      const entry: CharCard = { def, card, art, lock }
      card.addEventListener('click', () => {
        if (this.selected === def.id) this.startOrUnlock()
        else this.select(def.id)
      })
      card.addEventListener('focus', () => {
        this.select(def.id, false)
        scrollIntoBox(card, this.grid)
      })
      const cached = this.portraits.get(def.id)
      if (cached) this.setPortrait(entry, cached)
      return entry
    })
  }

  private setPortrait(c: CharCard, url: string): void {
    const img = el('img', 'char-portrait')
    img.alt = ''
    img.draggable = false
    img.src = url
    c.art.replaceChildren(img)
  }

  private select(id: string, sound = true): void {
    if (this.selected === id) return
    this.selected = id
    writeLast(id)
    if (sound) this.sfx('uiMove')
    this.refreshCards()
  }

  private refreshCards(): void {
    const silver = this.shell.meta.silver
    for (const c of this.cards) {
      const unlocked = this.shell.isUnlocked(c.def.id)
      c.card.classList.toggle('locked', !unlocked)
      c.card.classList.toggle('selected', c.def.id === this.selected)
      c.card.classList.toggle('affordable', !unlocked && silver >= c.def.unlockCost)
    }
    const def = this.shell.characters.find((c) => c.id === this.selected) ?? this.shell.characters[0]
    if (!def) return
    const unlocked = this.shell.isUnlocked(def.id)
    this.footName.textContent = `${def.icon} ${def.name}`
    this.footDesc.textContent = def.description
    this.start.replaceChildren()
    if (unlocked) {
      this.start.textContent = 'Start ▶'
      this.start.disabled = false
      this.start.classList.remove('btn-green')
    } else {
      this.start.append(`Unlock `)
      el('span', 'coin silver', undefined, this.start)
      this.start.append(` ${formatCount(def.unlockCost)}`)
      this.start.disabled = silver < def.unlockCost
      this.start.classList.add('btn-green')
    }
  }

  private startOrUnlock(): void {
    const def = this.shell.characters.find((c) => c.id === this.selected)
    if (!def) return
    if (this.shell.isUnlocked(def.id)) {
      this.sfx('uiSelect')
      this.shell.startRun(def.id)
      return
    }
    const card = this.cards.find((c) => c.def.id === def.id)
    if (this.shell.unlockCharacter(def.id)) {
      this.sfx('levelUp')
      this.refreshSilver()
      this.refreshCards()
      if (card) {
        card.card.classList.add('just-unlocked')
        pulse(card.card, [{ transform: 'scale(1)' }, { transform: 'scale(1.15) rotate(-2deg)' }, { transform: 'scale(1)' }], 500)
      }
    } else {
      this.sfx('hurt', { volume: 0.4 })
      if (card) pulse(card.card, SHAKE, 300)
      pulse(this.start, SHAKE, 300)
    }
  }

  private buildRecords(): void {
    const m = this.shell.meta
    const rows: Array<[string, string, string]> = [
      ['⏱️', 'Longest run', m.runs > 0 ? formatTime(m.bestTime) : '—'],
      ['💀', 'Most kills', m.runs > 0 ? formatCount(m.bestKills) : '—'],
      ['🏔️', 'Furthest', bestStageLabel(m.bestStage, STAGES.length, m.runs)],
      ['🎮', 'Runs played', formatCount(m.runs)],
      ['🥈', 'Silver', formatCount(m.silver)],
      ['🔓', 'Characters', `${this.shell.characters.filter((c) => this.shell.isUnlocked(c.id)).length} / ${this.shell.characters.length}`],
    ]
    this.recordsBody.replaceChildren()
    rows.forEach(([icon, label, value], i) => {
      const row = el('div', 'record-row', undefined, this.recordsBody)
      row.style.setProperty('--i', String(i))
      el('span', 'record-icon', icon, row)
      el('span', 'record-label', label, row)
      el('span', 'record-value ol', value, row)
    })
  }
}

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

function writeLast(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id)
  } catch {
    // A convenience only.
  }
}
