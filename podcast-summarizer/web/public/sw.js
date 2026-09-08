/*
 * Offline support for PodBrief.
 *   - The app shell opens without a connection.
 *   - API responses are never cached here: job state must be live. Finished
 *     summaries are kept by the app itself in localStorage for offline reading.
 */
const VERSION = 'v1'
const SHELL_CACHE = `podbrief-shell-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n.startsWith('podbrief-') && n !== SHELL_CACHE).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    if (request.mode === 'navigate') {
      const shell = (await cache.match('./')) ?? (await cache.match('./index.html'))
      if (shell) return shell
    }
    throw error
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  return cached ?? (await network) ?? Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.pathname.includes('/api/')) return
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirst(request))
    return
  }
  event.respondWith(staleWhileRevalidate(request))
})
