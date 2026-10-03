// The app as it ships: served under its GitHub Pages sub-path next to the
// site's root app (whose service worker covers every path on the origin),
// used once online — import, transcribe, AI Edit, export at 1080p — and then
// again with the server gone, which is what "works without a signal" means.
//
//   npm run build                      # in cutline/
//   (cd .. && npm run build)           # the root app, optional but realistic
//   FIXTURES=<dir> node tests/site.mjs
//
// FIXTURES as for smoke.mjs: talk.webm and models/Xenova/whisper-tiny/.
// Set SHOTS=<dir> to keep screenshots and the exports.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPHONE, launch, watchErrors } from './harness.mjs'

const FIXTURES = process.env.FIXTURES
if (!FIXTURES) throw new Error('Set FIXTURES to the folder with talk.webm and models/')
const SHOTS = process.env.SHOTS ?? join(process.env.TMPDIR ?? '/tmp', 'cutline-site')
mkdirSync(SHOTS, { recursive: true })

const CUTLINE = fileURLToPath(new URL('../dist/', import.meta.url))
const ROOT = fileURLToPath(new URL('../../dist/', import.meta.url))
const MODELS = join(FIXTURES, 'models')
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.txt': 'text/plain',
}

// Most specific first, as Pages resolves them: /Claude-orion/cutline/ is
// its own folder inside the root site.
const MOUNTS = [
  ['/Claude-orion/cutline/', CUTLINE],
  ...(existsSync(join(ROOT, 'index.html')) ? [['/Claude-orion/', ROOT]] : []),
]

const requests = []
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const path = decodeURIComponent(url.pathname)
  requests.push(path)
  let file = null
  const model = /^\/models\/([^/]+)\/([^/]+)\/resolve\/[^/]+\/(.+)$/.exec(path)
  if (model) file = join(MODELS, 'Xenova/whisper-tiny', normalize(model[3]).replace(/^(\.\.[/\\])+/, ''))
  for (const [prefix, dir] of MOUNTS) {
    if (file || !path.startsWith(prefix)) continue
    let rest = normalize(path.slice(prefix.length)).replace(/^(\.\.[/\\])+/, '')
    if (rest === '.' || rest.endsWith('/') || rest === '') rest = join(rest, 'index.html')
    file = join(dir, rest)
  }
  try {
    if (!file) throw new Error('no mount')
    const info = await stat(file)
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': info.size,
      'access-control-allow-origin': '*',
    })
    res.end(await readFile(file))
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})
await new Promise((r) => server.listen(4330, r))
const ORIGIN = 'http://localhost:4330'
const APP = `${ORIGIN}/Claude-orion/cutline/`

const browser = await launch()
const context = await browser.newContext({ ...IPHONE, acceptDownloads: true, permissions: ['camera', 'microphone'] })
await context.addInitScript((host) => {
  localStorage.setItem('cutline.modelHost', host)
  if (!localStorage.getItem('cutline.settings')) {
    localStorage.setItem('cutline.settings', JSON.stringify({ model: 'tiny', language: 'en', exportShortSide: 1080, preset: 'bold' }))
  }
}, `${ORIGIN}/models/`)
const page = await context.newPage()
const errors = watchErrors(page)
let step = 0
const shot = (name) => page.screenshot({ path: join(SHOTS, `${String(++step).padStart(2, '0')}-${name}.png`) })
function check(condition, message) {
  if (!condition) throw new Error(`Check failed: ${message}`)
  console.log(`  ✓ ${message}`)
}
const seconds = (text) => text.trim().split(':').map(Number).reduce((t, n) => t * 60 + n, 0)
const editedLength = async () => seconds((await page.locator('.transport .time').innerText()).split('/')[1])

async function exportAndProbe(label) {
  await page.click('.export-btn')
  await page.click('button:has-text("Export video")')
  await page.waitForSelector('text=Ready to post', { timeout: 600_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Save or share")')])
  const file = join(SHOTS, `${label}-${await download.suggestedFilename()}`)
  await download.saveAs(file)
  await page.click('button:has-text("Done")')
  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file]).toString(),
  )
  return {
    file,
    video: probe.streams.find((s) => s.codec_type === 'video'),
    audio: probe.streams.find((s) => s.codec_type === 'audio'),
    duration: Number(probe.format.duration),
  }
}

