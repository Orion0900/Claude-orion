// Walks the menus on a phone-sized screen, starts a song, and takes screenshots.
// SHOTS=<dir> saves them. Run after `npm run build`.
import { IPHONE, launch, serve, watchErrors } from './harness.mjs'

const shots = process.env.SHOTS
const server = await serve()
const browser = await launch()
const context = await browser.newContext(IPHONE)
const page = await context.newPage()
const errors = watchErrors(page)
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` })

await page.goto(server.url)
await page.waitForSelector('.title-screen')
await shot('01-title')
await page.tap('.title-screen .btn.primary')
await page.waitForSelector('.song-card')
await page.waitForTimeout(400)
await shot('02-songs')
await page.tap('.song-card[data-id="builtin:first-light"]')
await page.waitForSelector('.diff-grid .diff')
await page.waitForTimeout(600)
await shot('03-song-sheet')
await page.tap('.diff-expert')
await page.tap('.play-button')
await page.waitForSelector('.game-canvas', { timeout: 30000 })
await page.waitForTimeout(1000)
await shot('04-countdown')
await page.waitForTimeout(4200)
await shot('05-playing')
// A few taps on the lanes.
const layout = await page.evaluate(() => window.__fretfire.game?.debug.layout)
for (let i = 0; i < 5; i++) {
  const x = layout.cx + (i - 2) * layout.lane
  await page.touchscreen.tap(x, layout.strikeY)
  await page.waitForTimeout(120)
}
await shot('06-after-taps')
const state = await page.evaluate(() => {
  const g = window.__fretfire.game?.debug
  return g && { state: g.state, score: g.session.score, judged: g.session.judged, time: g.player.timeAt(performance.now()) }
})
console.log('game state', JSON.stringify(state))
await page.tap('.game-pause')
await page.waitForSelector('.pause-menu')
await shot('07-paused')
await page.tap('.pause-menu .btn:nth-child(3)')
await page.waitForSelector('.songs-screen')
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors')
await browser.close()
server.close()
if (errors.length) process.exit(1)
