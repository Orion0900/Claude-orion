// Walks a run on a phone-sized screen with the clock pinned: a weekday, the
// plan, a Saturday rest day and half marathon, a week's hyperextensions, a
// missed day logged late, a week short on hyperextensions and a start-over,
// backups, a run saved by the first version, and a finished run.
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
const ring = () => text('.ring-center')
/** Opens the app on a day and time, as if it had been put away and brought back. */
const openOn = async (date, time = '12:00:00') => {
  await page.clock.setFixedTime(at(date, time))
  await page.reload()
}
const lifted = { sets: 15, split: 'lower', rest: false, halfMarathon: false, hyperextensions: 0, makerSchool: true, note: '' }
const seed = (logs) =>
  page.evaluate((logs) => {
    const state = JSON.parse(localStorage.getItem('92hard.state'))
    Object.assign(state.attempt.logs, logs)
    localStorage.setItem('92hard.state', JSON.stringify(state))
  }, logs)

// Day 1 is Thursday, October 1st.
await page.clock.setFixedTime(at('2026-10-01', '07:40:00'))
await page.goto(server.url)
await page.waitForSelector('.start')
await page.waitForTimeout(300)
await shot('01-start', true)
assert.match(await text('.start-dates'), /Oct 1.*Dec 31/)
assert.match(await text('.start-lede'), /went for it/)
assert.equal(await page.locator('.start .rules li').count(), 5)

await page.tap('.btn.primary.big')
await page.waitForSelector('.hero')
await page.waitForTimeout(300)
await shot('02-day-1', true)
assert.equal(await text('.hero-number'), '1')
// A Thursday asks for a lift and Maker School.
assert.match(await ring(), /0\/2/)
assert.match(await text('.routine-now'), /Now\s+Maker School\s+till 8:30 AM/i)
assert.match(await text('.routine-now'), /Next\s+Work\s+9:00 AM/i)
assert.equal(await page.locator('.task >> text=Half marathon').count(), 0)

// Fifteen sets don't count until upper or lower is picked.
await tapTimes('.add-set', 15)
await page.waitForTimeout(200)
await shot('03-upper-or-lower')
assert.match(await text('[aria-label="Lift"] .task-detail'), /Upper or lower/)
assert.match(await ring(), /0\/2/)
await page.tap('.split >> text=Upper + neck')
assert.match(await ring(), /1\/2/)

// Hyperextensions count toward the week.
await page.tap('.step >> text=+25')
await page.tap('.step >> text=+20')
await page.tap('[aria-label="Undo"]')
assert.equal(await text('.count-btn'), '25/100')
assert.match(await text('[aria-label="Hyperextensions"] .task-detail'), /due Wed/)

await page.tap('.task-toggle >> text=Maker School')
await page.waitForSelector('.cheer')
await page.waitForTimeout(500)
await shot('04-day-1-done')
assert.equal(await text('.cheer'), 'DAY 1\nDONE')
await page.waitForSelector('.cheer', { state: 'detached' })

// The whiteboard.
await page.tap('.tab >> text=Plan')
await page.waitForSelector('.why-quote')
await page.waitForTimeout(300)
await shot('05-plan', true)
assert.equal(await text('.why-quote'), '10 yrs from now I want to say I went for it.'.toUpperCase())
assert.equal(await page.locator('.rules li').count(), 5)
assert.match(await text('.fail-rule'), /Fail = Start Over/i)
assert.match(await text('.routine-group.today'), /M–F/)
assert.match(await text('.routine'), /Going in at 9 feels okay/)
assert.equal(await page.locator('.happiness li').count(), 4)
assert.match(await text('.offer'), /\$50K worth of value/)

await page.tap('.tab >> text=Progress')
await page.waitForSelector('.board')
await page.waitForTimeout(300)
await shot('06-progress', true)
assert.equal(await page.locator('.board .cell.done').count(), 1)

// Friday: a lower day and some hyperextensions.
await openOn('2026-10-02', '06:20:00')
await page.tap('.tab >> text=Today')
await page.waitForSelector('.hero')
assert.match(await text('.routine-now'), /Next\s+Maker School\s+7:00 AM/i)
await tapTimes('.add-set', 15)
await page.tap('.split >> text=Lower')
await page.tap('.step >> text=+15')
await page.tap('.task-toggle >> text=Maker School')
await page.waitForSelector('.cheer')
assert.equal(await text('.count-btn'), '40/100')

