import { el } from './dom'

/**
 * One floating tooltip for every `[data-tip]` element: hover or focus shows
 * it on desktop, a tap toggles it on touch (there is no hover there).
 */
export class Tooltip {
  readonly el: HTMLDivElement
  private readonly title: HTMLDivElement
  private readonly body: HTMLDivElement
  private target: HTMLElement | null = null

  constructor(parent: HTMLElement) {
    this.el = el('div', 'tooltip', undefined, parent)
    this.title = el('div', 'tooltip-title ol', '', this.el)
    this.body = el('div', 'tooltip-body', '', this.el)
  }

  /** Delegates tooltip listeners on `root`; returns the unbinder. */
  bind(root: HTMLElement): () => void {
    const find = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>('[data-tip]') : null)
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const t = find(e)
      if (t) this.show(t)
    }
    const out = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const t = find(e)
      if (t && t === this.target && !(e.relatedTarget instanceof Node && t.contains(e.relatedTarget))) this.hide()
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const t = find(e)
      if (t && t !== this.target) this.show(t)
      else this.hide()
    }
    const focusIn = (e: FocusEvent) => {
      const t = find(e)
      if (t) this.show(t)
    }
    const focusOut = () => this.hide()
    root.addEventListener('pointerover', over)
    root.addEventListener('pointerout', out)
    root.addEventListener('pointerdown', down)
    root.addEventListener('focusin', focusIn)
    root.addEventListener('focusout', focusOut)
    return () => {
      root.removeEventListener('pointerover', over)
      root.removeEventListener('pointerout', out)
      root.removeEventListener('pointerdown', down)
      root.removeEventListener('focusin', focusIn)
      root.removeEventListener('focusout', focusOut)
      if (this.target && root.contains(this.target)) this.hide()
    }
  }

  show(target: HTMLElement): void {
    this.target = target
    this.title.textContent = target.dataset.tipTitle ?? ''
    this.body.textContent = target.dataset.tip ?? ''
    this.el.style.setProperty('--tc', target.dataset.tipColor ?? '#ffd23f')
    this.el.classList.add('show')
    // Measure after the text is in, then keep it on screen.
    const r = target.getBoundingClientRect()
    const w = this.el.offsetWidth
    const h = this.el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = r.left + r.width / 2 - w / 2
    let y = r.top - h - 10
    if (y < 8) y = r.bottom + 10
    x = Math.max(8, Math.min(vw - w - 8, x))
    y = Math.max(8, Math.min(vh - h - 8, y))
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  }

  hide(): void {
    this.target = null
    this.el.classList.remove('show')
  }
}
