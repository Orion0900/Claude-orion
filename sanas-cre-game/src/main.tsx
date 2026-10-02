import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/big-shoulders-display/latin-700'
import '@fontsource/big-shoulders-display/latin-900'
import '@fontsource/ibm-plex-sans/latin-400'
import '@fontsource/ibm-plex-sans/latin-500'
import '@fontsource/ibm-plex-sans/latin-600'
import '@fontsource/ibm-plex-mono/latin-500'
import App from './App'
import type { GameState } from './engine/types'
import './styles.css'

interface HotHost {
  ready?: (start: (data: { save?: GameState | null }) => void) => void
  data?: { save?: GameState | null }
}

function start(data: { save?: GameState | null } = {}) {
  const container = document.getElementById('root')
  if (!container) throw new Error('Root element not found')
  createRoot(container).render(
    <StrictMode>
      <App restored={data.save ?? null} />
    </StrictMode>,
  )
}

// A host that can update the page in place hands the last career back. If
// it never answers, the game starts anyway from what this browser saved.
const host = (window as Window & { claude?: { hot?: HotHost } }).claude?.hot
let started = false
const boot = (data?: { save?: GameState | null }) => {
  if (started) return
  started = true
  start(data ?? {})
}
if (host?.ready) {
  host.ready(boot)
  setTimeout(() => boot(host.data), 2000)
} else boot(host?.data)

// Offline support comes with the installable build, the one with a manifest.
// Registered relative to the page so it works both at a domain root and under
// a project sub-path.
if ('serviceWorker' in navigator && document.querySelector('link[rel="manifest"]')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' }).catch(() => {
      // Offline support is a bonus; the game works fine without it.
    })
  })
}
