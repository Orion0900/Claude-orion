// Browser checks for src/media: probing, thumbnails, audio decoding and the
// export (WebCodecs and realtime-recorder paths), run in headless Chromium
// against the Vite dev server, with ffmpeg/ffprobe checking what comes out:
// durations, codecs, frames matched against the source picture at the
// moment the cut says, and the soundtrack matched against the source sound.
//
// Usage, from cutline/ (not part of `npm test`):
//   node tests/media.mjs
//   MEDIA_FIXTURES=<dir>  test media; anything missing is made with ffmpeg
//                         (default: $TMPDIR/cutline-media/fixtures)
//   MEDIA_OUT=<dir>       exports, thumbnails and frame grabs (default: $TMPDIR/cutline-media/out)
//   ONLY=<text>           run only the checks whose name contains it
// Needs ffmpeg and ffprobe on PATH and Playwright's Chromium. Chromium here
// has no H.264/AAC, so the WebCodecs path writes VP9/Opus WebM; on iPhone it
// writes H.264/AAC MP4.
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { audioSamples, ensureFixtures, frameRgb, frameTimes, mse, probe, savePng, videoFrameCount } from './media-fixtures.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = process.env.MEDIA_FIXTURES ?? join(tmpdir(), 'cutline-media', 'fixtures')
const OUT = process.env.MEDIA_OUT ?? join(tmpdir(), 'cutline-media', 'out')
const ONLY = process.env.ONLY ?? ''
mkdirSync(OUT, { recursive: true })

console.log(`fixtures: ${FIXTURES}\nout:      ${OUT}`)
const fx = ensureFixtures(FIXTURES)

/* ---------- Server and browser ---------- */

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

const mediaTestRoutes = {
  name: 'cutline-media-test-routes',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://x')
      if (url.pathname === '/__media-test') {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end('<!doctype html><meta charset="utf-8"><title>media checks</title><body style="margin:0;background:#222"></body>')
      } else if (url.pathname.startsWith('/__fixtures/')) {
        const file = join(FIXTURES, basename(decodeURIComponent(url.pathname)))
        if (!existsSync(file)) return void res.writeHead(404).end()
        res.setHeader('content-type', 'application/octet-stream')
        createReadStream(file).pipe(res)
      } else if (url.pathname.startsWith('/__out/')) {
        const file = join(OUT, basename(decodeURIComponent(url.pathname)))
        if (!existsSync(file)) return void res.writeHead(404).end()
        res.setHeader('content-type', 'application/octet-stream')
        createReadStream(file).pipe(res)
      } else if (url.pathname.startsWith('/__save/') && req.method === 'POST') {
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          writeFileSync(join(OUT, basename(decodeURIComponent(url.pathname))), Buffer.concat(chunks))
          res.end('ok')
        })
      } else next()
    })
  },
}

const port = await freePort()
const server = await createServer({
  root,
  configFile: join(root, 'vite.config.ts'),
  logLevel: 'warn',
  server: { port, strictPort: true, host: 'localhost', hmr: false },
  optimizeDeps: { include: ['mediabunny'] },
  plugins: [mediaTestRoutes],
})
await server.listen()
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
const page = await context.newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') console.log(`    [page ${msg.type()}] ${msg.text().slice(0, 300)}`)
})
page.on('pageerror', (err) => console.log(`    [page error] ${err.message}`))
await page.goto(`http://localhost:${port}/__media-test`)

// In-page helpers: fetch fixtures, save outputs, and the draw callback the
// exports use (the frame fitted to the canvas, then a coloured bar with the
// edited time across the bottom, so frames can be told apart and the bar
// left out of picture comparisons).
const BAR = 96
await page.evaluate((BAR) => {
  window.T = {
    async fixture(name) {
      const res = await fetch(`/__fixtures/${name}`)
      if (!res.ok) throw new Error(`fixture ${name}: ${res.status}`)
      return res.blob()
    },
    async save(name, blob) {
      const res = await fetch(`/__save/${name}`, { method: 'POST', body: blob })
      if (!res.ok) throw new Error(`save ${name}: ${res.status}`)
    },
    sizes: new Set(),
    times: [],
    draw(fit = 'cover') {
      return (ctx, frame, size, t) => {
        const W = ctx.canvas.width
        const H = ctx.canvas.height
        T.sizes.add(`${size.width}x${size.height}`)
        if (T.times.length < 400) T.times.push(t)
        if (frame && size.width) {
          const s = fit === 'cover' ? Math.max(W / size.width, H / size.height) : Math.min(W / size.width, H / size.height)
          const w = size.width * s
          const h = size.height * s
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(frame, (W - w) / 2, (H - h) / 2, w, h)
        }
        ctx.fillStyle = `hsl(${(t * 60) % 360} 90% 50%)`
        ctx.fillRect(0, H - BAR, W, BAR)
        ctx.fillStyle = '#000'
        ctx.font = `bold ${Math.round(BAR * 0.45)}px sans-serif`
        ctx.fillText(`edited ${t.toFixed(3)}s`, 16, H - BAR * 0.3)
      }
    },
  }
}, BAR)

/* ---------- Check plumbing ---------- */

