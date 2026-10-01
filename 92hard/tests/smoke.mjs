// Walks a run on a phone-sized screen with the clock pinned: start, a full
// day ticked off, a missed day logged late, a start-over, and a finished run.
// SHOTS=<dir> saves screenshots. Run after `npm run build`.
import assert from 'node:assert/strict'
import { IPHONE, at, launch, serve, watchErrors } from './harness.mjs'

const shots = process.env.SHOTS
const server = await serve()
const browser = await launch()
const context = await browser.newContext(IPHONE)
const page = await context.newPage()
const errors = watchErrors(page)
const shot = async (name, full = false) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage: full })
const text = (selector) => page.locator(selector).first().innerText()
const tapTimes = async (selector, n) => {
  for (let i = 0; i < n; i++) await page.locator(selector).first().tap()
}

// Day 1 is October 1st.
await page.clock.setFixedTime(at('2026-10-01', '07:30:00'))
await page.goto(server.url)
await page.waitForSelector('.start')
await page.waitForTimeout(300)
await shot('01-start', true)
assert.match(await text('.start-dates'), /Oct 1.*Dec 31/)

await page.tap('.btn.primary.big')
await page.waitForSelector('.hero')
await page.waitForTimeout(300)
await shot('02-day-1')
assert.equal(await text('.hero-number'), '1')

// Halfway through the gym and hyperextensions.
await tapTimes('.add-set', 8)
await page.tap('.step >> text=+25')
await page.tap('.step >> text=+20')
await page.waitForTimeout(300)
await shot('03-day-1-under-way')
await shot('03b-day-1-under-way-full', true)
assert.equal(await text('.task-count'), '8/15')

// The rest of the day.
await tapTimes('.add-set', 7)
await page.tap('.toggle-chip')
await page.tap('.step >> text=+25')
await page.tap('.step >> text=+20')
await page.tap('[aria-label="Undo"]')
await page.tap('.step >> text=+15')
await page.tap('.step >> text=+15')
await page.tap('.task-toggle >> text=Maker School')
await page.tap('.task-toggle >> text=Vlog')
await page.waitForSelector('.cheer')
await page.waitForTimeout(500)
await shot('04-day-1-done')
assert.equal(await page.locator('.task.done').count(), 4)
assert.equal(await text('.cheer'), 'DAY 1\nDONE')
await page.waitForSelector('.cheer', { state: 'detached' })
await page.evaluate(() => window.scrollTo(0, 0))
await shot('04b-day-1-done-top')

// Progress after one day.
await page.tap('.tab >> text=Progress')
await page.waitForSelector('.board')
await page.waitForTimeout(300)
await shot('05-progress', true)
assert.equal(await page.locator('.board .cell.done').count(), 1)

await page.tap('.tab >> text=Settings')
await page.waitForTimeout(300)
await shot('06-settings', true)

// Skip October 2nd entirely, then open the app on the 3rd.
await page.clock.setFixedTime(at('2026-10-03', '08:00:00'))
await page.reload()
await page.tap('.tab >> text=Today')
await page.waitForSelector('.missed-view')
await page.waitForTimeout(300)
await shot('07-missed')
assert.match(await text('.missed-title'), /Day 2/i)

// It was done, just never ticked: log it late from the sheet.
await page.tap('.missed-view .btn.primary')
await page.waitForSelector('.sheet')
await page.waitForTimeout(400)
await page.tap('.sheet .alt-btn')
await page.tap('.sheet .count-btn')
await page.fill('.sheet .count-input', '100')
await page.locator('.sheet .count-input').press('Enter')
await page.tap('.sheet .task-toggle >> text=Maker School')
await page.tap('.sheet .task-toggle >> text=Vlog')
await page.waitForTimeout(400)
await shot('08-sheet-logged')
assert.match(await text('.sheet-status'), /All four done/)
await page.tap('.sheet [aria-label="Close"]')
await page.waitForSelector('.hero')
assert.equal(await text('.hero-number'), '3')

