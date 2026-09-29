/**
 * Does it hold up for a whole run? A long, messy run in one go, watching for
 * anything that would build up and eventually take the page down on a phone:
 * memory, DOM nodes, map tiles, layers, and errors.
 *
 * Two full laps of a ~5 mile loop, a fix every few metres with GPS noise, the
 * compass turning constantly, GPS dropping out, the view toggled, the map
 * dragged away and re-centred, pauses, and a reload in the middle.
 *
 * Run from a directory where `playwright` resolves, against a build served at
 * http://localhost:4180/Claude-orion/ (see README.md).
 */
import { CHROME, chromium, findRoutesAndGpx, geo, hav, jitter, mulberry32, openApp } from './harness.mjs'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})
const { context, page, errors } = await openApp(browser, { serviceWorkers: 'block' })
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
await page.addInitScript(() => {
  window.__timeOffset = 0
  const geolocation = navigator.geolocation
  const wrap = (callback) => (position) =>
    callback({ coords: position.coords, timestamp: position.timestamp + window.__timeOffset })
  const watch = geolocation.watchPosition.bind(geolocation)
  geolocation.watchPosition = (ok, fail, options) => watch(wrap(ok), fail, options)
  window.__long = []
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push(e.duration)))
      .observe({ entryTypes: ['longtask'] })
  } catch {}
})
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('.leaflet-container')

const coords = await findRoutesAndGpx(page)
const cum = [0]
for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]))
const total = cum[cum.length - 1]
const at = (m) => coords[Math.max(0, cum.findIndex((d) => d >= m))] ?? coords[coords.length - 1]

const measure = async () => {
  await page.evaluate(() => window.gc?.())
  return page.evaluate(() => ({
    heapMb: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
    nodes: document.getElementsByTagName('*').length,
    tiles: document.querySelectorAll('.leaflet-tile').length,
    paths: document.querySelectorAll('.leaflet-overlay-pane path').length,
    long: window.__long.length,
    longest: Math.max(0, ...window.__long),
  }))
}
const setHeading = (h) =>
  page.evaluate((h) => {
    const e = new Event('deviceorientation')
    e.webkitCompassHeading = h
    window.dispatchEvent(e)
  }, h)

await context.setGeolocation(geo(coords[0], 6))
await page.locator('.route-card[aria-current="true"] button.btn', { hasText: 'Start run' }).click()
await page.waitForSelector('.nav')
await page.locator('.nav-countdown').click()
await page.waitForTimeout(500)
const baseline = await measure()
console.log('baseline', JSON.stringify(baseline))

const rng = mulberry32(99)
let fixes = 0
const samples = []
const t0 = Date.now()

async function lap(label, withReload) {
  for (let d = 0; d <= total; d += 6) {
    fixes++
    await page.evaluate(() => { window.__timeOffset += 2000 })
    // A dropout now and then: nothing for a stretch.
    if (fixes % 400 < 6) continue
    await context.setGeolocation(geo(jitter(at(d), rng, 7), 8 + rng() * 10))
    if (fixes % 3 === 0) await setHeading((d / 5 + rng() * 40) % 360)
    if (fixes % 450 === 0) await page.locator('.nav-float .nav-perspective').click()
    if (fixes % 520 === 0) {
      // Drag the map away, then double-tap back.
      const box = await page.locator('.map').boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(150)
      await page.locator('.nav-recenter').click().catch(() => undefined)
    }
    if (fixes % 610 === 0) {
      await page.locator('.nav-pause').click()
      await page.waitForTimeout(120)
      await page.locator('.nav-resume').click().catch(() => undefined)
    }
    if (fixes % 250 === 0) await page.locator('.nav-summary').click()
    if (withReload && Math.abs(d - total / 2) < 3) {
      await page.waitForTimeout(300)
      await page.reload({ waitUntil: 'load' })
      await page.waitForSelector('.nav')
    }
    await page.waitForTimeout(12)
    if (fixes % 300 === 0) samples.push({ at: `${label} ${Math.round((d / total) * 100)}%`, ...(await measure()) })
  }
}

await lap('lap 1', true)
await context.setGeolocation(geo(coords[coords.length - 1], 6))
await page.waitForTimeout(800)
check('lap 1 finishes with the summary', (await page.locator('.finish-card').count()) === 1)
await page.locator('.finish-continue').click()
// A second lap on the same run: "keep running" round again.
await page.evaluate(() => { window.__timeOffset += 2000 })
await lap('lap 2', false)
const end = await measure()
const seconds = Math.round((Date.now() - t0) / 1000)

for (const s of samples) console.log(`  ${s.at.padEnd(12)} heap ${s.heapMb?.toFixed(1)} MB · nodes ${s.nodes} · tiles ${s.tiles} · paths ${s.paths}`)
console.log('end', JSON.stringify(end))
console.log(`${fixes} fixes in ${seconds}s`)

const heapGrowth = end.heapMb - samples[0].heapMb
check('no page errors', errors.length === 0, errors.slice(0, 3).join('; '))
check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join('; '))
check('memory stays flat over two laps', heapGrowth < 8, `${samples[0].heapMb.toFixed(1)} -> ${end.heapMb.toFixed(1)} MB`)
check('the page does not pile up elements', end.nodes < samples[0].nodes + 150, `${samples[0].nodes} -> ${end.nodes}`)
check('map tiles are recycled, not hoarded', Math.max(...samples.map((s) => s.tiles), end.tiles) < 250, `max ${Math.max(...samples.map((s) => s.tiles))}`)
check('route lines are updated, not stacked', Math.max(...samples.map((s) => s.paths), end.paths) <= 4, `max ${Math.max(...samples.map((s) => s.paths))}`)
check('no main-thread stalls over 200 ms', end.longest < 200, `${end.long} long tasks, longest ${Math.round(end.longest)} ms`)
check('still navigating at the end', (await page.locator('.nav-banner').count()) === 1)

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
await browser.close()
process.exit(results.every((r) => r.ok) ? 0 : 1)