let failures = 0
const summary = []
async function check(name, fn) {
  if (ONLY && !name.includes(ONLY)) return
  const started = Date.now()
  process.stdout.write(`\n● ${name}\n`)
  try {
    await fn()
    summary.push(`ok    ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`)
  } catch (error) {
    failures++
    console.log(`  ✗ ${error.stack ?? error}`)
    summary.push(`FAIL  ${name}`)
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message)
  console.log(`  ✓ ${message}`)
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

/** The edited timeline, as src/media/ranges.ts builds it. */
function timelineOf(ranges) {
  let offset = 0
  const segments = ranges.map((r) => {
    const seg = { ...r, offset }
    offset += r.end - r.start
    return seg
  })
  return { segments, duration: offset }
}
function sourceTime(tl, t) {
  let seg = tl.segments[0]
  for (const s of tl.segments) if (t >= s.offset - 1e-9) seg = s
  return seg.start + Math.min(t - seg.offset, seg.end - seg.start)
}

async function runExport(args) {
  return page.evaluate(async (a) => {
    const { exportVideo } = await import('/src/media/export.ts')
    const { decodeAudio } = await import('/src/media/audio.ts')
    const source = await T.fixture(a.fixture)
    const music = a.music ? { audio: await decodeAudio(await T.fixture(a.music.name)), volume: a.music.volume, ducking: a.music.ducking } : undefined
    T.sizes = new Set()
    T.times = []
    const progress = []
    const started = performance.now()
    const result = await exportVideo({
      source,
      ranges: a.ranges,
      width: a.width,
      height: a.height,
      fps: a.fps,
      decodeSize: a.decodeSize,
      method: a.method,
      music,
      draw: T.draw(a.fit),
      onProgress: (f) => progress.push(f),
    })
    const seconds = (performance.now() - started) / 1000
    const file = `${a.saveAs}.${result.extension}`
    await T.save(file, result.blob)
    return {
      file,
      seconds,
      method: result.method,
      mimeType: result.mimeType,
      blobType: result.blob.type,
      bytes: result.blob.size,
      sizes: [...T.sizes],
      times: T.times.slice(0, 5),
      progress: {
        calls: progress.length,
        last: progress.at(-1),
        monotonic: progress.every((p, i) => i === 0 || p >= progress[i - 1] - 1e-9),
      },
    }
  }, args)
}

function streams(file) {
  const info = probe(file)
  const video = info.streams.find((s) => s.codec_type === 'video')
  const audio = info.streams.find((s) => s.codec_type === 'audio')
  return { info, video, audio, duration: Number(info.format.duration) }
}

/**
 * For each picked output frame, the source frame it shows must be the one
 * the cut maps it to: compares the picture (bar left out) with the source
 * frames around the expected one and wants the best match within `slack`.
 */
function checkFrames(label, outFile, refFile, picks, { refFilter = null, outFilter = null, rows, slack = 0, fps = 30 }) {
  const offsets = []
  for (const pick of picks) {
    const out = frameRgb(outFile, pick.k, outFilter)
    const candidates = []
    for (let d = -Math.max(2, slack + 1); d <= Math.max(2, slack + 1); d++) {
      if (pick.j + d < 0) continue
      candidates.push({ d, err: mse(out, frameRgb(refFile, pick.j + d, refFilter), 0, rows ?? out.height) })
    }
    candidates.sort((a, b) => a.err - b.err)
    offsets.push(candidates[0].d)
    const name = `${label}-k${pick.k}`
    savePng(outFile, pick.k, join(OUT, `${name}.png`), outFilter)
    console.log(
      `    out frame ${pick.k} (edited ${(pick.k / fps).toFixed(3)} s) → expected source frame ${pick.j} (${(pick.j / pick.refFps).toFixed(3)} s); best match ${pick.j + candidates[0].d} (mse ${candidates[0].err.toFixed(1)}, next ${candidates[1].err.toFixed(1)})`,
    )
  }
  assert(offsets.every((d) => Math.abs(d) <= slack), `${label}: every checked frame shows the right source moment (offsets ${offsets.join(', ')}; slack ${slack})`)
}

/** Picks output frames around each cut and in between. */
function framePicks(tl, fps, refFps) {
  const picks = []
  const add = (t) => {
    const k = Math.round(t * fps)
    const s = sourceTime(tl, k / fps)
    picks.push({ k, j: Math.round(s * refFps), refFps })
  }
  add(0)
  for (const seg of tl.segments) {
    if (seg.offset > 0) {
      add(seg.offset - 1 / fps)
      add(seg.offset)
    }
    add(seg.offset + (seg.end - seg.start) / 2)
  }
  add(tl.duration - 1 / fps)
  return picks
}

/**
 * Lines the export's sound up against the source's: for 200 ms windows of
 * output with sound in them, the source at the mapped time (searching ±maxLag)
 * should match, and nowhere the source talks may the output go quiet.
 */
function checkSound(label, outFile, srcFile, tl, { maxLag = 0.03, minCorr = 0.9, jitter = 0.002 } = {}) {
  const rate = 16000
  const out = audioSamples(outFile, rate)
  const src = audioSamples(srcFile, rate)
  const win = Math.round(0.2 * rate)
  const lagMax = Math.round(maxLag * rate)
  const rms = (x, from, n) => {
    let s = 0
    for (let i = from; i < from + n; i++) s += (x[i] ?? 0) ** 2
    return Math.sqrt(s / n)
  }
  const results = []
  let dropouts = 0
  for (const seg of tl.segments) {
    for (let w = seg.offset + 0.03; w + 0.2 <= seg.offset + (seg.end - seg.start) - 0.03; w += 0.1) {
      const o0 = Math.round(w * rate)
      const s0 = Math.round((seg.start + w - seg.offset) * rate)
      const srcLevel = rms(src, s0, win)
      const outLevel = rms(out, o0, win)
      if (srcLevel > 0.02 && outLevel < 0.3 * srcLevel) dropouts++
      if (srcLevel < 0.02) continue
      let best = { corr: -1, lag: 0 }
      for (let lag = -lagMax; lag <= lagMax; lag++) {
        let dot = 0
        let a = 0
        let b = 0
        for (let i = 0; i < win; i += 2) {
          const x = out[o0 + i] ?? 0
          const y = src[s0 + lag + i] ?? 0
          dot += x * y
          a += x * x
          b += y * y
        }
        const corr = dot / Math.sqrt(a * b + 1e-12)
        if (corr > best.corr) best = { corr, lag }
      }
      results.push(best)
    }
  }
  const good = results.filter((r) => r.corr >= minCorr)
  const lags = good.map((r) => r.lag / rate).sort((a, b) => a - b)
  const median = lags[Math.floor(lags.length / 2)] ?? NaN
  const spread = lags.length ? lags[lags.length - 1] - lags[0] : NaN
  console.log(
    `    ${results.length} talking windows, ${good.length} correlate ≥ ${minCorr}; output lags source by median ${(median * 1000).toFixed(2)} ms (spread ${(spread * 1000).toFixed(1)} ms); dropouts ${dropouts}`,
  )
  assert(good.length >= results.length * 0.9 && results.length > 20, `${label}: the right sound is at the right place (${good.length}/${results.length} windows match)`)
  assert(Math.abs(median) <= maxLag, `${label}: sound in sync with the cut (median offset ${(median * 1000).toFixed(1)} ms)`)
  if (jitter !== null) assert(spread <= jitter, `${label}: same offset in every span (spread ${(spread * 1000).toFixed(1)} ms ≤ ${jitter * 1000} ms)`)
  assert(dropouts === 0, `${label}: no silences where speech was kept`)
  return { median, spread }
}

/* ---------- Checks ---------- */

const RANGES = [
  { start: 0.4, end: 6 },
  { start: 8, end: 14.2 },
  { start: 15.5, end: 25 },
]
const TL = timelineOf(RANGES)
const timings = []

await check('support', async () => {
  const s = await page.evaluate(async () => (await import('/src/media/export.ts')).exportSupport())
  console.log(`    ${JSON.stringify(s)}`)
  assert(s.webcodecs === true && s.video === 'vp9' && s.audio === 'opus', 'Chromium: WebCodecs export with VP9 + Opus (no H.264/AAC here)')
  assert(s.recorder?.startsWith('video/webm'), `recorder records WebM here (${s.recorder})`)
})

await check('probe', async () => {
  const names = ['talk.webm', 'talk-landscape.webm', 'talk.mp4', 'rotated.mp4', 'noaudio.webm', '4k60.mp4', 'hevc.mp4', 'speech.wav', 'music.wav']
  const infos = await page.evaluate(async (names) => {
    const { probeMedia } = await import('/src/media/probe.ts')
    const out = {}
    for (const name of names) {
      const started = performance.now()
      out[name] = { ...(await probeMedia(await T.fixture(name), name)), ms: Math.round(performance.now() - started) }
    }
    try {
      await probeMedia(new Blob(['not a video at all'], { type: 'text/plain' }), 'notes.txt')
      out.text = 'accepted?!'
    } catch (error) {
      out.text = { name: error.name, code: error.code, message: error.message }
    }
    return out
  }, names)
  for (const [name, info] of Object.entries(infos)) console.log(`    ${name}: ${JSON.stringify(info)}`)
  const t = infos['talk.webm']
  assert(near(t.duration, 25.8, 0.05) && t.width === 720 && t.height === 1280 && t.frameRate === 30, 'talk.webm: 25.8 s, 720x1280, 30 fps')
  assert(t.videoCodec === 'vp9' && t.audioCodec === 'opus' && t.hasAudio && t.mimeType === 'video/webm', 'talk.webm: VP9 + Opus WebM')
  const m = infos['talk.mp4']
  assert(near(m.duration, 25.8, 0.05) && m.width === 720 && m.height === 1280 && m.frameRate === 30, 'talk.mp4 (undecodable here): 25.8 s, 720x1280, 30 fps')
  assert(m.videoCodec === 'avc' && m.audioCodec === 'aac' && m.mimeType === 'video/mp4', 'talk.mp4: H.264 + AAC MP4')
  assert(infos['talk-landscape.webm'].width === 1280 && infos['talk-landscape.webm'].height === 720, 'landscape: 1280x720')
  assert(infos['rotated.mp4'].width === 720 && infos['rotated.mp4'].height === 1280, 'rotated.mp4 (stored 1280x720, -90°): displays 720x1280')
  assert(!infos['noaudio.webm'].hasAudio && infos['noaudio.webm'].audioCodec === null, 'noaudio.webm: no audio')
  const u = infos['4k60.mp4']
  assert(u.width === 2160 && u.height === 3840 && u.frameRate === 60 && near(u.duration, 6, 0.05), '4k60.mp4: 2160x3840 portrait, 60 fps, 6 s')
  assert(infos['hevc.mp4'].videoCodec === 'hevc', 'hevc.mp4: HEVC')
  const w = infos['speech.wav']
  assert(w.width === 0 && w.height === 0 && w.hasAudio && w.videoCodec === null && w.audioCodec?.startsWith('pcm'), 'speech.wav: audio only, 0x0')
  assert(infos.text?.code === 'unsupported-file', `a text file is refused with a readable message: “${infos.text?.message}”`)
  assert(Math.max(...names.map((n) => infos[n].ms)) < 2000, `each probe is quick (slowest ${Math.max(...names.map((n) => infos[n].ms))} ms)`)
})

await check('thumbnail', async () => {
  const thumbs = await page.evaluate(async () => {
    const { makeThumbnail } = await import('/src/media/probe.ts')
    const size = (url) =>
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(`${img.naturalWidth}x${img.naturalHeight}`)
        img.onerror = () => resolve('bad')
        img.src = url
      })
    const out = {}
    for (const [name, at] of [['talk.webm', 7.5], ['rotated.mp4', 7.5], ['talk-landscape.webm', undefined], ['talk.mp4', 1], ['speech.wav', 1]]) {
      const started = performance.now()
      const url = await makeThumbnail(await T.fixture(name), at)
      out[name] = { url, size: url ? await size(url) : null, ms: Math.round(performance.now() - started) }
      if (url) await T.save(`thumb-${name}.jpg`, await (await fetch(url)).blob())
    }
    return out
  })
  for (const [name, t] of Object.entries(thumbs)) console.log(`    ${name}: ${t.size} in ${t.ms} ms ${t.url ? t.url.slice(0, 30) + '…' : t.url}`)
  assert(thumbs['talk.webm'].url?.startsWith('data:image/jpeg') && thumbs['talk.webm'].size === '180x320', 'talk.webm: a 180x320 JPEG')
  assert(thumbs['rotated.mp4'].size === '180x320', 'rotated.mp4: upright, 180x320')
  assert(thumbs['talk-landscape.webm'].size === '320x180', 'landscape: 320x180')
  assert(thumbs['talk.mp4'].url === null, 'talk.mp4: null where the browser can’t decode H.264')
  assert(thumbs['speech.wav'].url === null, 'audio-only: null')
})