// Day 3 never happens. Start over on the 5th.
await page.clock.setFixedTime(at('2026-10-05', '09:00:00'))
await page.reload()
await page.waitForSelector('.missed-view')
await page.tap('.missed-view .btn.danger')
await page.waitForSelector('.confirm')
await page.waitForTimeout(300)
await shot('09a-confirm-start-over')
await page.tap('.confirm .btn.danger')
await page.waitForSelector('.start')
assert.match(await text('.start-lede'), /Attempt 2.*2 days/)
await page.tap('.seg >> text=Earlier')
await page.fill('.stepper-input', '1')
await page.fill('.stepper-input', '12')
await page.locator('.stepper-input').blur()
await page.waitForTimeout(200)
await shot('09-start-again', true)
assert.match(await text('.start-dates'), /Sep 24/)
await page.tap('.btn.primary.big')
await page.waitForSelector('.hero')
assert.equal(await text('.hero-number'), '12')
await page.tap('.tab >> text=Progress')
await page.waitForTimeout(300)
await shot('10-progress-carried', true)
assert.equal(await page.locator('.board .cell.carried').count(), 11)
assert.equal(await page.locator('.history-item').count(), 2)

// Back up, erase everything, and restore the backup from the start screen.
await page.tap('.tab >> text=Settings')
const [download] = await Promise.all([page.waitForEvent('download'), page.tap('.btn >> text=Back up')])
const backupPath = await download.path()
assert.match(download.suggestedFilename(), /^92-hard-backup-2026-10-05\.json$/)
await page.tap('text=Erase everything')
await page.tap('.confirm .btn.danger')
await page.waitForSelector('.start')
assert.match(await text('.start-lede'), /92 days/)
await page.setInputFiles('.start-foot input[type=file]', backupPath)
await page.waitForSelector('.hero')
assert.equal(await text('.hero-number'), '12')

// A run that starts tomorrow waits, and can be brought forward.
await page.tap('.tab >> text=Settings')
// Cancel first: nothing goes.
await page.tap('text=Erase everything')
await page.tap('.confirm .btn >> text=Cancel')
await page.waitForSelector('.confirm', { state: 'detached' })
assert.equal(await page.locator('.facts dd').first().innerText(), 'Thu, Sep 24')
await page.tap('text=Erase everything')
await page.tap('.confirm .btn.danger')
await page.waitForSelector('.start')
await page.tap('.seg >> text=Tomorrow')
await page.tap('.btn.primary.big')
await page.waitForSelector('.upcoming-view')
await page.waitForTimeout(300)
await shot('11-upcoming')
assert.match(await text('.upcoming-when'), /Tomorrow/i)
await page.tap('text=Start today instead')
await page.waitForSelector('.hero')
assert.equal(await text('.hero-number'), '1')

// A finished run, seeded straight into storage.
const full = { sets: 15, neck: true, halfMarathon: false, hyperextensions: 100, makerSchool: true, vlog: true, note: '' }
const logs = {}
for (let i = 0; i < 92; i++) {
  const d = new Date(Date.UTC(2026, 9, 1 + i))
  logs[d.toISOString().slice(0, 10)] = i % 9 === 4 ? { ...full, sets: 0, neck: false, halfMarathon: true } : full
}
await page.evaluate((state) => localStorage.setItem('92hard.state', JSON.stringify(state)), {
  version: 1,
  attempt: { start: '2026-10-01', carried: 0, logs },
  history: [{ start: '2026-09-01', end: '2026-09-09', completed: 8, outcome: 'restarted' }],
})
await page.clock.setFixedTime(at('2026-12-31', '21:00:00'))
await page.reload()
await page.tap('.tab >> text=Today')
await page.waitForSelector('.finished-view')
await page.waitForTimeout(400)
await shot('12-finished', true)
assert.match(await text('.finished-title'), /Done/i)

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors')
await browser.close()
server.close()
if (errors.length) process.exit(1)
console.log('smoke: ok')
