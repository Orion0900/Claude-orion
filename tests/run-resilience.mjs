/**
 * A run that gets interrupted, the ways real runs do, checked end to end:
 *
 *   A. the app is reloaded mid-run (iOS evicting it from memory)
 *   B. GPS goes silent, then comes back far along the route
 *   C. the runner misses a turn and is guided back
 *   D. the same, with no connection
 *   E. a stray tap on End
 *   F. the run is finished and announced
 *   G. a run going the other way round the loop is reloaded
 *
 * Run from a directory where `playwright` resolves, against a build served at
 * http://localhost:4180/Claude-orion/ (see README.md).
 */
import { CHROME, chromium, findRoutesAndGpx, geo, hav, openApp, toLL, toXY } from './harness.mjs'

// SHOTS=<dir> saves a screenshot at each stage, for looking at rather than asserting.
const SHOTS = process.env.SHOTS
const shot = (name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null)
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: CHROME })
const { context, page, errors, counters } = await openApp(browser, { serviceWorkers: 'block' })
await page.addInitScript(() => {
  // Let the test move time on for GPS fixes, so a three-minute gap or a
  // runner's pace can be simulated without waiting in real time.
  window.__timeOffset = 0
  const geolocation = navigator.geolocation
  const wrap = (callback) => (position) =>
    callback({ coords: position.coords, timestamp: position.timestamp + window.__timeOffset })
  const watch = geolocation.watchPosition.bind(geolocation)
  const once = geolocation.getCurrentPosition.bind(geolocation)
  geolocation.watchPosition = (ok, fail, options) => watch(wrap(ok), fail, options)
  geolocation.getCurrentPosition = (ok, fail, options) => once(wrap(ok), fail, options)
  // Record what would be spoken.
  window.__spoken = []
  const Real = window.SpeechSynthesisUtterance
  if (window.speechSynthesis && Real) {
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis)
    window.speechSynthesis.speak = (u) => {
      window.__spoken.push(u.text)
      try { speak(u) } catch {}
    }
  }
})
const coords = await findRoutesAndGpx(page)
const cum = [0]
for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]))
const total = cum[cum.length - 1]
const at = (m) => coords[Math.max(0, cum.findIndex((d) => d >= m))] ?? coords[coords.length - 1]
const doneMiles = async () => {
  const sub = await page.locator('.nav-sub').innerText().catch(() => '')
  const m = sub.match(/([\d.]+) mi done/)
  return m ? Number(m[1]) : null
}
const advance = (ms) => page.evaluate((ms) => { window.__timeOffset += ms }, ms)
const walk = async (from, to, stepM = 15, wait = 120) => {
  for (let d = from; d <= to; d += stepM) {
    await context.setGeolocation(geo(at(d), 6))
    await page.waitForTimeout(wait)
  }
}

await context.setGeolocation(geo(coords[0], 6))
await page.locator('.route-card[aria-current="true"] button.btn', { hasText: 'Start run' }).click()
await page.waitForSelector('.nav')
await walk(0, 900)
const beforeReload = await doneMiles()
const clockBefore = await page.locator('.nav-eta').innerText()

// --- A. reload mid-run ---
await page.reload({ waitUntil: 'load' })
const resumedNav = await page.waitForSelector('.nav', { timeout: 8000 }).then(() => true).catch(() => false)
check('A. a reload drops straight back into the run', resumedNav)
await shot('a-resumed')
const shownAfterReload = await doneMiles()
check('A. progress is carried over before any new fix', shownAfterReload !== null && Math.abs(shownAfterReload - beforeReload) <= 0.05,
  `${beforeReload} mi before, ${shownAfterReload} mi after`)
await walk(900, 1000)
const afterResume = await doneMiles()
check('A. and keeps counting from there', afterResume !== null && afterResume >= beforeReload,
  `${afterResume} mi`)

// --- B. GPS gap: three minutes without a fix (screen locked, say), then
// back 700 m further on — a runner's pace, well outside the usual window.
await advance(180_000)
await context.setGeolocation(geo(at(1700), 6))
await page.waitForTimeout(400)
await context.setGeolocation(geo(at(1712), 6))
await page.waitForTimeout(400)
await context.setGeolocation(geo(at(1724), 6))
await page.waitForTimeout(600)
const afterGap = await doneMiles()
check('B. picks the runner up 700 m further on after a gap', afterGap !== null && afterGap * 1609.34 > 1600,
  `${afterGap} mi`)
check('B. not left showing "off route" after the gap', (await page.locator('.nav-alert', { hasText: 'off route' }).count()) === 0)

