import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/montserrat/latin-800.css'
import '@fontsource/montserrat/latin-900.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { configureModelSource } from './transcribe/client'
import './styles.css'

// A mirror for the speech model, for tests or self-hosting:
// localStorage.setItem('cutline.modelHost', 'https://example.com/models/')
try {
  const host = localStorage.getItem('cutline.modelHost')
  if (host) configureModelSource({ remoteHost: host })
} catch {
  // No storage: use the default host.
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Offline support. Registered relative to the page so it works both at a
// domain root and under a project sub-path.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' }).catch(() => {
      // Offline support is a bonus; the app works fine without it.
    })
  })
}