// Saturday: the half marathon, and the week's rest day.
await openOn('2026-10-03', '10:15:00')
await page.waitForSelector('.hero')
await page.waitForTimeout(300)
await shot('07-saturday', true)
assert.equal(await text('.hero-number'), '3')
assert.match(await ring(), /0\/3/)
assert.match(await text('.routine-now'), /Next\s+Date Night\s+Tonight/i)
assert.match(await text('.week-line'), /2 of 6 lifts this week/)
await page.tap('.rest-btn')
await page.tap('.task-toggle >> text=Half marathon')
await page.tap('.task-toggle >> text=Maker School')
await page.waitForSelector('.cheer')
await page.waitForTimeout(500)
await shot('08-saturday-done')
assert.match(await text('[aria-label="Lift"]'), /Rest day/i)

// Sunday: the rest day is spent for the week.
await openOn('2026-10-04', '13:00:00')
await page.waitForSelector('.hero')
assert.equal(await page.locator('.rest-btn').count(), 0)
assert.match(await text('.week-line'), /Rested Sat/)
assert.match(await text('.routine-now'), /Next\s+Friends & Family Dinner\s+5:30 PM/i)

// Days 4 to 6 were done; Wednesday ends the week with 60 of the 100 still to do.
await seed({ '2026-10-04': lifted, '2026-10-05': lifted, '2026-10-06': lifted })
await openOn('2026-10-07', '18:00:00')
await page.waitForSelector('.hero')
assert.equal(await text('.hero-number'), '7')
assert.match(await ring(), /0\/3/)
assert.equal(await text('.count-btn'), '40/100')
assert.match(await text('[aria-label="Hyperextensions"] .task-detail'), /due today/)
await page.tap('.step >> text=+25')
await page.tap('.step >> text=+25')
await page.tap('.step >> text=+10')
assert.match(await ring(), /1\/3/)
await page.waitForTimeout(300)
await shot('09-week-end')
await tapTimes('.add-set', 15)
await page.tap('.split >> text=Upper + neck')
await page.tap('.task-toggle >> text=Maker School')
await page.waitForSelector('.cheer')

// Skip Thursday the 8th entirely, then open the app on the 9th.
await openOn('2026-10-09', '08:00:00')
await page.waitForSelector('.missed-view')
await page.waitForTimeout(300)
await shot('10-missed')
assert.match(await text('.missed-title'), /Day 8/i)
assert.match(await text('.missing'), /No lift, no rest day/)
assert.match(await text('.missing'), /No Maker School/)

// It was done, just never ticked: log it late from the sheet.
await page.tap('.missed-view .btn.primary')
await page.waitForSelector('.sheet')
await page.waitForTimeout(400)
await page.tap('.sheet .count-btn')
await page.fill('.sheet .count-input', '30')
await page.locator('.sheet .count-input').press('Enter')
await tapTimes('.sheet .add-set', 15)
await page.tap('.sheet .split >> text=Lower')
await page.tap('.sheet .task-toggle >> text=Maker School')
await page.waitForTimeout(400)
await shot('11-sheet-logged')
assert.match(await text('.sheet-status'), /All done/)
assert.equal(await text('.sheet .count-btn'), '30/100')
await page.tap('.sheet [aria-label="Close"]')
await page.waitForSelector('.hero')
assert.equal(await text('.hero-number'), '9')

// Days 9 to 14 get done but Week 2 ends 40 short of a hundred.
await seed({
  '2026-10-09': lifted,
  '2026-10-10': { ...lifted, sets: 0, split: null, rest: true, halfMarathon: true, hyperextensions: 30 },
  '2026-10-11': lifted,
  '2026-10-12': lifted,
  '2026-10-13': lifted,
  '2026-10-14': lifted,
})
await openOn('2026-10-15', '09:00:00')
await page.waitForSelector('.missed-view')
await page.waitForTimeout(300)
await shot('12-week-short')
assert.match(await text('.missed-title'), /Day 14/i)
assert.match(await text('.missing'), /Week 2 ended at 60 of 100 hyperextensions/)