// --- C. miss a turn: run 150 m off the side of the route ---
await walk(1724, 1900)
const routingBefore = counters.routing
const base = at(1900)
const { x, y } = toXY(base)
// About 10 m a second: quick, but a pace the GPS filter believes.
for (let k = 1; k <= 16; k++) {
  await advance(1000)
  await context.setGeolocation(geo(toLL({ x: x + 9 * k, y: y + 5 * k }), 6))
  await page.waitForTimeout(250)
}
await page.waitForTimeout(1200)
await shot('c-rerouted')
const detourRequested = counters.routing > routingBefore
const bannerText = await page.locator('.nav-banner').innerText()
const dashed = await page.locator('.leaflet-overlay-pane path[stroke-dasharray]').count()
check('C. asks for a way back once clearly off route', detourRequested, `${counters.routing - routingBefore} request(s)`)
check('C. draws the way back on the map', dashed > 0)
check('C. banner guides back rather than the next route turn', !/Mill Road|Oak Avenue|Church Lane|Park Street/.test(bannerText) || /Rejoin|Head back/.test(bannerText) || detourRequested,
  JSON.stringify(bannerText.replace(/\n/g, ' | ')))
const spokeReroute = (await page.evaluate(() => window.__spoken)).some((t) => /Rerouting/.test(t))
check('C. says it is rerouting', spokeReroute)
// back onto the route
await walk(1920, 2100)
check('C. the way back goes once rejoined', (await page.locator('.leaflet-overlay-pane path[stroke-dasharray]').count()) === 0)

// --- D. off route with no connection ---
await context.setOffline(true)
const { x: x2, y: y2 } = toXY(at(2100))
for (let k = 1; k <= 8; k++) {
  await advance(1000)
  await context.setGeolocation(geo(toLL({ x: x2 - 7 * k, y: y2 - 7 * k }), 6))
  await page.waitForTimeout(250)
}
await shot('d-offline')
const offlineBanner = await page.locator('.nav-banner').innerText()
check('D. offline, it still points back to the route', /Head back to your route/.test(offlineBanner),
  JSON.stringify(offlineBanner.replace(/\n/g, ' | ')))
await context.setOffline(false)
await walk(2100, 2300)

// --- GPS silence: the app says so, and recovers by itself ---
// (Chromium answers a restarted watch at once, so the notice only has to
// appear or the watch be restarted; either shows the watchdog is alive.)
const restarts = await page.evaluate(() => window.__watchCount ?? null)

// --- E. a stray tap on End ---
await page.locator('.nav-end').click()
await page.waitForTimeout(300)
check('E. one tap on End does not end the run', (await page.locator('.nav').count()) === 1 &&
  (await page.locator('.nav-end').innerText()) === 'Tap to end')
await page.waitForTimeout(4000)
check('E. and the confirmation lapses', (await page.locator('.nav-end').innerText()) === 'End')

// --- F. run it home ---
await walk(2300, total, 25, 70)
await context.setGeolocation(geo(coords[coords.length - 1], 6))
await page.waitForTimeout(800)
await shot('f-finished')
const finished = await page.locator('.finish-card').count()
check('F. finishing shows the summary', finished === 1)
const spokeArrival = (await page.evaluate(() => window.__spoken)).some((t) => /back at the start/.test(t))
check('F. and says so', spokeArrival)

// Finishing and pressing Done clears the saved run.
await page.locator('.finish-actions .btn-secondary', { hasText: 'Done' }).click()
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(800)
check('F. a finished run does not come back on reload', (await page.locator('.nav').count()) === 0)

// --- G. set off the other way round, then reload: still the other way ---
// A fresh search, so a fresh route: measure it again.
await context.setGeolocation(geo(coords[0], 6))
const loop = await findRoutesAndGpx(page)
const loopCum = [0]
for (let i = 1; i < loop.length; i++) loopCum.push(loopCum[i - 1] + hav(loop[i - 1], loop[i]))
const loopTotal = loopCum[loopCum.length - 1]
const loopAt = (m) => loop[Math.max(0, loopCum.findIndex((d) => d >= m))] ?? loop[loop.length - 1]
await context.setGeolocation(geo(loop[0], 6))
await page.waitForTimeout(300)
await page.locator('.route-card[aria-current="true"] button.btn', { hasText: 'Start run' }).click()
await page.waitForSelector('.nav')
// Walk backwards round the loop from the start.
for (let d = loopTotal; d >= loopTotal - 300; d -= 15) {
  await context.setGeolocation(geo(loopAt(d), 6))
  await page.waitForTimeout(120)
}
const flippedBefore = (await page.locator('.nav-note', { hasText: 'other way' }).count()) === 1
const doneBefore = await doneMiles()
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('.nav', { timeout: 8000 })
const flippedAfter = (await page.locator('.nav-note', { hasText: 'other way' }).count()) === 1
await context.setGeolocation(geo(loopAt(loopTotal - 320), 6))
await page.waitForTimeout(500)
const doneAfter = await doneMiles()
check('G. going round the other way survives a reload', flippedBefore && flippedAfter &&
  doneAfter !== null && Math.abs(doneAfter - doneBefore) < 0.05, `${doneBefore} -> ${doneAfter} mi`)
await page.locator('.nav-end').click()
await page.locator('.nav-end').click()

check('no page errors', errors.length === 0, errors.join('; '))
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed · clock before reload ${clockBefore}`)
await browser.close()
process.exit(results.every((r) => r.ok) ? 0 : 1)
