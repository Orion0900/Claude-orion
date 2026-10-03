/*
 * Offline support for Tidebound. The game has no server and no network
 * assets, so everything it needs is its own shell: the page, one script,
 * one stylesheet and the icons. They're cached when the worker installs
 * (so the game opens offline from the very first launch onwards) and
 * refreshed whenever a new version is deployed.
 */
const VERSION = 'v2'
const CACHE = `tidebound-${VERSION}`
/** The page is cached under one key, whatever query it was opened with. */
const PAGE = './'
const STATIC = ['./manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png']
/** How long a launch waits for the network before using the cached page. */
const NETWORK_WAIT_MS = 3000

/** The ./assets/ files a page references: its script and stylesheet. */
function assetsOf(html) {
  const found = new Set()
  for (const m of html.matchAll(/(?:src|href)="(?:\.\/)?(assets\/[^"]+)"/g)) found.add(new URL(m[1], self.registration.scope).href)
  return [...found]
}

/** Caches a page and everything it needs, and drops the files only older versions used. */
async function keep(page) {
  const cache = await caches.open(CACHE)
  await cache.put(PAGE, page.clone())
  const wanted = assetsOf(await page.text())
  await Promise.all(
    wanted.map(async (url) => {
      if (await cache.match(url)) return
      const response = await fetch(url)
      if (response.ok) await cache.put(url, response)
    }),
  )
  for (const request of await cache.keys()) {
    if (new URL(request.url).pathname.includes('/assets/') && !wanted.includes(request.url)) await cache.delete(request)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Offline while installing? Then files are cached as they're used instead.
      const cache = await caches.open(CACHE)
      await cache.addAll(STATIC).catch(() => {})
      const page = await fetch(PAGE, { cache: 'no-cache' }).catch(() => null)
      if (page?.ok) await keep(page).catch(() => {})
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name.startsWith('tidebound-') && name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The page: the network first so a new deploy shows up, but on a poor
 * connection never more than a few seconds' wait when a copy is cached.
 * Everything else: the cache first, since asset names change every build.
 */
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

  if (request.mode === 'navigate') {
    const network = fetch(request)
    // Keep a fresh page and its files whenever they arrive, even if the cached copy was shown.
    event.waitUntil(network.then((response) => (response.ok ? keep(response.clone()) : undefined)).catch(() => {}))
    event.respondWith(
      (async () => {
        const cached = await caches.match(PAGE, { cacheName: CACHE })
        if (!cached) return network
        return Promise.race([network.catch(() => cached), wait(NETWORK_WAIT_MS).then(() => cached)])
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    })(),
  )
})
