// Frame cost under a 4x CPU slowdown, as a rough stand-in for an older phone.
import { IPHONE, launch, serve, watchErrors } from './harness.mjs'

const server = await serve(Number(process.env.PORT ?? 4193))
const browser = await launch()
const context = await browser.newContext(IPHONE)
const page = await context.newPage()
const errors = watchErrors(page)
await page.goto(`${server.url}?bot&play=${process.env.SONG ?? 'neon-overdrive'}&diff=expert`)
await page.waitForSelector('.game-canvas', { timeout: 60000 })
const cdp = await context.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE ?? 4) })
await page.waitForTimeout(3000)
const samples = []
const frames = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const gaps = []
      let last = performance.now()
      const tick = (now) => {
        gaps.push(now - last)
        last = now
        if (gaps.length < 240) requestAnimationFrame(tick)
        else resolve(gaps)
      }
      requestAnimationFrame(tick)
    }),
)
for (let i = 0; i < 3; i++) {
  samples.push(await page.evaluate(() => window.__fretfire.game?.debug.frameCost))
  await page.waitForTimeout(1500)
}
frames.sort((a, b) => a - b)
const pct = (p) => frames[Math.floor(frames.length * p)].toFixed(1)
console.log(`draw cost (ms): ${samples.map((s) => s?.toFixed(2)).join(', ')}`)
console.log(`frame gaps (ms): median ${pct(0.5)}, p95 ${pct(0.95)}, max ${frames[frames.length - 1].toFixed(1)}`)
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors')
await browser.close()
server.close()
