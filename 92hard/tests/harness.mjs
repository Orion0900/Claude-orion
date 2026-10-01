// Shared pieces for the browser checks: a static server for dist/ and a phone-shaped browser.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff',
}

export async function serve(port = 4192) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
    if (path.endsWith('/')) path += 'index.html'
    try {
      const body = await readFile(join(DIST, path))
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  await new Promise((r) => server.listen(port, r))
  return { url: `http://localhost:${port}/`, close: () => server.close() }
}

export const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  timezoneId: 'America/New_York',
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
}

export const launch = () => chromium.launch()

/** Collects page errors and console errors so a check can fail on them. */
export function watchErrors(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  return errors
}

/** Noon on a calendar day in New York, where the phone above lives. */
export const at = (date, time = '12:00:00') => new Date(`${date}T${time}-04:00`)
