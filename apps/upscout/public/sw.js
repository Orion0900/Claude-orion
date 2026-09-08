/*
 * Offline support for UpScout.
 *
 * Two rules:
 *   - The app opens without a connection. Your jobs, letters and queue are on
 *     the device already, so there's no reason a tunnel should stop you
 *     reading a post or writing a proposal.
 *   - A job search is never served from a cache. A stale list of "new" jobs is
 *     worse than no list: bidding late is the one mistake this app exists to
 *     stop you making. Same for anything you submit.
 */
const VERSION = 'v1'
const SHELL_CACHE = `upscout-shell-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((name) => name.startsWith('upscout-') && !name.endsWith(VERSION)).map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

/** Network first, falling back to whatever we last saw. Used for the app shell. */
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

/** Serve instantly from cache, refresh in the background. Used for assets. */
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
  // Anything that isn't a plain read — a submission above all — goes straight
  // to the network and is never cached.
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Sources and bridges live elsewhere; their answers are time-sensitive.
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(staleWhileRevalidate(request))
})
