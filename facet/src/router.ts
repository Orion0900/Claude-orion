import { useEffect, useState } from 'react'

/**
 * Screens are addressed by the URL hash, so the phone's back gesture and the
 * browser's back button walk back through them naturally.
 */
export type Route =
  | { name: 'home' }
  | { name: 'welcome' }
  | { name: 'new' }
  | { name: 'camera' }
  | { name: 'review'; id: string }
  | { name: 'report'; id: string; section?: string }
  | { name: 'profile'; id: string }
  | { name: 'history' }
  | { name: 'compare'; a: string; b: string }
  | { name: 'settings' }
  | { name: 'about' }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  switch (parts[0]) {
    case 'welcome':
      return { name: 'welcome' }
    case 'new':
      return { name: 'new' }
    case 'camera':
      return { name: 'camera' }
    case 'review':
      return parts[1] ? { name: 'review', id: parts[1] } : { name: 'home' }
    case 'report':
      return parts[1] ? { name: 'report', id: parts[1], section: parts[2] } : { name: 'home' }
    case 'profile':
      return parts[1] ? { name: 'profile', id: parts[1] } : { name: 'home' }
    case 'history':
      return { name: 'history' }
    case 'compare':
      return parts[1] && parts[2] ? { name: 'compare', a: parts[1], b: parts[2] } : { name: 'history' }
    case 'settings':
      return { name: 'settings' }
    case 'about':
      return { name: 'about' }
    default:
      return { name: 'home' }
  }
}

export function routeHash(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/'
    case 'review':
    case 'profile':
      return `#/${r.name}/${encodeURIComponent(r.id)}`
    case 'report':
      return `#/report/${encodeURIComponent(r.id)}${r.section ? `/${r.section}` : ''}`
    case 'compare':
      return `#/compare/${encodeURIComponent(r.a)}/${encodeURIComponent(r.b)}`
    default:
      return `#/${r.name}`
  }
}

/** How many screens deep we are within this visit, so Back never leaves the app. */
let depth = 0
if (typeof window !== 'undefined') window.addEventListener('popstate', () => (depth = Math.max(0, depth - 1)))

export function go(r: Route, replace = false) {
  const hash = routeHash(r)
  if (replace) history.replaceState(null, '', hash)
  else {
    history.pushState(null, '', hash)
    depth++
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function back(fallback: Route = { name: 'home' }) {
  if (depth > 0) history.back()
  else go(fallback, true)
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', on)
    window.addEventListener('popstate', on)
    return () => {
      window.removeEventListener('hashchange', on)
      window.removeEventListener('popstate', on)
    }
  }, [])
  return route
}
