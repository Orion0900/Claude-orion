import { App } from './app/App'
import './styles.css'

const root = document.getElementById('app')
if (!root) throw new Error('App root not found')

const app = new App(root)
app.start()
// A handle for the browser checks.
;(window as unknown as { __fretfire: App }).__fretfire = app

// Offline support, registered relative to the page so it works under a sub-path.
if ('serviceWorker' in navigator && import.meta.env.PROD && window.self === window.top) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' }).catch(() => {
      // Offline play is a bonus; the game works without it.
    })
  })
}
