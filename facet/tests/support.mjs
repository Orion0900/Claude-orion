// Shared plumbing for the browser checks: serve dist/ under a GitHub Pages-
// style sub-path, launch a phone-sized Chromium, and fetch the test photos.
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const dist = join(root, 'dist')
export const cache = join(root, 'tests', '.cache')
export const BASE = '/Claude-orion/facet/'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.task': 'application/octet-stream',
}

/** Serves dist/ at BASE, like GitHub Pages serves the app. Returns the origin. */
export function serve(port = 4410) {
  if (!existsSync(join(dist, 'index.html'))) throw new Error('Run `npm run build` first')
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404).end()
      return
    }
    let file = normalize(join(dist, decodeURIComponent(url.pathname.slice(BASE.length))))
    if (!file.startsWith(dist)) {
      res.writeHead(403).end()
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': statSync(file).size })
    createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(port, () => resolve({ origin: `http://localhost:${port}`, close: () => server.close() })))
}

export async function launch() {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  })
  return { browser, context }
}

/** MediaPipe's own test photos, downloaded once into tests/.cache. */
export async function photo(name) {
  mkdirSync(cache, { recursive: true })
  const file = join(cache, name)
  if (!existsSync(file)) {
    const res = await fetch(`https://storage.googleapis.com/mediapipe-assets/${name}`)
    if (!res.ok) throw new Error(`Couldn't download ${name}: ${res.status}`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  }
  return file
}

/** Collects page errors and console errors so a check can fail on them. */
export function watchErrors(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|GL Driver|WebGL|XNNPACK|Graph successfully|landmarker_graph/.test(m.text())) errors.push(`console: ${m.text()}`)
  })
  return errors
}

export function shot(page, name) {
  const dir = process.env.SHOTS
  if (!dir) return Promise.resolve()
  mkdirSync(dir, { recursive: true })
  return page.screenshot({ path: join(dir, `${name}.png`), fullPage: false })
}

export function assert(cond, message) {
  if (!cond) throw new Error(`✗ ${message}`)
  console.log(`✓ ${message}`)
}
