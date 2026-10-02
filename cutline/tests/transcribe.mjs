// Real transcription in Chromium, through the app's worker and ONNX
// Runtime's WebAssembly, served by the Vite dev server with the project's
// own config. The model comes from a local copy served the way Hugging Face
// lays it out, and every request that would leave this machine is blocked.
// Not part of `npm test`.
//
//   FIXTURES=/path/to/fixtures node tests/transcribe.mjs
//
// FIXTURES holds jfk.wav, speech.wav and models/Xenova/whisper-tiny/.
// Set HEADED=1 to watch it, and ISOLATED=1 to serve the page cross-origin
// isolated (COOP/COEP), which lets ONNX Runtime use several threads.

import { createReadStream, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = process.env.FIXTURES && resolve(process.env.FIXTURES)
if (!fixtures) {
  console.error('Set FIXTURES to the folder with jfk.wav, speech.wav and models/.')
  process.exit(2)
}

const JFK = 'and so my fellow americans ask not what your country can do for you ask what you can do for your country'
const failures = []
const check = (ok, message) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${message}`)
  if (!ok) failures.push(message)
}

// Serves /hf/{repo}/resolve/main/{file} and /fixtures/{name} from FIXTURES.
const served = []
const fixtureFiles = {
  name: 'transcribe-test-fixtures',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost')
      const model = pathname.match(/^\/hf\/(.+?)\/resolve\/main\/(.+)$/)
      const fixture = pathname.match(/^\/fixtures\/([\w.-]+)$/)
      const file = model
        ? join(fixtures, 'models', decodeURIComponent(model[1]), decodeURIComponent(model[2]))
        : fixture
          ? join(fixtures, fixture[1])
          : null
      if (!file) return next()
      served.push(pathname)
      if (!file.startsWith(fixtures + sep) || !existsSync(file) || !statSync(file).isFile()) {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      res.setHeader('Content-Length', statSync(file).size)
      res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream')
      createReadStream(file).pipe(res)
    })
  },
}

const isolation = process.env.ISOLATED
  ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }
  : {}

const server = await createServer({
  root,
  configFile: join(root, 'vite.config.ts'),
  plugins: [fixtureFiles],
  server: { host: '127.0.0.1', port: 0, headers: isolation },
  // Its own dependency cache, so it can't disturb a dev server running alongside.
  cacheDir: join(tmpdir(), 'cutline-transcribe-test-vite'),
  logLevel: 'warn',
  clearScreen: false,
})
await server.listen()
const origin = `http://127.0.0.1:${server.httpServer.address().port}`
console.log(`Vite dev server at ${origin}`)

const browser = await chromium.launch({ headless: !process.env.HEADED })
const context = await browser.newContext()
const outside = []
const requests = []
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  if (url.hostname !== '127.0.0.1') {
    outside.push(url.href)
    return route.abort()
  }
  return route.continue()
})
context.on('request', (request) => requests.push(request.url()))
// A blank page at the site root, so the app's relative ./ort/ paths resolve as in production.
await context.route(`${origin}/transcribe-test.html`, (route) =>
  route.fulfill({
    contentType: 'text/html',
    headers: isolation,
    body: '<!doctype html><meta charset="utf-8"><title>Transcribe test</title>',
  }),
)

