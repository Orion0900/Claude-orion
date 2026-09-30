import './styles.css'
import { createAudio } from './audio'
import { safeAudio } from './game/safeAudio'
import { bindKeyboard, InputHub, pollGamepads } from './engine/input'
import { Screen } from './engine/screen'
import { Game } from './game/Game'
import { boot } from './game/boot'

const root = document.getElementById('game')!
const hub = new InputHub()
bindKeyboard(hub)
const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
const screen = new Screen(root, hub, touch)
const audio = safeAudio(createAudio())
hub.onFirstInput = () => audio.unlock()
const game = new Game(screen.ctx, hub, audio)

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
    hub.tick()
    game.update()
    if (game.save) game.save.playSeconds += 1 / 60
    acc -= STEP
    steps++
  }
  if (steps === 4) acc = 0
  game.draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

void boot(game)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