await check('decode audio', async () => {
  const r = await page.evaluate(async () => {
    const { decodeAudio, toMono16k, analyzeLoudness } = await import('/src/media/audio.ts')
    const started = performance.now()
    const progress = []
    const decoded = await decodeAudio(await T.fixture('talk.webm'), { onProgress: (f) => progress.push(f) })
    const decodeMs = performance.now() - started
    const t1 = performance.now()
    const mono = await toMono16k(decoded)
    const resampleMs = performance.now() - t1
    const loud = analyzeLoudness(mono, 16000)
    const at = (s) => loud.envelope[Math.round(s / loud.frameDuration)]
    const mean = (from, to) => {
      let s = 0
      const a = Math.round(from / loud.frameDuration)
      const b = Math.round(to / loud.frameDuration)
      for (let i = a; i < b; i++) s += loud.envelope[i]
      return s / (b - a)
    }
    const bytes = new Uint8Array(mono.buffer)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const other = {}
    for (const name of ['noaudio.webm', 'speech.wav', 'music.wav', 'talk.mp4']) {
      try {
        const d = await decodeAudio(await T.fixture(name))
        other[name] = d && { sampleRate: d.sampleRate, channels: d.channels.length, duration: d.duration }
      } catch (error) {
        other[name] = { error: error.name, code: error.code, message: error.message }
      }
    }
    const ac = new AbortController()
    ac.abort()
    const aborted = await decodeAudio(await T.fixture('talk.webm'), { signal: ac.signal }).then(() => 'resolved', (e) => e.name)
    return {
      sampleRate: decoded.sampleRate,
      channels: decoded.channels.length,
      duration: decoded.duration,
      length: decoded.channels[0].length,
      monoLength: mono.length,
      decodeMs,
      resampleMs,
      progress: { calls: progress.length, last: progress.at(-1) },
      frames: loud.envelope.length,
      frameDuration: loud.frameDuration,
      lead: mean(0.05, 0.5),
      talk: mean(1, 11),
      gap: mean(11.8, 13.4),
      maxEnv: Math.max(...loud.envelope),
      at6: at(6),
      mono: btoa(bin),
      other,
      aborted,
    }
  })
  console.log(`    ${JSON.stringify({ ...r, mono: undefined })}`)
  assert(r.sampleRate === 48000 && r.channels === 1 && near(r.duration, 25.8, 0.03), `talk.webm decodes to 48 kHz mono, ${r.duration.toFixed(3)} s`)
  assert(r.monoLength === Math.round(r.length / 3), `toMono16k: ${r.monoLength} samples at 16 kHz (decode ${r.decodeMs.toFixed(0)} ms, resample ${r.resampleMs.toFixed(0)} ms)`)
  assert(r.progress.calls > 5 && r.progress.last === 1, `decode progress reported (${r.progress.calls} calls, ends at 1)`)
  assert(r.frameDuration === 0.01 && r.frames === Math.ceil(r.monoLength / 160), `loudness: ${r.frames} frames of 10 ms`)
  assert(r.lead < 0.02 && r.gap < 0.02 && r.talk > 0.15 && r.maxEnv <= 1, `loudness: silence ~0 (lead ${r.lead.toFixed(3)}, gap ${r.gap.toFixed(3)}), speech up (mean ${r.talk.toFixed(2)})`)
  // Line our 16 kHz decode up against ffmpeg's: same moments at the same indices.
  const buf = Buffer.from(r.mono, 'base64')
  const ours = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const ref = audioSamples(fx.talk, 16000)
  let bestLag = 0
  let bestCorr = -1
  for (let lag = -40; lag <= 40; lag++) {
    let dot = 0
    let a = 0
    let b = 0
    for (let i = 16000; i < 16000 * 11; i += 3) {
      dot += ours[i] * ref[i + lag]
      a += ours[i] ** 2
      b += ref[i + lag] ** 2
    }
    const c = dot / Math.sqrt(a * b)
    if (c > bestCorr) [bestCorr, bestLag] = [c, lag]
  }
  assert(bestCorr > 0.99 && Math.abs(bestLag) <= 1, `decoded audio sits on the source clock: matches ffmpeg's decode at lag ${bestLag} samples (corr ${bestCorr.toFixed(4)})`)
  assert(r.other['noaudio.webm'] === null, 'no audio track → null')
  assert(r.other['speech.wav']?.sampleRate === 48000 && near(r.other['speech.wav'].duration, 25.8, 0.01), 'WAV decodes (PCM, no WebCodecs needed)')
  assert(r.other['music.wav']?.sampleRate === 44100 && r.other['music.wav'].channels === 2, 'music.wav: 44.1 kHz stereo')
  assert(r.other['talk.mp4']?.code === 'audio-codec' && /AAC/.test(r.other['talk.mp4'].message), `AAC where it can't be decoded: “${r.other['talk.mp4']?.message}”`)
  assert(r.aborted === 'AbortError', 'an aborted signal rejects with AbortError')
})

