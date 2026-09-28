/**
 * Keyboard, mouse (pointer lock, with drag-to-look as the fallback) and
 * on-screen touch controls, folded into one `InputState` the game reads
 * each frame. The mapping maths lives in `intent.ts`.
 */
import type { InputApi, InputState } from '../game/types'
import {
  MOUSE_LOOK,
  SLIDE_MOUSE_BUTTON,
  TOUCH_LOOK,
  addLook,
  clampToRadius,
  isMouseSpike,
  isOneShot,
  joystickVector,
  keyIntent,
  moveFromKeys,
  type KeyIntent,
  type Vec2,
} from './intent'

const STICK_RADIUS = 60
const STICK_DEAD_ZONE = 0.12
/** The held right mouse button's entry in the held-keys map. */
const MOUSE_SLIDE = 'Mouse2'
/** `MouseEvent.buttons` bit for the right button. */
const RIGHT_BUTTON_BIT = 2

const STYLE = `
.bk-touch{position:fixed;inset:0;z-index:0;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
.bk-touch[hidden],.bk-touch [hidden]{display:none!important}
.bk-touch-zone{position:absolute;top:0;bottom:0;width:50%;pointer-events:auto;touch-action:none}
.bk-touch-move{left:0}
.bk-touch-look{right:0}
.bk-stick{position:absolute;left:0;top:0;width:${STICK_RADIUS * 2}px;height:${STICK_RADIUS * 2}px;margin:-${STICK_RADIUS}px 0 0 -${STICK_RADIUS}px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.4);box-shadow:0 0 12px rgba(0,0,0,.25);pointer-events:none;box-sizing:border-box}
.bk-stick-knob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.5);border:2px solid rgba(255,255,255,.8);box-sizing:border-box}
.bk-tbtn{position:absolute;display:flex;align-items:center;justify-content:center;margin:0;padding:0;box-sizing:border-box;pointer-events:auto;touch-action:none;-webkit-appearance:none;appearance:none;border-radius:50%;border:2px solid rgba(255,255,255,.55);background:rgba(20,16,42,.38);color:#fff;font:700 30px/1 system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.6);outline:none}
.bk-tbtn.on{background:rgba(255,255,255,.38);transform:scale(.93)}
.bk-tbtn-jump{width:88px;height:88px;font-size:40px;right:calc(env(safe-area-inset-right,0px) + 24px);bottom:calc(env(safe-area-inset-bottom,0px) + 32px)}
.bk-tbtn-slide{width:74px;height:74px;right:calc(env(safe-area-inset-right,0px) + 128px);bottom:calc(env(safe-area-inset-bottom,0px) + 22px)}
.bk-tbtn-interact{width:70px;height:70px;right:calc(env(safe-area-inset-right,0px) + 33px);bottom:calc(env(safe-area-inset-bottom,0px) + 138px);border-color:rgba(255,210,63,.9);background:rgba(255,210,63,.28)}
.bk-tbtn-pause{width:50px;height:50px;font-size:18px;left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 168px)}
`

export class Input implements InputApi {
  readonly state: InputState = {
    move: { x: 0, y: 0 },
    look: { yaw: 0, pitch: 0 },
    jumpPressed: false,
    jumpHeld: false,
    slideHeld: false,
    interactPressed: false,
    pausePressed: false,
    tabHeld: false,
  }

  private touch = false
  private wantLook = false
  private wasLocked = false
  private dragging = false
  private skipMove = false
  /**
   * A right press on the canvas (Slide) whose context menu hasn't fired yet.
   * Windows fires it on release, wherever the cursor is by then: over a
   * level-up card that opened mid-slide, say.
   */
  private slideMenuPending = false
  private sensitivity = 1
  private invertY = false
  /** Held keys by code, so releasing one of two Slide keys keeps sliding. */
  private readonly held = new Map<string, KeyIntent>()
  private readonly keyMove: Vec2 = { x: 0, y: 0 }
  private readonly stickMove: Vec2 = { x: 0, y: 0 }
  private readonly knob: Vec2 = { x: 0, y: 0 }
  private touchJump = false
  private touchSlide = false
  private stickId: number | null = null
  private stickX = 0
  private stickY = 0
  private lookId: number | null = null
  private lookX = 0
  private lookY = 0
  private readonly offs: Array<() => void> = []
  private readonly buttonResets: Array<() => void> = []
  /** Every per-pointer release handler, so a release anywhere on the page can reach them. */
  private readonly pointerEnds: Array<(e: PointerEvent) => void> = []

  private readonly root: HTMLDivElement
  private readonly stick: HTMLDivElement
  private readonly stickKnob: HTMLDivElement
  private readonly interactButton: HTMLButtonElement

