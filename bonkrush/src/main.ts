import { Game } from './game/Game'
import './styles.css'

const host = document.getElementById('game')
if (!host) throw new Error('Game host element not found')

new Game(host).start()

// Offline support. Registered relative to the page so it works both at a
// domain root and under a project sub-path.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' }).catch(() => {
      // Offline play is a bonus; the game works fine without it.
    })
  })
}