await check('export webcodecs', async () => {
  const r = await runExport({ fixture: 'talk.webm', ranges: RANGES, width: 720, height: 1280, fps: 30, saveAs: 'export-webcodecs' })
  const file = join(OUT, r.file)
  const s = streams(file)
  const frames = videoFrameCount(file)
  timings.push(['WebCodecs 720x1280', TL.duration, r.seconds])
  console.log(`    ${r.method} ${r.mimeType} ${(r.bytes / 1e6).toFixed(2)} MB in ${r.seconds.toFixed(2)} s = ${(TL.duration / r.seconds).toFixed(1)}x realtime; frame sizes ${r.sizes}; first times ${r.times.map((t) => t.toFixed(4))}`)
  console.log(`    ffprobe: ${s.video.codec_name} ${s.video.width}x${s.video.height} ${s.video.r_frame_rate}, ${s.audio?.codec_name} ${s.audio?.sample_rate} Hz ${s.audio?.channels} ch, format ${s.duration.toFixed(3)} s, ${frames} frames`)
  assert(r.method === 'webcodecs' && r.mimeType === 'video/webm' && r.blobType === 'video/webm', 'went the WebCodecs way, WebM out')
  assert(s.video.codec_name === 'vp9' && s.video.width === 720 && s.video.height === 1280, 'VP9 720x1280')
  assert(s.audio?.codec_name === 'opus' && Number(s.audio.sample_rate) === 48000, 'Opus 48 kHz audio')
  assert(frames === 639, `639 frames = 21.3 s at 30 fps (got ${frames})`)
  assert(near(s.duration, TL.duration, 0.05), `duration ${s.duration.toFixed(3)} s ≈ ${TL.duration} s (±50 ms)`)
  const audioDur = audioSamples(file, 48000).length / 48000
  assert(near(audioDur, 639 / 30, 0.03), `audio runs as long as the video (${audioDur.toFixed(3)} s)`)
  assert(r.progress.monotonic && r.progress.last === 1 && r.progress.calls > 50, `progress climbs to 1 (${r.progress.calls} calls)`)
  assert(r.sizes.length === 1 && r.sizes[0] === '720x1280', 'frames handed to draw at 720x1280')
  checkFrames('webcodecs', file, fx.talk, framePicks(TL, 30, 30), { rows: 1280 - BAR })
  checkSound('webcodecs', file, fx.talk, TL)
})

