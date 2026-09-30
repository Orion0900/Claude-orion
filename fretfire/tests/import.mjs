// Imports a zipped chart through the real file picker, then lets the bot play it.
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureZip } from './fixtures.mjs'
import { IPHONE, launch, serve, watchErrors } from './harness.mjs'

const shots = process.env.SHOTS
const dir = mkdtempSync(join(tmpdir(), 'fretfire-'))
const zipPath = join(dir, 'Fixture Pack.zip')
writeFileSync(zipPath, fixtureZip())

const server = await serve(Number(process.env.PORT ?? 4192))
const browser = await launch()
const context = await browser.newContext(IPHONE)
const page = await context.newPage()
const errors = watchErrors(page)

await page.goto(`${server.url}?bot`)
await page.tap('.title-screen .btn.primary')
await page.waitForSelector('.song-card')
await page.tap('.topbar .btn.small')
await page.waitForSelector('#import-files', { state: 'attached' })
await page.setInputFiles('#import-files', zipPath)
await page.waitForFunction(() => /Added|Nothing|No songs/.test(document.querySelector('.import-status')?.textContent ?? ''))
const status = await page.textContent('.import-status')
console.log('import status:', status)
if (shots) await page.screenshot({ path: `${shots}/import-done.png` })
await page.tap('.import-sheet .sheet-head .btn')
await page.waitForTimeout(400)
const cards = await page.$$eval('.song-card .name', (els) => els.map((e) => e.textContent))
console.log('songs:', cards.join(', '))
await page.tap('.song-card:has-text("Fixture Song")')
await page.waitForSelector('.diff-grid .diff')
await page.waitForTimeout(300)
if (shots) await page.screenshot({ path: `${shots}/import-sheet.png` })
await page.tap('.diff-expert')
await page.tap('.play-button')
await page.waitForSelector('.results-screen', { timeout: 90000 })
const results = await page.evaluate(() => window.__fretfire.lastResults)
console.log(JSON.stringify(results))
// A reload keeps the imported song.
await page.goto(server.url)
await page.tap('.title-screen .btn.primary')
await page.waitForSelector('.song-card')
await page.waitForTimeout(300)
const after = await page.$$eval('.song-card .name', (els) => els.map((e) => e.textContent))
console.log('after reload:', after.join(', '))
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors')
await browser.close()
server.close()
const ok = /Added 1 song/.test(status) && results.fullCombo && after.includes('Fixture Song') && !errors.length
process.exit(ok ? 0 : 1)
