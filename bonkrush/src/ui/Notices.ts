import { el } from './dom'

const BANNER_TIME = 2.4
const BANNER_QUEUE = 3
const TOAST_TIME = 3.2
const TOAST_MAX = 5
/** Length of the leave animations in styles.css. */
const LEAVE_MS = 260

interface Banner {
  text: string
  sub: string
  color: string
}

interface Toast {
  node: HTMLDivElement
  life: number
}

/**
 * Banners (one at a time, the rest queued) and toasts (a short stack that
 * drops the oldest). Timers run on `update`, which the UI pauses while a modal
 * is up so nothing expires unseen behind it.
 */
export class Notices {
  private readonly bannerHost: HTMLDivElement
  private readonly toastHost: HTMLDivElement
  private banners: Banner[] = []
  private current: HTMLDivElement | null = null
  private bannerLife = 0
  private toasts: Toast[] = []

  constructor(parent: HTMLElement) {
    this.bannerHost = el('div', 'banners', undefined, parent)
    this.toastHost = el('div', 'toasts', undefined, parent)
  }

  banner(text: string, sub = '', color = '#ffd23f'): void {
    // Repeats of the same banner (e.g. two systems announcing one event) collapse.
    const last = this.banners[this.banners.length - 1]
    if (last?.text === text || (this.current && !last && this.current.dataset.text === text)) return
    if (this.banners.length >= BANNER_QUEUE) this.banners.shift()
    this.banners.push({ text, sub, color })
    if (!this.current) this.nextBanner()
  }

  toast(text: string, color = '#ffffff'): void {
    const node = el('div', 'toast ol', text)
    node.style.setProperty('--tc', color)
    this.toastHost.appendChild(node)
    this.toasts.push({ node, life: TOAST_TIME })
    while (this.toasts.length > TOAST_MAX) this.dropToast(0)
  }

  update(dt: number): void {
    if (this.current) {
      this.bannerLife -= dt
      if (this.bannerLife <= 0) {
        leave(this.current)
        this.current = null
        this.nextBanner()
      }
    }
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i]
      t.life -= dt
      if (t.life <= 0) this.dropToast(i)
    }
  }

  clear(): void {
    this.banners = []
    this.current = null
    this.bannerLife = 0
    this.toasts = []
    this.bannerHost.replaceChildren()
    this.toastHost.replaceChildren()
  }

  private nextBanner(): void {
    const b = this.banners.shift()
    if (!b) return
    const node = el('div', 'banner')
    node.dataset.text = b.text
    node.style.setProperty('--bc', b.color)
    el('div', 'banner-text ol', b.text, node)
    if (b.sub) el('div', 'banner-sub ol', b.sub, node)
    this.bannerHost.appendChild(node)
    this.current = node
    this.bannerLife = BANNER_TIME
  }

  private dropToast(i: number): void {
    const [t] = this.toasts.splice(i, 1)
    if (t) leave(t.node)
  }
}

/** Plays the CSS leave animation, then removes the node. */
function leave(node: HTMLElement): void {
  node.classList.add('leaving')
  window.setTimeout(() => node.remove(), LEAVE_MS)
}