await check('export recorder', async () => {
  const r = await runExport({ fixture: 'talk.webm', ranges: RANGES, width: 720, height: 1280, fps: 30, method: 'recorder', saveAs: 'export-recorder' })
  const file = join(OUT, r.file)
  const s = streams(file)
  timings.push(['Recorder 720x1280', TL.duration, r.seconds])
  console.log(`    ${r.method} ${r.mimeType} ${(r.bytes / 1e6).toFixed(2)} MB in ${r.seconds.toFixed(2)} s = ${(TL.duration / r.seconds).toFixed(2)}x realtime; sizes ${r.sizes}`)
  console.log(`    ffprobe: ${s.video.codec_name} ${s.video.width}x${s.video.height}, ${s.audio?.codec_name} ${s.audio?.sample_rate} Hz, format ${s.duration.toFixed(3)} s`)
  assert(r.method === 'recorder' && r.mimeType === 'video/webm', 'recorded with MediaRecorder, WebM out')
  assert(s.video.width === 720 && s.video.height === 1280 && !!s.audio, 'video 720x1280 with sound')
  assert(near(s.duration, TL.duration, 0.25), `duration ${s.duration.toFixed(3)} s ≈ ${TL.duration} s (±250 ms; it's recorded in real time)`)
  assert(r.progress.monotonic && r.progress.last === 1, 'progress climbs to 1')
  // Recorded frames aren't on a fixed grid, and each span's start and end land within a
  // frame or so of the ideal: take frames by time, away from the joins, allowing ±1 frame.
  const picks = TL.segments.flatMap((seg) => [seg.offset + 0.2, seg.offset + (seg.end - seg.start) / 2, seg.offset + (seg.end - seg.start) - 0.2])
  checkFramesByTime('recorder', file, fx.talk, TL, picks, { rows: 1280 - BAR, slack: 1 })
  checkSound('recorder', file, fx.talk, TL, { maxLag: 0.12, minCorr: 0.8, jitter: null })
})

/**
 * Like checkFrames, for recordings, whose frames come at whatever rate the
 * browser managed: takes the recorded frame on screen at each pick, and
 * expects the source moment the cut maps that frame's own timestamp to.
 */
function checkFramesByTime(label, outFile, refFile, tl, picks, { rows, slack }) {
  const offsets = []
  const times = frameTimes(outFile)
  const first = times[0] ?? 0
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)
  console.log(`    recorded ${times.length} frames, median interval ${(gaps[Math.floor(gaps.length / 2)] * 1000).toFixed(0)} ms`)
  for (const t of picks) {
    let n = 0
    while (n + 1 < times.length && times[n + 1] <= first + t + 1e-6) n++
    const at = times[n] - first
    const j = Math.round(sourceTime(tl, at) * 30)
    const out = frameRgb(outFile, n)
    const candidates = []
    for (let d = -(slack + 2); d <= slack + 2; d++) {
      if (j + d < 0) continue
      candidates.push({ d, err: mse(out, frameRgb(refFile, j + d), 0, rows) })
    }
    candidates.sort((a, b) => a.err - b.err)
    offsets.push(candidates[0].d)
    console.log(`    recorded frame ${n} at ${at.toFixed(3)} s → expected source frame ${j}; best match ${j + candidates[0].d} (mse ${candidates[0].err.toFixed(1)})`)
  }
  assert(offsets.every((d) => Math.abs(d) <= slack), `${label}: frames show the right source moment within ±${slack} frames (offsets ${offsets.join(', ')})`)
}

