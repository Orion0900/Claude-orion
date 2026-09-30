/**
 * The features that make a run feel like a run, checked end to end:
 * countdown, auto-pause and manual pause, the stats view, spoken splits,
 * the finish celebration and badges, sharing, and the running log.
 *
 * Run from a directory where `playwright` resolves, against a build served at
 * http://localhost:4180/Claude-orion/ (see README.md).
 */
import { CHROME, chromium, findRoutesAndGpx, geo, hav, openApp, toLL, toXY } from './harness.mjs'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const SHOTS = process.env.SHOTS

const browser = await chromium.launch({ executablePath: CHROME })
const { context, page, errors } = await openApp(browser, { serviceWorkers: 'block' })
await context.grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write'])
const shot = (name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null)
await page.addInitScript(() => {
  window.__timeOffset = 0
  const geolocation = navigator.geolocation
  const wrap = (callback) => (position) =>
    callback({ coords: position.coords, timestamp: position.timestamp + window.__timeOffset })
  const watch = geolocation.watchPosition.bind(geolocation)
  const once = geolocation.getCurrentPosition.bind(geolocation)
  geolocation.watchPosition = (ok, fail, options) => watch(wrap(ok), fail, options)
  geolocation.getCurrentPosition = (ok, fail, options) => once(wrap(ok), fail, options)
  window.__spoken = []
  if (window.speechSynthesis) {
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis)
    window.speechSynthesis.speak = (u) => {
      window.__spoken.push(u.text)
      try { speak(u) } catch {}
    }
  }
})
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('.leaflet-container')

const coords = await findRoutesAndGpx(page)
const cum = [0]
for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]))
const total = cum[cum.length - 1]
const at = (m) => coords[Math.max(0, cum.findIndex((d) => d >= m))] ?? coords[coords.length - 1]
const spoken = () => page.evaluate(() => window.__spoken)
const advance = (ms) => page.evaluate((ms) => { window.__timeOffset += ms }, ms)
const walk = async (from, to, stepM = 15, wait = 110) => {
  for (let d = from; d <= to; d += stepM) {
    await context.setGeolocation(geo(at(d), 6))
    await page.waitForTimeout(wait)
  }
}

check('no history shown before the first run', (await page.locator('.run-history').count()) === 0)

// --- countdown ---
await context.setGeolocation(geo(coords[0], 6))
await page.locator('.route-card[aria-current="true"] button.btn', { hasText: 'Start run' }).click()
await page.waitForSelector('.nav')
const counting = await page.locator('.nav-countdown-number').innerText()
await shot('feat-countdown')
check('a run opens with a countdown', counting === '3', counting)
await page.waitForTimeout(4200)
check('the countdown clears by itself', (await page.locator('.nav-countdown').count()) === 0)
const said = await spoken()
check('and counts down out loud', ['3', '2', '1', 'Go!'].every((n) => said.includes(n)), said.slice(0, 6).join(', '))

// --- stats view ---
await walk(0, 300)
await page.locator('.nav-summary').click()
const statsText = await page.locator('.nav-summary').innerText()
check('tapping the summary shows run time and pace', /avg|pace after/.test(statsText), JSON.stringify(statsText.replace(/\n/g, ' | ')))

// --- auto-pause: stand at a crossing for 12 s of GPS time ---
const standAt = toXY(at(300))
for (let s = 0; s < 12; s++) {
  await advance(1000)
  const wobble = toLL({ x: standAt.x + ((s * 7) % 5) - 2, y: standAt.y + ((s * 3) % 5) - 2 })
  await context.setGeolocation(geo(wobble, 6))
  await page.waitForTimeout(150)
}
const autoPaused = await page.locator('.nav-paused').innerText().catch(() => '')
await shot('feat-autopaused')
check('standing still auto-pauses the clock', /Auto-paused/.test(autoPaused), autoPaused.replace(/\n/g, ' | '))
const frozen1 = await page.locator('.nav-eta').innerText()
await page.waitForTimeout(2200)
const frozen2 = await page.locator('.nav-eta').innerText()
check('the clock stops while paused', frozen1 === frozen2, `${frozen1} -> ${frozen2}`)
check('and says so', (await spoken()).includes('Run paused.'))
// set off again
for (let d = 315; d <= 420; d += 15) {
  await advance(1000)
  await context.setGeolocation(geo(at(d), 6))
  await page.waitForTimeout(150)
}
check('moving again resumes by itself', (await page.locator('.nav-paused').count()) === 0)
check('and says so too', (await spoken()).includes('Run resumed.'))

