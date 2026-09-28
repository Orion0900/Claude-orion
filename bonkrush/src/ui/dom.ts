/** Small DOM helpers shared by every screen. Text always goes in as textContent, never HTML. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  if (parent) parent.appendChild(node)
  return node
}

export function button(label: string, className: string, onClick: () => void, parent?: HTMLElement): HTMLButtonElement {
  const b = el('button', `btn ${className}`, label, parent)
  b.type = 'button'
  b.addEventListener('click', onClick)
  return b
}

/** Attaches tooltip text read by `Tooltip`. */
export function setTip(node: HTMLElement, title: string, body: string, color?: string): void {
  node.dataset.tipTitle = title
  node.dataset.tip = body
  if (color) node.dataset.tipColor = color
  else delete node.dataset.tipColor
}

/**
 * A springy one-shot animation through the Web Animations API, which runs on
 * the compositor and, unlike toggling a class, needs no forced reflow.
 */
export function pulse(node: HTMLElement, keyframes: Keyframe[], duration: number): void {
  if (typeof node.animate === 'function') node.animate(keyframes, { duration, easing: 'cubic-bezier(.2,.9,.3,1.4)' })
}

export const POP: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(1)' }]
export const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-3px)' },
  { transform: 'translateX(0)' },
]

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex="0"]'

function visible(node: HTMLElement): boolean {
  return node.offsetParent !== null || getComputedStyle(node).position === 'fixed'
}

/**
 * Arrow-key navigation: moves focus to the nearest focusable in `dir`
 * (weighting sideways drift double), or to the first one when nothing in
 * `root` has focus yet. Returns the newly focused element.
 */
export function moveFocus(root: HTMLElement, dir: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible)
  if (items.length === 0) return null
  const current = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
    ? document.activeElement
    : null
  if (!current) {
    focusInView(items[0])
    return items[0]
  }
  const a = current.getBoundingClientRect()
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const item of items) {
    if (item === current) continue
    const b = item.getBoundingClientRect()
    const dx = b.left + b.width / 2 - ax
    const dy = b.top + b.height / 2 - ay
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    if (along <= 1) continue
    const score = along + across * 2
    if (score < bestScore) {
      bestScore = score
      best = item
    }
  }
  if (best) focusInView(best)
  return best
}

/** The UI's own scroll boxes; nothing above them may scroll. */
const SCROLLERS = '.modal, .char-grid, .settings-screen, .title-records, .tab-panel'

/**
 * Focuses without the browser's scroll-into-view (which would also scroll the
 * game's overflow-hidden layers), then scrolls just the nearest UI scroll box
 * enough to show the element.
 */
export function focusInView(node: HTMLElement): void {
  node.focus({ preventScroll: true })
  const box = node.parentElement?.closest<HTMLElement>(SCROLLERS)
  if (box) scrollIntoBox(node, box)
}

/**
 * Scrolls `box` (and nothing else) just enough to show `node`. Uses layout
 * offsets rather than client rects, so entrance animations that transform the
 * node don't skew it; `box` must be positioned to sit in the offsetParent chain.
 */
export function scrollIntoBox(node: HTMLElement, box: HTMLElement): void {
  let top = 0
  let n: Element | null = node
  while (n instanceof HTMLElement && n !== box) {
    top += n.offsetTop
    n = n.offsetParent
  }
  if (n !== box) return
  const bottom = top + node.offsetHeight
  if (top < box.scrollTop) box.scrollTop = top - 16
  else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 16
}

/** Arrow key → direction, or null. */
export function arrowDir(e: KeyboardEvent): 'up' | 'down' | 'left' | 'right' | null {
  switch (e.key) {
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    default:
      return null
  }
}

/**
 * Enter/Space on a focused button inside `root`: clicked here, on keydown,
 * so the result doesn't depend on whether game input swallowed the default.
 */
export function activateFocused(root: HTMLElement, e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' && e.key !== ' ') return false
  const f = document.activeElement
  if (!(f instanceof HTMLButtonElement) || !root.contains(f) || f.disabled) return false
  f.click()
  return true
}

/** 1–9 from the top row or the numpad, else 0. */
export function digitKey(e: KeyboardEvent): number {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)
  if (m) return Number(m[1])
  return e.key >= '1' && e.key <= '9' && e.key.length === 1 ? Number(e.key) : 0
}

/**
 * Matches a square canvas's backing store to its CSS size × device pixel
 * ratio (capped at 2) and returns the CSS size. Reads layout, so call it
 * when a panel opens or now and then, not every frame.
 */
export function fitCanvas(canvas: HTMLCanvasElement): number {
  const size = canvas.clientWidth
  const px = Math.max(1, Math.round(size * Math.min(2, window.devicePixelRatio || 1)))
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px
    canvas.height = px
  }
  return size
}

/**
 * A heading whose letters bounce in one after another (`--i` staggers the CSS
 * animation). Letters sit in per-word wrappers so narrow screens wrap between
 * words, never inside one.
 */
export function bouncyText(text: string, className: string, parent?: HTMLElement): HTMLDivElement {
  const box = el('div', className, undefined, parent)
  box.setAttribute('aria-label', text)
  let i = 0
  text.split(' ').forEach((word, w) => {
    if (w > 0) {
      box.append(' ')
      i++
    }
    const ws = el('span', 'word', undefined, box)
    ws.setAttribute('aria-hidden', 'true')
    for (const ch of Array.from(word)) el('span', 'ch', ch, ws).style.setProperty('--i', String(i++))
  })
  return box
}

/** A button with a key-cap hint and a live count: "[R] Reroll 3". */
export function actionButton(
  label: string,
  key: string,
  className: string,
  onClick: () => void,
  parent?: HTMLElement,
): ActionButton {
  const btn = button('', className, onClick, parent)
  if (key) el('span', 'keycap', key, btn)
  const text = el('span', 'btn-label', label, btn)
  const count = el('span', 'btn-count', '', btn)
  return { btn, label: text, count }
}

export interface ActionButton {
  btn: HTMLButtonElement
  label: HTMLSpanElement
  count: HTMLSpanElement
}
