/*
 * Offline support for CaddieIQ.
 *
 * Two rules decide everything here:
 *   - The app itself should open without a connection.
 *   - Course data must never come from a cache. A hole layout is an
 *     answer to a specific place, and a stale one is worse than an error.
 */
const VERSION = 'v1'
const SHELL_CACHE = `caddieiq-shell-${VERSION}`
const TILE_CACHE = `caddieiq-tiles-${VERSION}`

/** Map tiles are big; keep a useful window of them, not everything ever seen. */
const MAX_TILES = 400

const TILE_HOSTS = ['tile.openstreetmap.org']
/** Hosts whose answers are route-specific and must always be live. */
const LIVE_ONLY_HOSTS = ['overpass-api.de', 'overpass.kumi.systems']

self.addEventListener('install', (event) => {
  // The shell is cached as it's used; take over as soon as we're ready.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('caddieiq-') && !name.endsWith(VERSION))
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  // Oldest first: keys() returns insertion order.
  for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i])
}

/** Network first, falling back to whatever we last saw. Used for the app shell. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    // A navigation with nothing cached still deserves the app, not a browser error.
    if (request.mode === 'navigate') {
      const shell = await cache.match('./') ?? await cache.match('./index.html')
      if (shell) return shell
    }
    throw error
  }
}

/** Serve instantly from cache, refresh in the background. Used for assets. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  return cached ?? (await network) ?? Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  if (LIVE_ONLY_HOSTS.some((host) => url.hostname.endsWith(host))) return

  if (TILE_HOSTS.some((host) => url.hostname.endsWith(host))) {
    event.respondWith(
      staleWhileRevalidate(request, TILE_CACHE).then((response) => {
        event.waitUntil(trimCache(TILE_CACHE, MAX_TILES))
        return response
      }),
    )
    return
  }

  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE))
    return
  }

  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE))
})