// --- manual pause ---
await page.locator('.nav-pause').click()
check('the pause button pauses', /^Paused/.test(await page.locator('.nav-paused').innerText().catch(() => '')))
// A manual pause is the runner's to end, even if they move.
await walk(420, 520)
check('a manual pause holds while moving', (await page.locator('.nav-paused').count()) === 1)
await page.locator('.nav-resume').click()
check('Resume carries on', (await page.locator('.nav-paused').count()) === 0)

// --- the stats view is remembered across a reload ---
await page.waitForTimeout(4500)
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('.nav')
check('no countdown when picking a run back up', (await page.locator('.nav-countdown').count()) === 0)
check('the chosen stats view is remembered', /avg|pace after/.test(await page.locator('.nav-summary').innerText()))

// --- spoken splits: past the first mile ---
await walk(520, 1750, 20, 90)
const splitCue = (await spoken()).find((t) => /^Mile 1\./.test(t))
check('the first mile is called out with time and pace', Boolean(splitCue && /Average pace/.test(splitCue)), splitCue ?? '(none)')

// --- halfway, last stretch, finish ---
await walk(1750, total, 25, 60)
await context.setGeolocation(geo(coords[coords.length - 1], 6))
await page.waitForTimeout(900)
const allSaid = await spoken()
check('halfway is called', allSaid.some((t) => t.startsWith('Halfway')))
check('the last half mile is called', allSaid.some((t) => t.startsWith('Half a mile to go')))
await page.waitForSelector('.finish-card', { timeout: 5000 })
await shot('feat-finish')
const badges = await page.locator('.finish-badge').allInnerTexts()
check('the finish shows what the run earned', badges.some((b) => /First run logged/.test(b)), badges.map((b) => b.split('\n')[0]).join(', '))
check('with a burst of confetti', (await page.locator('.confetti-bit').count()) > 0)

await page.locator('.finish-actions button', { hasText: 'Share' }).click()
await page.waitForTimeout(400)
const note = await page.locator('.finish-note').innerText().catch(() => '')
const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '')
check('Share hands over a line about the run', /LoopMaker/.test(clip) || note.length > 0, clip || note)

await page.locator('.finish-actions button', { hasText: 'Done' }).click()
await page.waitForTimeout(500)
const history = await page.locator('.run-history').innerText().catch(() => '')
await shot('feat-history')
check('the run appears in the log', /1 run/.test(history) && /week streak/.test(history), history.replace(/\n/g, ' | '))

// --- a second run, ended early, still logged, and "keep running" undoes it ---
await context.setGeolocation(geo(coords[0], 6))
await page.locator('.route-card[aria-current="true"] button.btn', { hasText: 'Start run' }).click()
await page.waitForSelector('.nav')
await page.locator('.nav-countdown').click()
check('the countdown can be skipped with a tap', (await page.locator('.nav-countdown').count()) === 0)
await walk(0, 700)
await page.locator('.nav-end').click()
await page.locator('.nav-end').click()
await page.waitForSelector('.finish-card', { timeout: 3000 }).catch(() => undefined)
check('ending partway shows how it went', /ended early/i.test(await page.locator('.finish-eyebrow').innerText().catch(() => '')))
await page.locator('.finish-continue').click()
check('Keep running takes the run back up', (await page.locator('.nav-paused').count()) === 0 && (await page.locator('.nav-footer').count()) === 1)
await walk(700, 800)
await page.locator('.nav-end').click()
await page.locator('.nav-end').click()
await page.waitForSelector('.finish-card')
await page.locator('.finish-actions button', { hasText: 'Done' }).click()
await page.waitForTimeout(500)
const history2 = await page.locator('.run-history').innerText().catch(() => '')
check('both runs logged, the second once', /2 runs/.test(history2), history2.split('\n').slice(-1)[0])

// --- a run too short to count leaves no trace ---
await context.setGeolocation(geo(coords[0], 6))
await page.locator('.route-card[aria-current="true"] button.btn', { hasText: 'Start run' }).click()
await page.waitForSelector('.nav')
await page.locator('.nav-countdown').click()
await walk(0, 100)
await page.locator('.nav-end').click()
await page.locator('.nav-end').click()
await page.waitForTimeout(400)
check('a false start just exits', (await page.locator('.nav').count()) === 0 && /2 runs/.test(await page.locator('.run-history').innerText()))

check('no page errors', errors.length === 0, errors.join('; '))
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
await browser.close()
process.exit(results.every((r) => r.ok) ? 0 : 1)
