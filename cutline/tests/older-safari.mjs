// The core flow on the iPhones that came before Safari 26, simulated in
// Chromium by taking away what those versions lack and reporting Apple as
// the browser vendor (which is what Cutline checks for MP4-only output):
//
//   ios17  Safari 16.4–18: WebCodecs for video only, no audio encoder or decoder.
//   ios16  Safari before 16.4: no WebCodecs at all.
//
// Each imports a clip, transcribes it (audio decoded the old way), runs the
// AI Edit and exports, which has to fall back to recording the edit in real
// time; the file is checked with ffprobe.
//
//   npm run build
//   FIXTURES=<dir> node tests/older-safari.mjs [ios17|ios16]
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { IPHONE, launch, serve, watchErrors } from './harness.mjs'

const FIXTURES = process.env.FIXTURES
if (!FIXTURES) throw new Error('Set FIXTURES to the folder with talk.webm and models/')
const OUT = process.env.SHOTS ?? join(process.env.TMPDIR ?? '/tmp', 'cutline-older-safari')
mkdirSync(OUT, { recursive: true })

const PROFILES = {
  ios17: ['AudioEncoder', 'AudioDecoder', 'AudioData', 'EncodedAudioChunk'],
  ios16: ['AudioEncoder', 'AudioDecoder', 'AudioData', 'EncodedAudioChunk', 'VideoEncoder', 'VideoDecoder', 'VideoFrame', 'EncodedVideoChunk', 'ImageDecoder'],
}
const chosen = process.argv[2] ? [process.argv[2]] : Object.keys(PROFILES)

const server = await serve({ port: 4340, models: join(FIXTURES, 'models') })
const browser = await launch()
let failures = 0

function check(condition, message) {
  if (!condition) throw new Error(`Check failed: ${message}`)
  console.log(`  ✓ ${message}`)
}
const seconds = (text) => text.trim().split(':').map(Number).reduce((t, n) => t * 60 + n, 0)

for (const name of chosen) {
  const missing = PROFILES[name]
  if (!missing) throw new Error(`Unknown profile ${name}`)
  console.log(`\n${name}: without ${missing.join(', ')}`)
  const context = await browser.newContext({ ...IPHONE, acceptDownloads: true })
  await context.addInitScript(
    ({ host, missing }) => {
      for (const key of missing) {
        try {
          delete window[key]
        } catch {}
        Object.defineProperty(window, key, { value: undefined, configurable: true })
      }
      Object.defineProperty(Navigator.prototype, 'vendor', { get: () => 'Apple Computer, Inc.', configurable: true })
      localStorage.setItem('cutline.modelHost', host)
      localStorage.setItem('cutline.settings', JSON.stringify({ model: 'tiny', language: 'en', exportShortSide: 720, preset: 'bold' }))
    },
    { host: server.modelHost, missing },
  )
  // The Whisper worker is unaffected by the page's globals, as it would be on a real phone.
  const page = await context.newPage()
  const errors = watchErrors(page)
  try {
    await page.goto(server.url)
    const gone = await page.evaluate((keys) => keys.filter((k) => typeof window[k] !== 'undefined'), missing)
    check(gone.length === 0, 'the missing APIs really are missing')
    await page.setInputFiles('input[type=file][accept="video/*"]', join(FIXTURES, 'talk.webm'))
    await page.waitForSelector('.editor', { timeout: 30_000 })
    check(true, 'the video opens')
    await page.click('button.tab:has-text("Edit")')
    await page.waitForSelector('.transcript .word', { timeout: 300_000 })
    await page.waitForSelector('.stage-banner', { state: 'detached', timeout: 300_000 })
    check(/fellow americans/i.test(await page.locator('.transcript').innerText()), 'transcribed, from audio decoded without WebCodecs')
    const before = seconds((await page.locator('.transport .time').innerText()).split('/')[1])
    await page.click('.ai-hero')
    await page.waitForTimeout(400)
    const after = seconds((await page.locator('.transport .time').innerText()).split('/')[1])
    check(after < before - 2, `AI Edit (${before} s → ${after} s)`)
    await page.click('.play-btn')
    await page.waitForTimeout(1200)
    await page.click('.play-btn')
    check(seconds(await page.locator('.transport .time b').innerText()) >= 1, 'the preview plays')

    await page.click('.export-btn')
    await page.click('button:has-text("Export video")')
    await page.waitForSelector('text=Ready to post', { timeout: 600_000 })
    const meta = await page.locator('.sheet .hint').first().innerText()
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Save or share")')])
    const file = join(OUT, `${name}-${await download.suggestedFilename()}`)
    await download.saveAs(file)
    const probe = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,width,height', '-of', 'json', file]).toString(),
    )
    const video = probe.streams.find((s) => s.codec_type === 'video')
    const audio = probe.streams.find((s) => s.codec_type === 'audio')
    const duration = Number(probe.format.duration)
    console.log(`    ${meta.trim()} — ${probe.format.format_name}, ${video?.codec_name} ${video?.width}×${video?.height}, ${audio?.codec_name}, ${duration.toFixed(2)} s`)
    check(/mp4/.test(probe.format.format_name), 'an MP4, the kind Photos takes')
    check(video?.width === 720 && video?.height === 1280, 'at the chosen size')
    check(!!audio, 'with sound')
    check(Math.abs(duration - after) < 1.5, `the edited length (${duration.toFixed(2)} s vs ${after} s)`)
    const unexpected = errors.filter((e) => !/Failed to load resource/.test(e))
    check(unexpected.length === 0, `no page errors${unexpected.length ? `:\n${unexpected.join('\n')}` : ''}`)
  } catch (error) {
    failures++
    await page.screenshot({ path: join(OUT, `${name}-failure.png`) }).catch(() => {})
    console.error(error)
    if (errors.length) console.error('Page errors:\n' + errors.join('\n'))
  } finally {
    await context.close()
  }
}

await browser.close()
server.close()
if (failures) {
  console.error(`\n${failures} profile(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nAll good')
}
