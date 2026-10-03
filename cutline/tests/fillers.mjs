// Does the AI Edit do what it promises on a talking clip with ums and long
// pauses? Imports CLIP, transcribes it, runs the AI Edit and exports; then
// imports the export as a new project and transcribes that too, so the words
// that survived can be compared with the words that were said. Prints both
// transcripts and the lengths, and saves the export for an audio check.
//
//   npm run build
//   FIXTURES=<dir with models/> CLIP=<talking clip> OUT=<dir> node tests/fillers.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPHONE, launch, serve, watchErrors } from './harness.mjs'

const { FIXTURES, CLIP, OUT = '/tmp' } = process.env
if (!FIXTURES || !CLIP) throw new Error('Set FIXTURES (with models/) and CLIP')
const server = await serve({ port: 4350, models: join(FIXTURES, 'models') })
const browser = await launch()
const context = await browser.newContext({ ...IPHONE, acceptDownloads: true })
await context.addInitScript((host) => {
  localStorage.setItem('cutline.modelHost', host)
  localStorage.setItem('cutline.settings', JSON.stringify({ model: 'tiny', language: 'en', exportShortSide: 720, preset: 'bold' }))
}, server.modelHost)
const page = await context.newPage()
const errors = watchErrors(page)
const seconds = (text) => text.trim().split(':').map(Number).reduce((t, n) => t * 60 + n, 0)

async function transcribe(file) {
  await page.setInputFiles('input[type=file][accept="video/*"]', file)
  await page.waitForSelector('.editor', { timeout: 30_000 })
  await page.click('button.tab:has-text("Edit")')
  await page.waitForSelector('.transcript .word', { timeout: 300_000 })
  await page.waitForSelector('.stage-banner', { state: 'detached', timeout: 300_000 })
  const words = await page.locator('.transcript .word').allInnerTexts()
  const exact = await page.evaluate(() => {
    const v = document.querySelector('video')
    return v ? v.duration : null
  })
  return { words, length: seconds((await page.locator('.transport .time').innerText()).split('/')[1]), exact }
}

try {
  await page.goto(server.url)
  const original = await transcribe(CLIP)
  console.log(`said (${original.exact?.toFixed(2)} s): ${original.words.join(' ')}`)
  // The project as stored — word timings and the loudness envelope — for a closer look.
  const stored = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('cutline')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(['projects', 'files'], 'readonly')
          const all = tx.objectStore('projects').getAll()
          all.onsuccess = () => {
            const project = all.result.sort((a, b) => b.createdAt - a.createdAt)[0]
            const analysis = tx.objectStore('files').get(`${project.id}:analysis`)
            analysis.onsuccess = () => {
              const a = analysis.result
              resolve({
                words: project.words,
                duration: project.media.duration,
                analysis: a ? { frameDuration: a.frameDuration, envelope: Array.from(new Float32Array(a.envelope)) } : null,
              })
            }
          }
        }
      }),
  )
  writeFileSync(join(OUT, 'stored-project.json'), JSON.stringify(stored))
  await page.click('.ai-hero')
  await page.waitForTimeout(500)
  const edited = seconds((await page.locator('.transport .time').innerText()).split('/')[1])
  const struck = await page.locator('.transcript .word.removed, .transcript .word.filler').allInnerTexts()
  console.log(`AI Edit: ${original.length} s → ${edited} s; struck in the transcript: ${struck.join(' ') || '(none)'}`)
  await page.click('.export-btn')
  await page.click('button:has-text("Export video")')
  await page.waitForSelector('text=Ready to post', { timeout: 600_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Save or share")')])
  const exported = join(OUT, `edited-${await download.suggestedFilename()}`)
  await download.saveAs(exported)
  await page.click('button:has-text("Done")')
  await page.click('button[aria-label="Back to projects"]')
  console.log(`exported: ${exported}`)

  const again = await transcribe(exported)
  console.log(`heard in the export (${again.exact?.toFixed(2)} s): ${again.words.join(' ')}`)
  if (errors.length) console.log('page errors:\n' + errors.join('\n'))
} catch (error) {
  console.error(error)
  if (errors.length) console.error('page errors:\n' + errors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
