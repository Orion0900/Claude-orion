import { SCREEN_H, SCREEN_W } from './gfx'
import type { Button, InputHub } from './input'

/**
 * The page layout: the 240×160 screen scaled up crisp, and on touch devices
 * an on-screen D-pad and buttons laid out like a handheld — below the screen
 * when the phone is upright, either side of it when it's sideways.
 */
export class Screen {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  private readonly root: HTMLElement
  private readonly pad: HTMLElement | null

  constructor(root: HTMLElement, hub: InputHub, touch: boolean) {
    this.root = root
    root.classList.add('shell')
    this.canvas = document.createElement('canvas')
    this.canvas.width = SCREEN_W
    this.canvas.height = SCREEN_H
    this.canvas.className = 'lcd'
    root.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d', { alpha: false })!
    this.ctx.imageSmoothingEnabled = false
    this.pad = touch ? buildTouchPad(root, hub) : null
    if (touch) root.classList.add('touch')
    const relayout = () => this.layout()
    window.addEventListener('resize', relayout)
    window.addEventListener('orientationchange', relayout)
    this.layout()
  }

  /** Picks the biggest crisp scale that fits, leaving room for the touch pad. */
  layout(): void {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const portrait = vh > vw
    this.root.classList.toggle('portrait', !!this.pad && portrait)
    this.root.classList.toggle('landscape', !!this.pad && !portrait)
    let availW = vw
    let availH = vh
    if (this.pad) {
      if (portrait) availH = vh * 0.58
      else availW = vw - 2 * Math.min(190, vw * 0.22)
    }
    const fit = Math.min(availW / SCREEN_W, availH / SCREEN_H)
    // Whole-number scales keep every pixel the same size; below 2× take what fits.
    const scale = fit >= 2 ? Math.floor(fit) : Math.max(1, fit)
    this.canvas.style.width = `${Math.floor(SCREEN_W * scale)}px`
    this.canvas.style.height = `${Math.floor(SCREEN_H * scale)}px`
  }
}

function buildTouchPad(root: HTMLElement, hub: InputHub): HTMLElement {
  const pad = document.createElement('div')
  pad.className = 'pad'
  pad.innerHTML = `
    <div class="dpad">
      <div class="dpad-cross"></div>
    </div>
    <div class="face">
      <button class="btn btn-b" data-b="b" aria-label="B">B</button>
      <button class="btn btn-a" data-b="a" aria-label="A">A</button>
    </div>
    <div class="meta">
      <button class="pill" data-b="select" aria-label="Select">SELECT</button>
      <button class="pill" data-b="start" aria-label="Start">START</button>
    </div>`
  root.appendChild(pad)

  // Face buttons: each touch holds its button until it lifts.
  for (const el of pad.querySelectorAll<HTMLElement>('[data-b]')) {
    const b = el.dataset.b as Button
    const down = (e: Event) => {
      e.preventDefault()
      el.classList.add('on')
      hub.set(b, true, `touch-${b}`)
    }
    const up = (e: Event) => {
      e.preventDefault()
      el.classList.remove('on')
      hub.set(b, false, `touch-${b}`)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', up)
    el.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  // The D-pad reads the direction from where the thumb is, so sliding the
  // thumb round changes direction without lifting it.
  const dpad = pad.querySelector<HTMLElement>('.dpad')!
  const cross = pad.querySelector<HTMLElement>('.dpad-cross')!
  let active: number | null = null
  const setDir = (dir: Button | null) => {
    for (const d of ['up', 'down', 'left', 'right'] as const) hub.set(d, d === dir, 'touch-dpad')
    cross.dataset.dir = dir ?? ''
  }
  const track = (e: PointerEvent) => {
    const r = dpad.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    if (Math.hypot(dx, dy) < r.width * 0.12) return setDir(null)
    setDir(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down')
  }
  dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    active = e.pointerId
    dpad.setPointerCapture(e.pointerId)
    track(e)
  })
  dpad.addEventListener('pointermove', (e) => {
    if (e.pointerId === active) track(e)
  })
  const release = (e: PointerEvent) => {
    if (e.pointerId !== active) return
    active = null
    setDir(null)
  }
  dpad.addEventListener('pointerup', release)
  dpad.addEventListener('pointercancel', release)
  dpad.addEventListener('contextmenu', (e) => e.preventDefault())
  return pad
}