// Fail = Start Over.
await page.tap('.missed-view .btn.danger')
await page.waitForSelector('.confirm')
await page.waitForTimeout(300)
await shot('13-confirm-start-over')
await page.tap('.confirm .btn.danger')
await page.waitForSelector('.start')
assert.match(await text('.start-lede'), /Attempt 2.*13 days/)
await page.tap('.seg >> text=Earlier')
await page.fill('.stepper-input', '12')
await page.locator('.stepper-input').blur()
assert.match(await text('.start-dates'), /Oct 4/)
await page.tap('.btn.primary.big')
await page.waitForSelector('.hero')
assert.equal(await text('.hero-number'), '12')
await page.tap('.tab >> text=Progress')
await page.waitForTimeout(300)
await shot('14-progress-carried', true)
assert.equal(await page.locator('.board .cell.carried').count(), 11)
assert.equal(await page.locator('.history-item').count(), 2)

// Back up, erase everything, and restore the backup from the start screen.
const [download] = await Promise.all([page.waitForEvent('download'), page.tap('.btn >> text=Back up')])
const backupPath = await download.path()
assert.match(download.suggestedFilename(), /^92-hard-backup-2026-10-15\.json$/)
// Cancel first: nothing goes.
await page.tap('text=Erase everything')
await page.tap('.confirm .btn >> text=Cancel')
await page.waitForSelector('.confirm', { state: 'detached' })
assert.equal(await page.locator('.facts dd').first().innerText(), 'Sun, Oct 4')
await page.tap('text=Erase everything')
await page.tap('.confirm .btn.danger')
await page.waitForSelector('.start')
assert.match(await text('.start-lede'), /went for it/)
await page.setInputFiles('.start-foot input[type=file]', backupPath)
await page.waitForSelector('.hero')
assert.equal(await text('.hero-number'), '12')

// A run that starts tomorrow waits, and can be brought forward.
await page.tap('.tab >> text=Progress')
await page.tap('text=Erase everything')
await page.tap('.confirm .btn.danger')
await page.waitForSelector('.start')
await page.tap('.seg >> text=Tomorrow')
await page.tap('.btn.primary.big')
await page.waitForSelector('.upcoming-view')
assert.match(await text('.upcoming-when'), /Tomorrow/i)
await page.tap('text=Start today instead')
await page.waitForSelector('.hero')
assert.equal(await text('.hero-number'), '1')

// A run saved by the first version of the app opens where it was.
await page.evaluate(() =>
  localStorage.setItem(
    '92hard.state',
    JSON.stringify({
      version: 1,
      attempt: {
        start: '2026-10-01',
        carried: 0,
        logs: { '2026-10-01': { sets: 15, neck: true, halfMarathon: false, hyperextensions: 45, makerSchool: true, vlog: true, note: '' } },
      },
      history: [],
    }),
  ),
)
await openOn('2026-10-01', '20:00:00')
await page.waitForSelector('.hero')
assert.equal(await text('.hero-number'), '1')
assert.equal(await page.locator('.hero.complete').count(), 1)
assert.match(await page.locator('.split button.on').innerText(), /UPPER \+ NECK/)
assert.equal(await text('.count-btn'), '45/100')

// A finished run, seeded straight into storage.
const logs = {}
for (let i = 0; i < 92; i++) {
  const date = new Date(Date.UTC(2026, 9, 1 + i))
  const saturday = date.getUTCDay() === 6
  logs[date.toISOString().slice(0, 10)] = saturday
    ? { ...lifted, sets: 0, split: null, rest: true, halfMarathon: true, hyperextensions: 15 }
    : { ...lifted, split: i % 2 ? 'upper' : 'lower', hyperextensions: 15 }
}
await page.evaluate((state) => localStorage.setItem('92hard.state', JSON.stringify(state)), {
  version: 2,
  attempt: { start: '2026-10-01', carried: 0, logs },
  history: [{ start: '2026-09-01', end: '2026-09-09', completed: 8, outcome: 'restarted' }],
})
await openOn('2026-12-31', '21:00:00')
await page.waitForSelector('.finished-view')
await page.waitForTimeout(400)
await shot('15-finished', true)
assert.match(await text('.finished-title'), /Done/i)

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors')
await browser.close()
server.close()
if (errors.length) process.exit(1)
console.log('smoke: ok')
