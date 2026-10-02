// Shared pieces for the browser checks: a static server for dist/ (plus test
// fixtures and a stand-in for Hugging Face's model host), and a phone-shaped
// browser.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.wav': 'audio/wav', '.txt': 'text/plain',
}

/**
 * Serves dist/ at /, and when `models` is given, answers Hugging Face style
 * model URLs (/models/<org>/<repo>/resolve/<rev>/<file>) from that folder.
 * Every Whisper size is answered with the one model on disk, which is all a
 * test needs: it checks the plumbing, not the accuracy of a bigger model.
 */
export async function serve({ port = 4310, models = null, modelName = 'Xenova/whisper-tiny' } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    let file
    const model = /^\/models\/([^/]+)\/([^/]+)\/resolve\/[^/]+\/(.+)$/.exec(decodeURIComponent(url.pathname))
    if (model && models) {
      file = join(models, modelName, normalize(model[3]).replace(/^(\.\.[/\\])+/, ''))
    } else {
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
      if (path.endsWith('/')) path += 'index.html'
      file = join(DIST, path)
    }
    try {
      const info = await stat(file)
      const body = await readFile(file)
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'content-length': info.size,
        'access-control-allow-origin': '*',
      })
      res.end(body)
    } catch {
      res.writeHead(404, { 'access-control-allow-origin': '*' })
      res.end('not found')
    }
  })
  await new Promise((r) => server.listen(port, r))
  return { url: `http://localhost:${port}/`, modelHost: `http://localhost:${port}/models/`, close: () => server.close() }
}

export const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
}

/** Fake camera and microphone so the recorder can be driven headless. */
export const launch = () =>
  chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })

/** Collects page errors and console errors so a check can fail on them. */
export function watchErrors(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  return errors
}
