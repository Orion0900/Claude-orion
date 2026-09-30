// Lets the bot play a built-in song start to finish and checks it scores a
// full combo, with screenshots along the way. SONG, DIFF, RATE, SCHEME, SHOTS.
import { IPHONE, launch, serve, watchErrors } from './harness.mjs'

const song = process.env.SONG ?? 'first-light'
const diff = process.env.DIFF ?? 'expert'
const rate = process.env.RATE ?? '1.5'
const scheme = process.env.SCHEME ?? 'tap'
const landscape = process.env.LANDSCAPE === '1'
const shots = process.env.SHOTS
const server = await serve(4191)
const browser = await launch()
const viewport = landscape ? { width: 844, height: 390 } : IPHONE.viewport
const context = await browser.newContext({ ...IPHONE, viewport })
await context.addInitScript((s) => {
  localStorage.setItem('fretfire.settings.v1', JSON.stringify({ scheme: s }))
}, scheme)
const page = await context.newPage()
const errors = watchErrors(page)

await page.goto(`${server.url}?bot&play=${song}&diff=${diff}&rate=${rate}`)
await page.waitForSelector('.game-canvas', { timeout: 60000 })
const started = Date.now()
const marks = (process.env.MARKS ?? '6,14,26,40').split(',').map(Number)
for (const [i, at] of marks.entries()) {
  const wait = at * 1000 - (Date.now() - started)
  if (wait > 0) await page.waitForTimeout(wait)
  if (shots) await page.screenshot({ path: `${shots}/bot-${song}-${diff}-${i}.png` })
}
await page.waitForSelector('.results-screen', { timeout: 300000 })
const results = await page.evaluate(() => window.__fretfire.lastResults)
console.log(JSON.stringify({ song, diff, rate, scheme, ...results, solos: results.solos.length }))
await page.waitForTimeout(1500)
if (shots) await page.screenshot({ path: `${shots}/bot-${song}-${diff}-results.png` })
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors')
await browser.close()
server.close()
const ok = results.fullCombo && results.accuracy === 1 && !errors.length
if (!ok) process.exit(1)