try {
  if (MOUNTS.length > 1) {
    console.log('The root app first, so its service worker covers the whole site')
    await page.goto(`${ORIGIN}/Claude-orion/`)
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
    check(scope.endsWith('/Claude-orion/'), `root service worker active (${new URL(scope).pathname})`)
  } else {
    console.log('(root app not built; skipping the shared-origin part)')
  }

  console.log('Cutline under its sub-path')
  await page.goto(APP)
  await page.waitForSelector('.wordmark')
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/cutline/sw.js'), null, { timeout: 15_000 })
  check(true, "Cutline's own service worker takes over its pages")
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]').href
    const m = await (await fetch(href)).json()
    return { href, start: new URL(m.start_url, href).pathname, scope: new URL(m.scope, href).pathname, icons: m.icons.length }
  })
  check(manifest.start === '/Claude-orion/cutline/' && manifest.scope === '/Claude-orion/cutline/', `manifest starts and scopes at the sub-path (${manifest.start})`)
  const icon = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=apple-touch-icon]').href)).status)
  check(icon === 200, 'Home Screen icon is served')
  await shot('home')

  console.log('Import, transcribe, AI Edit')
  await page.setInputFiles('input[type=file][accept="video/*"]', join(FIXTURES, 'talk.webm'))
  await page.waitForSelector('.editor', { timeout: 30_000 })
  await page.click('button.tab:has-text("Edit")')
  await page.waitForSelector('.transcript .word', { timeout: 300_000 })
  await page.waitForSelector('.stage-banner', { state: 'detached', timeout: 300_000 })
  check(/fellow americans/i.test(await page.locator('.transcript').innerText()), 'transcribed on the device')
  const ortFromSite = requests.filter((p) => p.startsWith('/Claude-orion/cutline/ort/'))
  check(ortFromSite.length >= 1, `ONNX Runtime loaded from the app's own folder (${[...new Set(ortFromSite)].join(', ')})`)
  const before = await editedLength()
  await page.click('.ai-hero')
  await page.waitForTimeout(400)
  const after = await editedLength()
  check(after < before - 2, `AI Edit cut it from ${before} s to ${after} s`)
  await shot('edited')

  console.log('Export at 1080p')
  const online = await exportAndProbe('online')
  check(online.video?.width === 1080 && online.video?.height === 1920, `1080×1920 (${online.video?.width}×${online.video?.height})`)
  check(!!online.audio, 'with sound')
  check(Math.abs(online.duration - after) < 1.2, `edited length (${online.duration.toFixed(2)} s)`)

  // Every asset the app needs has now been fetched once through its service
  // worker. A reload makes sure the page itself is in the cache too.
  await page.click('button[aria-label="Back to projects"]')
  await page.reload()
  await page.waitForSelector('.project-card')

  console.log('Offline: the server is gone')
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  const offlineRequests = requests.length
  await page.reload()
  await page.waitForSelector('.wordmark', { timeout: 15_000 })
  check(true, 'the app opens without a network')
  await page.click('.project-card')
  await page.click('button.tab:has-text("Edit")')
  await page.waitForSelector('.transcript .word')
  check(Math.abs((await editedLength()) - after) < 0.6, 'the project and its edit are all there')
  await shot('offline-editor')

  console.log('Transcribe again, offline')
  await page.click('button:has-text("Transcribe again")')
  await page.waitForSelector('.stage-banner', { timeout: 10_000 })
  await page.waitForSelector('.stage-banner', { state: 'detached', timeout: 300_000 })
  const failed = await page.locator("text=Captions didn't work this time").count()
  check(failed === 0, 'the speech model ran from the cache')
  check(/fellow americans/i.test(await page.locator('.transcript').innerText()), 'and wrote the captions again')

  console.log('Export, offline')
  await page.click('.ai-hero')
  await page.waitForTimeout(400)
  const offline = await exportAndProbe('offline')
  check(offline.video?.height === 1920 && !!offline.audio, 'exports with no network')
  check(requests.length === offlineRequests, 'and nothing reached the (dead) server')

  const unexpected = errors.filter(
    (e) => !/Failed to load resource|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/.test(e),
  )
  check(unexpected.length === 0, `no page errors${unexpected.length ? `:\n${unexpected.join('\n')}` : ''}`)
  console.log('All good')
} catch (error) {
  await shot('failure').catch(() => {})
  console.error(error)
  if (errors.length) console.error('Page errors:\n' + errors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