await check('export landscape into portrait', async () => {
  const ranges = [
    { start: 2, end: 5 },
    { start: 9, end: 12 },
  ]
  const tl = timelineOf(ranges)
  const r = await runExport({ fixture: 'talk-landscape.webm', ranges, width: 720, height: 1280, fps: 30, saveAs: 'export-landscape' })
  const file = join(OUT, r.file)
  const s = streams(file)
  console.log(`    ${(r.bytes / 1e6).toFixed(2)} MB in ${r.seconds.toFixed(2)} s; frames handed over at ${r.sizes}; ${s.video.width}x${s.video.height} ${s.duration.toFixed(3)} s`)
  assert(s.video.width === 720 && s.video.height === 1280 && near(s.duration, 6, 0.05), 'portrait 720x1280, 6 s')
  // No decodeSize: cover 720x1280 with 25% to spare, capped at the source (1280x720).
  assert(r.sizes.length === 1 && r.sizes[0] === '1280x720', `landscape frames arrive whole and upright (${r.sizes})`)
  // The draw callback covers the portrait frame: the source scaled to 1280 tall, centre 720 kept.
  checkFrames('landscape', file, fx.landscape, framePicks(tl, 30, 30), { refFilter: 'scale=-2:1280:flags=bilinear,crop=720:1280', rows: 1280 - BAR })
})

await check('export rotated (iPhone-style portrait)', async () => {
  const ranges = [
    { start: 1, end: 4 },
    { start: 14, end: 16 },
  ]
  const tl = timelineOf(ranges)
  const r = await runExport({ fixture: 'rotated.mp4', ranges, width: 720, height: 1280, fps: 30, saveAs: 'export-rotated' })
  const file = join(OUT, r.file)
  const s = streams(file)
  console.log(`    ${(r.bytes / 1e6).toFixed(2)} MB in ${r.seconds.toFixed(2)} s; frames ${r.sizes}; ${s.video.width}x${s.video.height} ${s.duration.toFixed(3)} s`)
  assert(r.sizes[0] === '720x1280', 'frames arrive rotated upright (720x1280)')
  // Shown upright, rotated.mp4 is talk.webm: compare against that.
  checkFrames('rotated', file, fx.talk, framePicks(tl, 30, 30), { rows: 1280 - BAR })
  checkSound('rotated', file, fx.talk, tl)
})

await check('export 4K60 with decodeSize', async () => {
  const ranges = [
    { start: 0.5, end: 2.5 },
    { start: 3.5, end: 5.5 },
  ]
  const tl = timelineOf(ranges)
  const r = await runExport({ fixture: '4k60.mp4', ranges, width: 1080, height: 1920, fps: 30, decodeSize: { width: 1080, height: 1920 }, saveAs: 'export-4k' })
  const file = join(OUT, r.file)
  const s = streams(file)
  timings.push(['WebCodecs 4K60 source → 1080x1920', tl.duration, r.seconds])
  console.log(`    ${(r.bytes / 1e6).toFixed(2)} MB in ${r.seconds.toFixed(2)} s = ${(tl.duration / r.seconds).toFixed(2)}x realtime; frames ${r.sizes}; ${s.video.width}x${s.video.height} ${s.duration.toFixed(3)} s`)
  assert(r.sizes.length === 1 && r.sizes[0] === '1080x1920', 'decoded frames downscaled to the decodeSize box (1080x1920), upright')
  assert(s.video.width === 1080 && s.video.height === 1920 && near(s.duration, 4, 0.05), '1080x1920, 4 s')
  checkFrames('4k', file, fx.uhd, framePicks(tl, 30, 60), { refFilter: 'scale=1080:1920', rows: 1920 - BAR })
})

await check('export without audio', async () => {
  const r = await runExport({ fixture: 'noaudio.webm', ranges: RANGES, width: 360, height: 640, fps: 30, saveAs: 'export-noaudio' })
  const s = streams(join(OUT, r.file))
  assert(!s.audio && s.video.width === 360 && near(s.duration, TL.duration, 0.05), `no audio track in, none out (${s.duration.toFixed(3)} s)`)
})

