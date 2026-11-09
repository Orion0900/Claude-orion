import './styles.css'
import { createAudio } from './audio'
import { safeAudio } from './game/safeAudio'
import { bindKeyboard, InputHub, pollGamepads } from './engine/input'
import { Screen } from './engine/screen'
import { isIOS, isTouchDevice } from './engine/platform'
import { AutoSave } from './game/autosave'
import { Game } from './game/Game'
import { boot } from './game/boot'

const root = document.getElementById('game')!
const hub = new InputHub()
bindKeyboard(hub)
const touch = isTouchDevice()
const screen = new Screen(root, hub, touch)
const audio = safeAudio(createAudio())
// Sound may only start inside a gesture, and iOS only counts the end of a
// touch, so every tap, click or key gets the chance.
for (const type of ['touchend', 'pointerup', 'click', 'keydown']) window.addEventListener(type, () => audio.unlock(), { capture: true })
document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden))
window.addEventListener('pagehide', () => audio.setHidden(true))
window.addEventListener('pageshow', () => audio.setHidden(document.hidden))
const game = new Game(screen.ctx, hub, audio)

const params = new URLSearchParams(location.search)
const autosave = !params.has('quick') || params.has('autosave') ? new AutoSave(game) : null
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autosave?.flush()
})
window.addEventListener('pagehide', () => autosave?.flush())
if (isIOS()) void navigator.storage?.persist?.().catch(() => false)

// Taps: menus take taps on their items; anywhere else it's A.
let tapAt: { x: number; y: number } | null = null
screen.canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  tapAt = screen.toGame(e.clientX, e.clientY)
})

// A fixed 60 Hz simulation, drawn once per display frame.
const STEP = 1000 / 60
let last = performance.now()
let acc = 0
function frame(now: number): void {
  acc += Math.min(250, now - last)
  last = now
  let steps = 0
  while (acc >= STEP && steps < 4) {
    pollGamepads(hub)
    if (tapAt) {
      const { x, y } = tapAt
      tapAt = null
      if (!game.tap(x, y)) {
        hub.set('a', true, 'tap')
        hub.set('a', false, 'tap')
      }
    }
    hub.tick()
    game.update()
    if (game.save) game.save.playSeconds += 1 / 60
    autosave?.tick()
    acc -= STEP
    steps++
  }
  if (steps === 4) acc = 0
  game.draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

void boot(game)

// For tests and the curious: the running game.
;(window as unknown as { game: Game }).game = game

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