  constructor(
    private readonly canvas: HTMLCanvasElement,
    overlay: HTMLElement,
  ) {
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

    // ── Touch layer: first in the UI layer so HUD and menus stack above it. ──
    this.root = el('div', 'bk-touch')
    this.root.hidden = true
    const style = document.createElement('style')
    style.textContent = STYLE
    const moveZone = el('div', 'bk-touch-zone bk-touch-move')
    const lookZone = el('div', 'bk-touch-zone bk-touch-look')
    this.stick = el('div', 'bk-stick')
    this.stickKnob = el('div', 'bk-stick-knob')
    this.stick.appendChild(this.stickKnob)
    this.stick.hidden = true
    const jump = button('bk-tbtn bk-tbtn-jump', '⤒', 'Jump')
    const slide = button('bk-tbtn bk-tbtn-slide', '⤓', 'Slide')
    this.interactButton = button('bk-tbtn bk-tbtn-interact', '✋', 'Interact')
    this.interactButton.hidden = true
    const pause = button('bk-tbtn bk-tbtn-pause', '❚❚', 'Pause')
    this.root.append(style, moveZone, lookZone, this.stick, jump, slide, this.interactButton, pause)
    overlay.insertBefore(this.root, overlay.firstChild)

    this.on(this.root, 'contextmenu', (e) => e.preventDefault())
    this.on(moveZone, 'pointerdown', this.onStickDown)
    this.on(moveZone, 'pointermove', this.onStickMove)
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.on(moveZone, type, this.onStickUp)
    this.on(lookZone, 'pointerdown', this.onLookDown)
    this.on(lookZone, 'pointermove', this.onLookMove)
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.on(lookZone, type, this.onLookUp)

    this.bindButton(
      jump,
      () => {
        this.state.jumpPressed = true
        this.touchJump = true
        this.refreshKeys()
      },
      () => {
        this.touchJump = false
        this.refreshKeys()
      },
    )
    this.bindButton(
      slide,
      () => {
        this.touchSlide = true
        this.refreshKeys()
      },
      () => {
        this.touchSlide = false
        this.refreshKeys()
      },
    )
    this.bindButton(this.interactButton, () => (this.state.interactPressed = true))
    this.bindButton(pause, () => (this.state.pausePressed = true))
    // Touches are captured implicitly, but a mouse or pen whose capture failed can
    // lift off somewhere else; hearing every release keeps nothing stuck down.
    this.pointerEnds.push(this.onStickUp, this.onLookUp)
    for (const type of ['pointerup', 'pointercancel']) this.on(window, type, this.onAnyPointerEnd)

    // ── Keyboard, mouse and focus ──
    this.on(window, 'keydown', this.onKeyDown)
    this.on(window, 'keyup', this.onKeyUp)
    this.on(window, 'blur', this.onBlur)
    this.on(window, 'mousemove', this.onMouseMove)
    this.on(window, 'mouseup', this.onMouseUp)
    this.on(window, 'touchstart', this.onAnyTouch, { passive: true, capture: true })
    this.on(window, 'mousedown', this.onAnyMouseDown, { capture: true })
    this.on(canvas, 'mousedown', this.onMouseDown)
    // The right button is Slide, so it must never open the browser menu.
    this.on(canvas, 'contextmenu', (e) => e.preventDefault())
    this.on(window, 'contextmenu', this.onContextMenu, { capture: true })
    this.on(document, 'pointerlockchange', this.onLockChange)
  }

  get isTouch(): boolean {
    return this.touch
  }

  /** Mouse look (locked or dragging), or a thumb resting on the touch look zone. */
  get looking(): boolean {
    return this.locked || this.dragging || this.lookId !== null
  }

  requestLook(): void {
    this.wantLook = true
    this.lock()
  }

  releaseLook(): void {
    this.wantLook = false
    this.dragging = false
    if (this.locked) document.exitPointerLock()
  }

  endFrame(): void {
    const s = this.state
    s.jumpPressed = false
    s.interactPressed = false
    s.pausePressed = false
    s.look.yaw = 0
    s.look.pitch = 0
  }

  configure(sensitivity: number, invertY: boolean): void {
    this.sensitivity = Number.isFinite(sensitivity) ? Math.max(0.05, sensitivity) : 1
    this.invertY = invertY
  }

  setTouchControlsVisible(visible: boolean): void {
    this.root.hidden = !visible
    if (!visible) this.releaseTouches()
  }

  /** Shows the touch Interact button only while something is in reach (the player calls this). */
  setInteractHint(visible: boolean): void {
    this.interactButton.hidden = !visible
  }