await check('export with music', async () => {
  const music = { name: 'music.wav', volume: 0.5, ducking: true }
  const r = await runExport({ fixture: 'talk.webm', ranges: RANGES, width: 360, height: 640, fps: 30, music, saveAs: 'export-music' })
  const file = join(OUT, r.file)
  const s = streams(file)
  assert(s.audio?.channels === 2, `stereo out for stereo music over mono speech (${s.audio?.channels} ch)`)
  // How loud the music is in a window: the output projected on the (resampled, looped) music.
  // Full band for its absolute level where nobody talks; above 9 kHz, where the voice
  // (band-limited below 8 kHz) can't disturb the measure, for how deep it ducks. Opus keeps
  // that band's energy rather than its waveform, so there only ratios mean anything.
  const rate = 48000
  const HIGH = 'highpass=f=9000:poles=2,highpass=f=9000:poles=2'
  const projector = (outSignal, music) => (t) => {
    let dot = 0
    let norm = 0
    for (let n = Math.round(t * rate); n < Math.round((t + 0.3) * rate); n++) {
      const v = music[n % music.length]
      dot += outSignal[n] * v
      norm += v * v
    }
    return dot / norm
  }
  const full = projector(audioSamples(file, rate), audioSamples(fx.music, rate))
  const high = projector(audioSamples(file, rate, HIGH), audioSamples(fx.music, rate, HIGH))
  // Where the speech is: 50 ms loudness of the source, on the edited clock.
  const src = audioSamples(fx.talk, 16000)
  const talkingAt = (t) => {
    const s0 = Math.round(sourceTime(TL, t) * 16000)
    let e = 0
    for (let i = s0; i < s0 + 800; i++) e += (src[i] ?? 0) ** 2
    return Math.sqrt(e / 800) > 0.02
  }
  // Windows inside a phrase: talking throughout, with no pause over 0.35 s in the half second before.
  const talking = []
  for (let t = 0.6; t < TL.duration - 0.6; t += 0.25) {
    let quiet = 0
    let longest = 0
    let any = false
    for (let u = t - 0.5; u < t + 0.3; u += 0.05) {
      if (talkingAt(u)) {
        any = true
        quiet = 0
      } else longest = Math.max(longest, (quiet += 0.05))
    }
    if (any && longest < 0.35 && TL.segments.every((seg) => Math.abs(t - seg.offset) > 0.6)) talking.push(t)
  }
  // Edited 9.2–11.2 s is the 2 s pause inside the second span (source 11.6–13.6); by 10.6 s the hold and release are over.
  const pause = full(10.6)
  const ratios = talking.map((t) => high(t) / high(10.6)).sort((a, b) => a - b)
  const median = ratios[Math.floor(ratios.length / 2)]
  const within = ratios.filter((v) => near(v, median, 0.03)).length
  console.log(`    music level in the pause ${pause.toFixed(3)}; under speech (${ratios.length} windows) at ${median.toFixed(3)} of that (range ${ratios[0].toFixed(3)}–${ratios.at(-1).toFixed(3)})`)
  assert(near(pause, 0.5, 0.05), `music at its volume (0.5) in a pause (${pause.toFixed(3)})`)
  assert(ratios.length > 30 && near(median, 0.25, 0.04) && within >= ratios.length * 0.9, `ducked to ~25% under speech, steadily (${within}/${ratios.length} windows within ±0.03 of ${median.toFixed(3)})`)
  checkSound('music', file, fx.talk, TL, { minCorr: 0.8, maxLag: 0.03, jitter: 0.002 })

  const r2 = await runExport({ fixture: 'noaudio.webm', ranges: [{ start: 0, end: 12 }], width: 360, height: 640, fps: 30, music: { name: 'music.wav', volume: 0.8, ducking: true }, saveAs: 'export-music-only' })
  const file2 = join(OUT, r2.file)
  const s2 = streams(file2)
  const lv = projector(audioSamples(file2, rate), audioSamples(fx.music, rate))
  const levels = [1, 4, 8.5, 10].map(lv)
  console.log(`    music-only levels ${levels.map((v) => v.toFixed(2))}`)
  assert(!!s2.audio && near(s2.duration, 12, 0.05), 'a silent clip gets a music soundtrack')
  assert(levels.every((v) => near(v, 0.8, 0.1)), 'music at full volume with no speech to duck under, looped past its 9 s')
})

