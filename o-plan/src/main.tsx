import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import App from './App'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support for the installed app. Registered relative to the page so
// it works both at a domain root and under a project sub-path. The artifact
// build is served as a single page and has nothing to cache.
if (import.meta.env.MODE !== 'artifact' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' }).catch(() => {
      // Offline support is a bonus; the app works fine without it.
    })
  })
}