  dispose(): void {
    for (const off of this.offs) off()
    this.offs.length = 0
    this.releaseLook()
    this.root.remove()
  }

  // ─────────────────────────── keyboard ───────────────────────────

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTextEntry(e.target)) return
    const intent = keyIntent(e.code, e.key)
    if (!intent) return
    // Tab would move focus; Space and arrows would scroll or press a stray focused control.
    if (intent === 'tab' || ((intent === 'jump' || e.code.startsWith('Arrow')) && !isControl(e.target))) e.preventDefault()
    // Mid-run, a stray Ctrl/Cmd with a game key mustn't bookmark (D) or save the page (S).
    // Ctrl+W can't be stopped from a page, which is why Ctrl isn't bound at all.
    else if ((e.ctrlKey || e.metaKey) && this.wantLook) e.preventDefault()
    if (!(e.repeat && isOneShot(intent))) {
      if (intent === 'jump') this.state.jumpPressed = true
      else if (intent === 'interact') this.state.interactPressed = true
      else if (intent === 'pause') this.state.pausePressed = true
    }
    this.held.set(e.code || e.key, intent)
    this.refreshKeys()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (this.held.delete(e.code || e.key)) this.refreshKeys()
  }

  private onBlur = () => {
    this.held.clear()
    this.dragging = false
    this.slideMenuPending = false
    this.releaseTouches()
  }

  private refreshKeys(): void {
    let up = false
    let down = false
    let left = false
    let right = false
    let jump = false
    let slide = false
    let tab = false
    for (const intent of this.held.values()) {
      if (intent === 'up') up = true
      else if (intent === 'down') down = true
      else if (intent === 'left') left = true
      else if (intent === 'right') right = true
      else if (intent === 'jump') jump = true
      else if (intent === 'slide') slide = true
      else if (intent === 'tab') tab = true
    }
    moveFromKeys(up, down, left, right, this.keyMove)
    this.state.jumpHeld = jump || this.touchJump
    this.state.slideHeld = slide || this.touchSlide
    this.state.tabHeld = tab
    this.updateMove()
  }

  /** The thumbstick wins while a thumb is on it; otherwise the keys. */
  private updateMove(): void {
    const src = this.stickId !== null ? this.stickMove : this.keyMove
    this.state.move.x = src.x
    this.state.move.y = src.y
  }

  // ─────────────────────────── mouse ───────────────────────────

  private get locked(): boolean {
    return document.pointerLockElement === this.canvas
  }

  private lock(): void {
    if (this.locked || typeof this.canvas.requestPointerLock !== 'function') return
    try {
      // Newer browsers return a promise that rejects when refused; drag-to-look covers that.
      const result: unknown = this.canvas.requestPointerLock()
      if (result instanceof Promise) result.catch(() => undefined)
    } catch {
      // Refused or unsupported: drag-to-look still works.
    }
  }

  /** Runs before the canvas hears the press: an earlier Slide's menu is over by now. */
  private onAnyMouseDown = () => {
    this.slideMenuPending = false
  }

  private onContextMenu = (e: MouseEvent) => {
    if (!this.slideMenuPending) return
    this.slideMenuPending = false
    e.preventDefault()
  }

  private onMouseDown = (e: MouseEvent) => {
    this.syncMouseSlide(e.buttons)
    if (e.button === SLIDE_MOUSE_BUTTON) {
      e.preventDefault()
      this.slideMenuPending = true
      this.held.set(MOUSE_SLIDE, 'slide')
      this.refreshKeys()
    } else if (e.button !== 0) {
      return
    }
    if (this.wantLook && !this.locked) this.lock()
    if (!this.locked && e.button === 0) this.dragging = true
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked && !(this.dragging && (e.buttons & 1) !== 0)) return
    // The first event after locking carries the cursor's jump to the lock point.
    if (this.skipMove) {
      this.skipMove = false
      return
    }
    if (isMouseSpike(e.movementX, e.movementY)) return
    addLook(e.movementX, e.movementY, MOUSE_LOOK, this.sensitivity, this.invertY, this.state.look)
  }

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.dragging = false
    else if (e.button === SLIDE_MOUSE_BUTTON && this.held.delete(MOUSE_SLIDE)) this.refreshKeys()
  }

  /**
   * A right-button release we never heard (it happened outside the window)
   * shows up as a missing button on the next press. Moves aren't trusted for
   * this: some synthetic moves report no buttons while one is held.
   */
  private syncMouseSlide(buttons: number): void {
    if ((buttons & RIGHT_BUTTON_BIT) === 0 && this.held.delete(MOUSE_SLIDE)) this.refreshKeys()
  }

  private onLockChange = () => {
    const locked = this.locked
    // Browsers swallow the Esc that breaks pointer lock, so losing the lock we wanted is the pause key.
    if (!locked && this.wasLocked && this.wantLook) this.state.pausePressed = true
    if (locked && !this.wasLocked) {
      this.dragging = false
      this.skipMove = true
    }
    this.wasLocked = locked
  }

  // ─────────────────────────── touch ───────────────────────────

  private onAnyTouch = () => {
    this.touch = true
  }

  private onStickDown = (e: PointerEvent) => {
    this.notePointer(e)
    if (this.stickId !== null) return
    e.preventDefault()
    this.stickId = e.pointerId
    this.stickX = e.clientX
    this.stickY = e.clientY
    capture(e)
    this.stick.style.left = `${e.clientX}px`
    this.stick.style.top = `${e.clientY}px`
    this.stickKnob.style.transform = ''
    this.stick.hidden = false
    this.stickMove.x = 0
    this.stickMove.y = 0
    this.updateMove()
  }

  private onStickMove = (e: PointerEvent) => {
    if (e.pointerId !== this.stickId) return
    const dx = e.clientX - this.stickX
    const dy = e.clientY - this.stickY
    joystickVector(dx, dy, STICK_RADIUS, STICK_DEAD_ZONE, this.stickMove)
    clampToRadius(dx, dy, STICK_RADIUS, this.knob)
    this.stickKnob.style.transform = `translate(${this.knob.x}px,${this.knob.y}px)`
    this.updateMove()
  }

  private onStickUp = (e: PointerEvent) => {
    if (e.pointerId !== this.stickId) return
    this.endStick()
  }

  private endStick(): void {
    this.stickId = null
    this.stick.hidden = true
    this.stickMove.x = 0
    this.stickMove.y = 0
    this.updateMove()
  }

  private onLookDown = (e: PointerEvent) => {
    this.notePointer(e)
    if (this.lookId !== null) return
    e.preventDefault()
    this.lookId = e.pointerId
    this.lookX = e.clientX
    this.lookY = e.clientY
    capture(e)
  }

  private onLookMove = (e: PointerEvent) => {
    if (e.pointerId !== this.lookId) return
    addLook(e.clientX - this.lookX, e.clientY - this.lookY, TOUCH_LOOK, this.sensitivity, this.invertY, this.state.look)
    this.lookX = e.clientX
    this.lookY = e.clientY
  }

  private onLookUp = (e: PointerEvent) => {
    if (e.pointerId === this.lookId) this.lookId = null
  }

  private onAnyPointerEnd = (e: PointerEvent) => {
    for (const end of this.pointerEnds) end(e)
  }

  private bindButton(btn: HTMLButtonElement, press: () => void, release?: () => void): void {
    const pointers = new Set<number>()
    const down = (e: PointerEvent) => {
      this.notePointer(e)
      e.preventDefault()
      e.stopPropagation()
      const first = pointers.size === 0
      pointers.add(e.pointerId)
      capture(e)
      btn.classList.add('on')
      if (first) press()
    }
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId) || pointers.size > 0) return
      btn.classList.remove('on')
      release?.()
    }
    this.on(btn, 'pointerdown', down)
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.on(btn, type, up)
    this.pointerEnds.push(up)
    this.buttonResets.push(() => {
      pointers.clear()
      btn.classList.remove('on')
    })
  }

  private releaseTouches(): void {
    if (this.stickId !== null) this.endStick()
    this.lookId = null
    this.touchJump = false
    this.touchSlide = false
    for (const reset of this.buttonResets) reset()
    this.refreshKeys()
  }

  private notePointer(e: PointerEvent): void {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.touch = true
  }

  /** Adds a listener and remembers how to remove it. */
  private on<E extends Event>(target: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions): void {
    const listener = fn as unknown as EventListener
    target.addEventListener(type, listener, opts)
    this.offs.push(() => target.removeEventListener(type, listener, opts))
  }
}

function el(tag: 'div', className: string): HTMLDivElement {
  const node = document.createElement(tag)
  node.className = className
  return node
}

function button(className: string, glyph: string, label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = className
  b.textContent = glyph
  b.setAttribute('aria-label', label)
  b.tabIndex = -1
  return b
}

function capture(e: PointerEvent): void {
  try {
    ;(e.currentTarget as Element | null)?.setPointerCapture(e.pointerId)
  } catch {
    // Capture is a nicety; without it a finger that slides off just ends early.
  }
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true
  if (target instanceof HTMLInputElement) return !['range', 'checkbox', 'radio', 'button'].includes(target.type)
  return false
}

function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['BUTTON', 'INPUT', 'SELECT', 'A'].includes(target.tagName)
}