await check('export reads only what it needs', async () => {
  const r = await page.evaluate(async () => {
    // The same mediabunny instance src/media uses: find the URL Vite rewrote its import to.
    const code = await (await fetch('/src/media/probe.ts')).text()
    const url = code.match(/from\s+["']([^"']*mediabunny[^"']*)["']/)[1]
    const { BlobSource } = await import(url)
    const proto = Object.getPrototypeOf(BlobSource.prototype)
    const original = proto._dispatchRead
    let bytes = 0
    proto._dispatchRead = function (start, end) {
      bytes += end - start
      return original.call(this, start, end)
    }
    try {
      const { probeMedia } = await import('/src/media/probe.ts')
      const { exportVideo } = await import('/src/media/export.ts')
      const source = await T.fixture('long.webm')
      const info = await probeMedia(source, 'long.webm')
      const probed = bytes
      bytes = 0
      const started = performance.now()
      await exportVideo({ source, ranges: [{ start: 100, end: 102 }, { start: 150, end: 151 }], width: 360, height: 640, draw: T.draw() })
      return { probed, exported: bytes, size: source.size, duration: info.duration, ms: performance.now() - started }
    } finally {
      proto._dispatchRead = original
    }
  })
  const mb = (n) => (n / 1e6).toFixed(2)
  console.log(`    ${mb(r.size)} MB file, ${r.duration.toFixed(1)} s: probing read ${mb(r.probed)} MB; exporting 3 s of it read ${mb(r.exported)} MB in ${r.ms.toFixed(0)} ms`)
  assert(r.probed < r.size * 0.1, `probing reads ${Math.round((100 * r.probed) / r.size)}% of the file`)
  assert(r.exported < r.size * 0.25, `exporting a few seconds reads ${Math.round((100 * r.exported) / r.size)}% of the file, not all of it`)
})

await check('export audio-only source', async () => {
  const ranges = [
    { start: 1, end: 5 },
    { start: 14, end: 18 },
  ]
  const r = await runExport({ fixture: 'speech.wav', ranges, width: 360, height: 640, fps: 30, saveAs: 'export-audio-only' })
  const file = join(OUT, r.file)
  const s = streams(file)
  console.log(`    ${r.method} ${s.video?.codec_name} ${s.video?.width}x${s.video?.height} + ${s.audio?.codec_name}, ${s.duration.toFixed(3)} s; frames handed to draw: ${r.sizes}`)
  assert(r.sizes.length === 1 && r.sizes[0] === '0x0', 'draw gets no frame (null, 0x0) and paints the picture itself')
  assert(s.video?.width === 360 && !!s.audio && near(s.duration, 8, 0.05), 'a 360x640 video with the cut speech, 8 s')
  checkSound('audio-only', file, fx.speech, timelineOf(ranges))
})

await check('export at 60 fps', async () => {
  const r = await runExport({ fixture: 'talk.webm', ranges: [{ start: 3, end: 5 }], width: 360, height: 640, fps: 60, saveAs: 'export-60fps' })
  const file = join(OUT, r.file)
  const s = streams(file)
  const frames = videoFrameCount(file)
  console.log(`    ${s.video.r_frame_rate}, ${frames} frames, ${s.duration.toFixed(3)} s; first draw times ${r.times.map((t) => t.toFixed(4))}`)
  assert(frames === 120 && near(s.duration, 2, 0.03), '2 s at 60 fps = 120 frames')
  assert(near(r.times[1], 1 / 60, 1e-9), 'draw called every 1/60 s of edited time')
})

await check('abort', async () => {
  const r = await page.evaluate(async () => {
    const { exportVideo } = await import('/src/media/export.ts')
    const source = await T.fixture('talk.webm')
    const results = {}
    for (const method of ['webcodecs', 'recorder']) {
      const ac = new AbortController()
      const started = performance.now()
      const p = exportVideo({ source, ranges: [{ start: 0, end: 25 }], width: 720, height: 1280, method, draw: T.draw(), signal: ac.signal })
      setTimeout(() => ac.abort(), 800)
      const outcome = await p.then(() => 'resolved', (e) => e.name)
      results[method] = { outcome, ms: Math.round(performance.now() - started) }
    }
    // Still works afterwards.
    const after = await exportVideo({ source, ranges: [{ start: 1, end: 2 }], width: 360, height: 640, draw: T.draw() })
    results.after = after.blob.size
    return results
  })
  console.log(`    ${JSON.stringify(r)}`)
  assert(r.webcodecs.outcome === 'AbortError' && r.webcodecs.ms < 2000, `WebCodecs export stops promptly with AbortError (${r.webcodecs.ms} ms)`)
  assert(r.recorder.outcome === 'AbortError' && r.recorder.ms < 2000, `recorder export stops promptly with AbortError (${r.recorder.ms} ms)`)
  assert(r.after > 0, 'the next export works')
})

await check('errors', async () => {
  const r = await page.evaluate(async () => {
    const { exportVideo } = await import('/src/media/export.ts')
    const out = {}
    for (const [name, ranges] of [['talk.mp4', [{ start: 0, end: 2 }]], ['hevc.mp4', [{ start: 0, end: 2 }]], ['talk.webm', []], ['talk.webm', [{ start: 30, end: 40 }]]]) {
      try {
        await exportVideo({ source: await T.fixture(name), ranges, width: 360, height: 640, draw: T.draw() })
        out[`${name} ${JSON.stringify(ranges)}`] = 'resolved?!'
      } catch (error) {
        out[`${name} ${JSON.stringify(ranges)}`] = { name: error.name, code: error.code, message: error.message }
      }
    }
    try {
      await exportVideo({ source: await T.fixture('talk.webm'), ranges: [{ start: 0, end: 1 }], width: 360, height: 640, draw: () => { throw new Error('caption renderer bug') } })
    } catch (error) {
      out.draw = error.message
    }
    return out
  })
  for (const [k, v] of Object.entries(r)) console.log(`    ${k}: ${JSON.stringify(v)}`)
  assert(r['talk.mp4 [{"start":0,"end":2}]'].code === 'video-codec' && /H\.264/.test(r['talk.mp4 [{"start":0,"end":2}]'].message), 'H.264 where the browser can’t decode it: a clear video-codec error')
  assert(r['hevc.mp4 [{"start":0,"end":2}]'].code === 'video-codec' && /HEVC/.test(r['hevc.mp4 [{"start":0,"end":2}]'].message), 'HEVC: the Most Compatible advice')
  assert(r['talk.webm []'].code === 'empty' && r['talk.webm [{"start":30,"end":40}]'].code === 'empty', 'nothing kept: an "empty" error')
  assert(r.draw === 'caption renderer bug', 'an error thrown by draw comes back as is (not retried in realtime)')
})

await check('share', async () => {
  const [download, outcome] = await Promise.all([
    page.waitForEvent('download', { timeout: 10_000 }),
    page.evaluate(async () => {
      const { shareOrDownload } = await import('/src/media/share.ts')
      return shareOrDownload(new Blob([new Uint8Array(1000)], { type: 'video/mp4' }), 'My video.mp4', 'My video')
    }),
  ])
  assert(outcome === 'downloaded' && download.suggestedFilename() === 'My video.mp4', `no Web Share here, so it downloads (${outcome}, “${download.suggestedFilename()}”)`)
})

await check('probe exports', async () => {
  const names = ['export-webcodecs.webm', 'export-recorder.webm'].filter((n) => existsSync(join(OUT, n)))
  if (!names.length) return void console.log('    (no exports from this run to read back)')
  const infos = await page.evaluate(async (names) => {
    const { probeMedia } = await import('/src/media/probe.ts')
    const out = {}
    for (const name of names) out[name] = await probeMedia(await (await fetch(`/__out/${name}`)).blob(), name)
    return out
  }, names)
  for (const [name, info] of Object.entries(infos)) console.log(`    ${name}: ${JSON.stringify(info)}`)
  for (const [name, info] of Object.entries(infos)) assert(near(info.duration, TL.duration, 0.25) && info.width === 720 && info.hasAudio, `${name} reads back: ${info.duration.toFixed(3)} s`)
})

console.log('\nTimings (export speed vs realtime):')
for (const [label, duration, seconds] of timings) console.log(`  ${label}: ${duration.toFixed(1)} s of video in ${seconds.toFixed(2)} s → ${(duration / seconds).toFixed(2)}x`)
console.log(`\n${summary.join('\n')}`)
await browser.close()
await server.close()
process.exit(failures ? 1 : 0)
