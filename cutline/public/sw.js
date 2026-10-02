/*
 * Offline support for Cutline. Editing happens entirely on the phone, so
 * once the app and the speech model have loaded once, it works without a
 * signal. The app shell is cached as it's used; the speech model is cached
 * by the transcription library itself, and calls to Claude are never cached.
 */
const VERSION = 'v1'
const CACHE = `cutline-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name.startsWith('cutline-') && name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

/** Network first for pages so a deploy shows up; cache first for hashed assets and the runtime. */
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }
  if (url.origin !== self.location.origin) return
  // Range requests (video scrubbing) go straight to the network or blob store.
  if (request.headers.has('range')) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      if (request.mode === 'navigate') {
        try {
          const response = await fetch(request)
          if (response.ok) cache.put(request, response.clone())
          return response
        } catch (error) {
          const cached = (await cache.match(request)) ?? (await cache.match('./')) ?? (await cache.match('./index.html'))
          if (cached) return cached
          throw error
        }
      }
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    })(),
  )
})