const page = await context.newPage()
const logs = []
page.on('console', (message) => logs.push(`[${message.type()}] ${message.text()}`))
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`))
page.on('worker', (worker) => worker.on('console', (message) => logs.push(`[worker ${message.type()}] ${message.text()}`)))

try {
  await page.goto(`${origin}/transcribe-test.html`)
  console.log(`Cross-origin isolated: ${await page.evaluate(() => crossOriginIsolated)}`)
  await page.evaluate(async (host) => {
    const client = await import('/src/transcribe/client.ts')
    client.configureModelSource({ remoteHost: host })
    // Decoding through the browser resamples the 48 kHz file to 16 kHz.
    const decode = async (name) => {
      const bytes = await (await fetch(`/fixtures/${name}`)).arrayBuffer()
      const buffer = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(bytes)
      return buffer.getChannelData(0)
    }
    const run = async (name, options, abortAfter) => {
      const audio = await decode(name)
      const controller = new AbortController()
      const started = performance.now()
      const phases = {}
      let lastDownload = null
      let transcribeUpdates = 0
      let backwards = false
      let lastDone = -1
      if (abortAfter != null) setTimeout(() => controller.abort(), abortAfter)
      try {
        const result = await client.transcribe(audio, {
          ...options,
          signal: controller.signal,
          onProgress: (p) => {
            phases[p.phase] ??= Math.round(performance.now() - started)
            if (p.phase === 'download') lastDownload = p
            if (p.phase === 'transcribe') {
              transcribeUpdates++
              if (p.done < lastDone) backwards = true
              lastDone = p.done
            }
          },
        })
        const ms = Math.round(performance.now() - started)
        return { ok: true, ms, seconds: audio.length / 16000, phases, lastDownload, transcribeUpdates, backwards, result }
      } catch (error) {
        const ms = Math.round(performance.now() - started)
        return { ok: false, ms, name: error.name, message: error.message, cause: String(error.cause ?? '') }
      }
    }
    Object.assign(window, { client, run })
  }, `${origin}/hf/`)

  const run = (name, options, abortAfter = null) => page.evaluate((args) => window.run(...args), [name, options, abortAfter])

  // 1. First use: download, build the sessions, transcribe 11 s.
  console.log('\njfk.wav, tiny, language detected, first use')
  const first = await run('jfk.wav', { model: 'tiny', language: null })
  check(first.ok, `transcribed (${first.ok ? '' : `${first.message} / ${first.cause}`})`)
  if (first.ok) {
    printWords(first.result.words)
    check(first.result.language === 'en', `language en (${first.result.language})`)
    check(first.result.model === 'Xenova/whisper-tiny', `model ${first.result.model}`)
    check(similarity(first.result.words, JFK) > 0.85, `words match the speech (${similarity(first.result.words, JFK).toFixed(2)})`)
    const americans = first.result.words.find((w) => /^americans/i.test(w.text))
    check(americans && americans.start > 1 && americans.start < 4, `"Americans" starts 1-4 s (${americans?.start})`)
    checkWords(first.result.words, first.seconds)
    const { download, load, transcribe } = first.phases
    check(download < load && load < transcribe, `phases in order ${JSON.stringify(first.phases)}`)
    const last = first.lastDownload
    const mb = (last?.loaded ?? 0) / 1e6
    check(last && last.loaded === last.total && mb > 40, `download summed over files: ${mb.toFixed(1)} MB`)
    check(first.transcribeUpdates >= 2 && !first.backwards, `transcribe progress moves forward (${first.transcribeUpdates} updates)`)
    console.log(`  ${first.ms} ms in all; transcribing started at ${first.phases.transcribe} ms`)
  }

  // 2. Cached now, for that model only.
  const cached = await page.evaluate(async () => [
    await window.client.isModelCached('tiny', null),
    await window.client.isModelCached('tiny', 'en'),
    await window.client.isModelCached('base', null),
  ])
  check(cached[0] && !cached[1] && !cached[2], `isModelCached tiny/auto, tiny/en, base/auto: ${cached.join(', ')}`)

  // 3. Warm: the same model stays loaded in the worker.
  console.log('\njfk.wav again, warm')
  const warm = await run('jfk.wav', { model: 'tiny', language: null })
  check(warm.ok && !warm.phases.download && !warm.phases.load, `no download or load (${JSON.stringify(warm.phases)})`)
  console.log(`  ${warm.ms} ms for ${warm.seconds.toFixed(1)} s of audio`)

  console.log('\nspeech.wav (48 kHz, decoded and resampled by the browser), warm')
  const speech = await run('speech.wav', { model: 'tiny', language: null })
  check(speech.ok, `transcribed (${speech.ok ? '' : speech.message})`)
  if (speech.ok) {
    printWords(speech.result.words)
    const ands = speech.result.words.filter((w) => /^and$/i.test(w.text))
    check(ands.length === 2, `two passages (${ands.length})`)
    const americans = speech.result.words.filter((w) => /^americans/i.test(w.text))
    const gap = americans.length === 2 ? americans[1].start - americans[0].start : 0
    check(Math.abs(gap - 13) < 0.5, `second passage 13 s after the first (${gap.toFixed(2)} s)`)
    const inSilence = speech.result.words.filter((w) => w.end < 0.55 || (w.start > 11.75 && w.end < 13.55) || w.start > 24.75)
    check(inSilence.length === 0, `nothing in the silences (${inSilence.map((w) => w.text).join(' ')})`)
    checkWords(speech.result.words, speech.seconds)
    console.log(`  ${speech.ms} ms for ${speech.seconds.toFixed(1)} s of audio`)
  }

  // 4. Cancelling stops promptly; the next call starts a fresh worker from the cache.
  console.log('\ncancel mid-way, then transcribe again')
  const cancelled = await run('speech.wav', { model: 'tiny', language: null }, 300)
  check(!cancelled.ok && cancelled.name === 'AbortError', `rejects with AbortError (${cancelled.name}: ${cancelled.message})`)
  check(cancelled.ms < 1000, `promptly (${cancelled.ms} ms)`)
  const afterCancel = await run('jfk.wav', { model: 'tiny', language: null })
  check(afterCancel.ok && similarity(afterCancel.result.words, JFK) > 0.85, 'works again after cancelling')
  console.log(`  reloaded from the browser cache and transcribed in ${afterCancel.ms} ms ${JSON.stringify(afterCancel.phases)}`)
  const before = await page.evaluate(() => {
    const controller = new AbortController()
    controller.abort()
    const options = { model: 'tiny', language: null, signal: controller.signal }
    return window.client.transcribe(new Float32Array(16000), options).catch((e) => e.name)
  })
  check(before === 'AbortError', `an already-aborted signal rejects straight away (${before})`)
  const released = await page.evaluate(async () => {
    const pending = window.run('speech.wav', { model: 'tiny', language: null })
    await new Promise((resolve) => setTimeout(resolve, 300))
    window.client.releaseModel()
    return pending
  })
  check(!released.ok && released.name === 'AbortError', `releaseModel stops a transcription under way (${released.name})`)

  // 5. A model that isn't there fails with a plain message.
  console.log('\nEnglish-only weights, which the local copy lacks')
  const missing = await run('jfk.wav', { model: 'tiny', language: 'en' })
  check(
    !missing.ok && /couldn’t be downloaded/.test(missing.message),
    `fails calmly: "${missing.message}" (${missing.cause.slice(0, 120)})`,
  )
  check(served.some((p) => p.startsWith('/hf/Xenova/whisper-tiny.en/')), 'asked for the .en repo')

  // 6. Everything came from this machine, ONNX Runtime from the app itself.
  check(outside.length === 0, `no requests left the machine (${outside.slice(0, 3).join(', ')})`)
  const runtime = requests.find((u) => /\/ort\/ort-wasm-simd-threaded\.wasm(\?|$)/.test(u))
  check(Boolean(runtime), `ONNX Runtime WebAssembly fetched from the app (${runtime?.replace(origin, '')})`)
} finally {
  const warnings = logs.filter((l) => /error|warn/i.test(l))
  if (warnings.length) console.log(`\nBrowser warnings and errors:\n  ${warnings.slice(0, 20).join('\n  ')}`)
  await browser.close()
  await server.close()
}

console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)

function printWords(words) {
  console.log(`  ${words.map((w) => `${w.text}[${w.start.toFixed(2)}-${w.end.toFixed(2)}]`).join(' ')}`)
}

function checkWords(words, duration) {
  check(new Set(words.map((w) => w.id)).size === words.length, 'ids are unique')
  const ordered = words.every((w, i) => w.end - w.start >= 0.049 && (i === 0 || w.start >= words[i - 1].end) && w.end <= duration + 1e-6)
  check(ordered, 'times move forward, never overlap, and last at least 0.05 s')
}

// Share of the expected words found in order (longest common subsequence).
function similarity(words, expected) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z' ]/g, '').split(/\s+/).filter(Boolean)
  const a = norm(words.map((w) => w.text).join(' '))
  const b = norm(expected)
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1])
    }
  }
  return table[a.length][b.length] / Math.max(a.length, b.length)
}
