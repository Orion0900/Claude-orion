/*
 * Offline support for Tidebound. The game has no server and no network
 * assets, so everything it needs is its own shell: cache it as it's used
 * and the adventure goes wherever you do.
 */
const VERSION = 'v1'
const CACHE = `tidebound-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((name) => name.startsWith('tidebound-') && name !== CACHE).map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

/** Network first for pages so a deploy shows up; cache first for hashed assets. */
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
