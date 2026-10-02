// Drives the built app end to end in a phone-sized Chromium: import a talking
// video, wait for on-device transcription, run the AI Edit, change the look,
// export, and check the exported file with ffprobe. Then records a take with
// Chromium's fake camera. Fails on any page or console error.
//
//   npm run build
//   FIXTURES=<dir with talk.webm and models/Xenova/whisper-tiny> node tests/smoke.mjs
//
// FIXTURES/models holds a copy of Xenova/whisper-tiny in Hugging Face's
// layout; it's served from a local stand-in for huggingface.co. Set
// SHOTS=<dir> to keep screenshots.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { IPHONE, launch, serve, watchErrors } from './harness.mjs'

const FIXTURES = process.env.FIXTURES
if (!FIXTURES) throw new Error('Set FIXTURES to the folder with talk.webm and models/')
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const server = await serve({ models: join(FIXTURES, 'models') })
const browser = await launch()
const context = await browser.newContext({ ...IPHONE, acceptDownloads: true, permissions: ['camera', 'microphone'] })
await context.addInitScript((host) => {
  localStorage.setItem('cutline.modelHost', host)
  if (!localStorage.getItem('cutline.settings')) {
    localStorage.setItem('cutline.settings', JSON.stringify({ model: 'tiny', language: 'en', exportShortSide: 720, preset: 'bold' }))
  }
}, server.modelHost)
const page = await context.newPage()
const errors = watchErrors(page)
let step = 0

async function shot(name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${String(++step).padStart(2, '0')}-${name}.png`) })
}

function check(condition, message) {
  if (!condition) throw new Error(`Check failed: ${message}`)
  console.log(`  ✓ ${message}`)
}

const seconds = (text) => {
  const parts = text.trim().split(':').map(Number)
  return parts.reduce((total, n) => total * 60 + n, 0)
}

try {
  console.log('Home')
  await page.goto(server.url)
  await page.waitForSelector('.wordmark')
  await shot('home')

  console.log('Import')
  await page.setInputFiles('input[type=file][accept="video/*"]', join(FIXTURES, 'talk.webm'))
  await page.waitForSelector('.editor', { timeout: 30_000 })
  await page.waitForSelector('.stage-banner', { timeout: 30_000 })
  await shot('transcribing')

  console.log('Transcribe')
  await page.click('button.tab:has-text("Edit")')
  await page.waitForSelector('.transcript .word', { timeout: 240_000 })
  await page.waitForSelector('.stage-banner', { state: 'detached', timeout: 240_000 })
  const transcript = await page.locator('.transcript').innerText()
  check(/fellow americans/i.test(transcript), `transcript has the speech (“${transcript.slice(0, 60)}…”)`)
  check((transcript.match(/country/gi) ?? []).length >= 3, 'both passages were transcribed')
  const before = seconds((await page.locator('.transport .time').innerText()).split('/')[1])
  check(before > 25 && before < 27, `edited length starts as the whole video (${before} s)`)
  await shot('transcript')

  console.log('AI Edit')
  await page.click('.ai-hero')
  await page.waitForTimeout(400)
  const after = seconds((await page.locator('.transport .time').innerText()).split('/')[1])
  check(after < before - 2, `AI Edit cut the pauses (${before} s → ${after} s)`)
  await shot('ai-edit')

  console.log('Tap a word to cut it')
  await page.locator('.transcript .word', { hasText: /^ask/i }).first().click()
  await page.click('.word-actions .pill:has-text("Cut")')
  check((await page.locator('.transcript .word.removed').count()) === 1, 'the word is struck out')
  await page.click('button[aria-label="Undo"]')
  check((await page.locator('.transcript .word.removed').count()) === 0, 'undo restores it')

  console.log('Captions')
  await page.click('button.tab:has-text("Captions")')
  await page.waitForSelector('.presets .preset')
  check((await page.locator('.presets .preset').count()) === 10, 'ten caption styles')
  await page.locator('.presets .preset').nth(2).click()
  await page.locator('.scrubber').click({ position: { x: 60, y: 22 } })
  await page.waitForTimeout(500)
  await shot('captions-box')
  await page.locator('.presets .preset').nth(0).click()

  console.log('Format')
  await page.click('button.tab:has-text("Format")')
  await page.click('.pill:has-text("1:1")')
  await page.waitForTimeout(300)
  await shot('square')
  await page.click('.pill:has-text("9:16")')
  await page.locator('.row', { hasText: 'Title card' }).locator('.switch').click()
  await page.fill('input[placeholder^="e.g. Nobody"]', 'Ask what YOU can do')
  await page.locator('.scrubber').click({ position: { x: 20, y: 22 } })
  await page.waitForTimeout(400)
  await shot('hook')

  console.log('Play')
  await page.click('.play-btn')
  await page.waitForTimeout(1500)
  const playing = await page.locator('.transport .time b').innerText()
  check(seconds(playing) >= 1, `playback advances (${playing})`)
  await page.click('.play-btn')

  console.log('Export')
  await page.click('.export-btn')
  await page.click('button:has-text("Export video")')
  await page.waitForSelector('text=Ready to post', { timeout: 300_000 })
  await shot('exported')
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Save or share")')])
  const file = join(SHOTS ?? '/tmp', await download.suggestedFilename())
  await download.saveAs(file)
  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file]).toString(),
  )
  const video = probe.streams.find((s) => s.codec_type === 'video')
  const audio = probe.streams.find((s) => s.codec_type === 'audio')
  const duration = Number(probe.format.duration)
  check(video && video.width === 720 && video.height === 1280, `exported 720×1280 video (${video?.width}×${video?.height})`)
  check(!!audio, 'exported video has sound')
  check(Math.abs(duration - after) < 1.2, `export is the edited length (${duration.toFixed(2)} s vs ${after} s)`)
  await page.click('button:has-text("Done")')

  console.log('Back home, project kept')
  await page.click('button[aria-label="Back to projects"]')
  await page.waitForSelector('.project-card')
  check((await page.locator('.project-card').count()) === 1, 'the project is listed')
  await shot('projects')

  console.log('Reload keeps everything')
  await page.reload()
  await page.click('.project-card')
  await page.click('button.tab:has-text("Edit")')
  await page.waitForSelector('.transcript .word')
  const kept = seconds((await page.locator('.transport .time').innerText()).split('/')[1])
  check(Math.abs(kept - after) < 0.6, `the edit survived a reload (${kept} s)`)
  await page.click('button[aria-label="Back to projects"]')

  console.log('Record with the teleprompter')
  await page.click('.action-tile.record')
  await page.waitForSelector('.recorder video')
  await page.waitForTimeout(800)
  await shot('recorder')
  await page.click('.rec-btn')
  await page.waitForSelector('.rec-timer', { timeout: 6000 })
  await page.waitForTimeout(2500)
  await page.click('.rec-btn')
  await page.waitForSelector('button:has-text("Use this take")', { timeout: 10_000 })
  await page.click('button:has-text("Use this take")')
  await page.waitForSelector('.editor', { timeout: 30_000 })
  check(true, 'a recorded take opens in the editor')

  console.log('Settings')
  await page.click('button[aria-label="Back to projects"]')
  await page.click('button[aria-label="Settings"]')
  await page.waitForSelector('text=Captions model')
  await shot('settings')

  const unexpected = errors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of 404/.test(e))
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
