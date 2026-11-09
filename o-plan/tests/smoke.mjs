// Drives the built app on an iPhone-sized, touch-enabled screen: the two
// goals folded up, one opened onto its plan of attack, steps ticked, a goal
// marked changed (with a note), complete, back in progress and scrapped,
// undo, Cancel, the edit popout (renaming, the finish line, adding, moving
// and removing steps), adding a goal (and closing a blank one), deleting one,
// and a reload. Then the artifact build with a stand-in for the artifact's
// database: loading the shared copy, writing edits, another device's change,
// a plan written by hand, an empty database and none at all. Fails on any
// page or console error.
// Run after `npm run build && npm run artifact`. SHOTS=<dir> saves screenshots.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { IPHONE, launch, serve, watchErrors } from './harness.mjs'

const shots = process.env.SHOTS
const server = await serve(4193)
const artifact = await serve(4196, fileURLToPath(new URL('../dist-artifact/', import.meta.url)))
const browser = await launch()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const now = new Date()
/** Today as the history writes it: "Oct 15, 2026". */
const today = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`

const text = (page, selector) => page.locator(selector).first().innerText()
const shot = (page, name, fullPage = false) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage })
/** A goal's card, found by its name. */
const card = (page, title) => page.locator('li.goal').filter({ has: page.locator(`.goal-title:text-is("${title}")`) })
const titles = (page, board) => page.locator(`section[aria-labelledby="${board}"] .goal-title`).allInnerTexts()
const steps = (goal) => goal.locator('.waypoint-row[role="checkbox"]')
/** A goal's history, one line per mark: "Changed Oct 15, 2026 “note”". */
const history = async (goal) => (await goal.locator('.log li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
/** Marks a goal from its open card: pick the status, add the note, confirm. */
async function mark(goal, status, note = '') {
  await goal.locator(`.status-opt[data-status="${status}"]`).tap()
  if (note) await goal.locator('.composer textarea').fill(note)
  await goal.locator('.composer button[type="submit"]').tap()
}

// ------------------------------------------------------------ installed app

const context = await browser.newContext(IPHONE)
const page = await context.newPage()
const pageErrors = watchErrors(page)
await page.goto(server.url)
await page.waitForSelector('.goal')
await shot(page, '01-open', true)

// Two goals in play, folded up like questions on an FAQ page.
assert.deepEqual(await titles(page, 'in-play'), ['10% bodyfat', 'Find my dream'])
assert.equal(await text(page, '#in-play'), 'IN PLAY 2')
assert.equal(await text(page, '.board-sum'), '0 of 16 steps done')
assert.deepEqual(await page.locator('.goal .pill').allInnerTexts(), ['In progress', 'In progress'])
assert.deepEqual(await page.locator('.goal-count').allInnerTexts(), ['0 of 8 steps', '0 of 8 steps'])
assert.equal(await page.locator('.goal-panel:visible').count(), 0)
assert.equal(await text(page, '.sync'), 'Saved on this device')
assert.equal(await page.locator('#complete, #scrapped').count(), 0)

// Open one: the plan of attack, step by step, to the finish line.
const bodyfat = card(page, '10% bodyfat')
await bodyfat.locator('.goal-toggle').tap()
assert.equal(await bodyfat.locator('.goal-toggle').getAttribute('aria-expanded'), 'true')
assert.match(await bodyfat.locator('.approach').innerText(), /^Lose the fat slowly enough to keep the muscle/)
assert.equal(await steps(bodyfat).count(), 8)
assert.match(await steps(bodyfat).nth(0).innerText(), /^1\s+Get a starting number\s+A DEXA scan if you can/)
assert.match(await bodyfat.locator('.finish-line').innerText(), /FINISH LINE\s+10% or under on a DEXA scan\./)
assert.equal(await bodyfat.locator('.status-opt[aria-pressed="true"]').innerText(), 'In progress')
assert.deepEqual(await history(bodyfat), ['Started Oct 15, 2026'])
// The other one stays folded.
assert.equal(await card(page, 'Find my dream').locator('.goal-panel').isHidden(), true)
await shot(page, '02-opened', true)

// Tick steps off; the route and the counts follow.
await steps(bodyfat).nth(0).tap()
await steps(bodyfat).nth(1).tap()
assert.equal(await steps(bodyfat).nth(0).getAttribute('aria-checked'), 'true')
assert.equal(await bodyfat.locator('.goal-count').innerText(), '2 of 8 steps')
assert.equal(await text(page, '.board-sum'), '2 of 16 steps done')
await steps(bodyfat).nth(1).tap()
assert.equal(await bodyfat.locator('.goal-count').innerText(), '1 of 8 steps')
assert.equal(await steps(bodyfat).nth(1).getAttribute('aria-checked'), 'false')

// Mark it changed, with what changed. It stays in play.
await bodyfat.locator('.status-opt[data-status="changed"]').tap()
assert.match(await bodyfat.locator('.composer').innerText(), /What changed\?\s+Optional/)
await shot(page, '03-composer')
await bodyfat.locator('.composer textarea').fill('Aiming for 12% first, then 10%.')
await bodyfat.locator('.composer button[type="submit"]').tap()
assert.equal(await bodyfat.locator('.pill').innerText(), 'Changed')
assert.equal(await bodyfat.locator('.composer').count(), 0)
assert.equal(await text(page, '.toast-text'), 'Marked 10% bodyfat changed')
assert.deepEqual(await history(bodyfat), ['Started Oct 15, 2026', `Changed ${today} “Aiming for 12% first, then 10%.”`])
assert.deepEqual(await titles(page, 'in-play'), ['10% bodyfat', 'Find my dream'])

// Undo takes it back.
await page.tap('.toast button')
assert.equal(await bodyfat.locator('.pill').innerText(), 'In progress')
assert.equal(await bodyfat.locator('.log li').count(), 1)

// Cancel changes nothing.
await bodyfat.locator('.status-opt[data-status="scrapped"]').tap()
await bodyfat.locator('.composer .btn.quiet').tap()
assert.equal(await bodyfat.locator('.composer').count(), 0)
assert.equal(await bodyfat.locator('.pill').innerText(), 'In progress')

// Changed, then complete: it moves down to Complete, folded.
await mark(bodyfat, 'changed', 'Aiming for 12% first.')
await mark(bodyfat, 'complete', 'DEXA said 9.8%.')
assert.equal(await text(page, '.toast-text'), 'Marked 10% bodyfat complete')
assert.deepEqual(await titles(page, 'in-play'), ['Find my dream'])
assert.deepEqual(await titles(page, 'complete'), ['10% bodyfat'])
assert.equal(await text(page, '#complete'), 'COMPLETE 1')
assert.equal(await text(page, '.board-sum'), '0 of 8 steps done')
assert.equal(await bodyfat.locator('.goal-panel').isHidden(), true)
assert.equal(await bodyfat.locator('.pill').innerText(), 'Complete')
await bodyfat.locator('.goal-toggle').tap()
assert.deepEqual(await bodyfat.locator('.log .log-what').allInnerTexts(), ['Started', 'Changed', 'Completed'])
await shot(page, '04-complete', true)

// Back in progress from Complete.
await mark(bodyfat, 'active')
assert.equal(await text(page, '.toast-text'), '10% bodyfat is back in progress')
assert.deepEqual(await titles(page, 'in-play'), ['10% bodyfat', 'Find my dream'])
assert.equal(await page.locator('#complete').count(), 0)
await bodyfat.locator('.goal-toggle').tap()
assert.deepEqual(await bodyfat.locator('.log .log-what').allInnerTexts(), ['Started', 'Changed', 'Completed', 'Back in progress'])

// Scrap the dream, then undo it.
const dream = card(page, 'Find my dream')
await dream.locator('.goal-toggle').tap()
await mark(dream, 'scrapped', 'Not now.')
assert.equal(await text(page, '.toast-text'), 'Scrapped Find my dream')
assert.deepEqual(await titles(page, 'scrapped'), ['Find my dream'])
assert.equal(await dream.locator('.pill').innerText(), 'Scrapped')
await shot(page, '05-scrapped', true)
await page.tap('.toast button')
assert.deepEqual(await titles(page, 'in-play'), ['10% bodyfat', 'Find my dream'])
assert.equal(await page.locator('#scrapped').count(), 0)

// -------------------------------------------------------------- editing

assert.equal(await bodyfat.locator('.goal-toggle').getAttribute('aria-expanded'), 'true')
await bodyfat.locator('.edit-btn').tap()
const sheet = page.locator('.sheet')
await sheet.waitFor()
assert.equal(await sheet.locator('.sheet-title').inputValue(), '10% bodyfat')
await sheet.locator('.sheet-title').fill('10% bodyfat by summer')
await sheet.locator('textarea.text-input').first().fill('10% or under on a DEXA scan by June.')
assert.equal(await sheet.locator('.step-text-input').count(), 8)
// A new step, written, then moved up one.
await sheet.locator('.add-line').tap()
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Step 9')
await sheet.locator('.step-text-input').nth(8).fill('Book the DEXA scan')
await sheet.locator('.step-detail-input').nth(8).fill('Same place every time.')
await sheet.locator('button[aria-label="Move step 9 up"]').tap()
assert.equal(await sheet.locator('.step-text-input').nth(7).inputValue(), 'Book the DEXA scan')
assert.equal(await sheet.locator('button[aria-label="Move step 1 up"]').isDisabled(), true)
assert.equal(await sheet.locator('button[aria-label="Move step 9 down"]').isDisabled(), true)
// Removing a step offers Undo.
await sheet.locator('button[aria-label="Remove step 1"]').tap()
assert.equal(await text(page, '.toast-text'), 'Removed step 1')
assert.equal(await sheet.locator('.step-text-input').first().inputValue(), 'Find your maintenance calories')
await page.tap('.toast button')
assert.equal(await sheet.locator('.step-text-input').first().inputValue(), 'Get a starting number')
// A step added and left empty isn't kept.
await sheet.locator('.add-line').tap()
assert.equal(await sheet.locator('.step-text-input').count(), 10)
await shot(page, '06-sheet')
await sheet.locator('.sheet-row .btn.fill').tap()
assert.equal(await page.locator('.sheet').count(), 0)
const renamed = card(page, '10% bodyfat by summer')
assert.equal(await steps(renamed).count(), 9)
assert.match(await steps(renamed).nth(7).innerText(), /^8\s+Book the DEXA scan\s+Same place every time\./)
assert.match(await renamed.locator('.finish-line').innerText(), /10% or under on a DEXA scan by June\./)
assert.equal(await renamed.locator('.goal-count').innerText(), '1 of 9 steps')

// A goal added and closed blank isn't kept.
await page.tap('.add-goal')
await sheet.waitFor()
assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('sheet-title')), true)
await page.keyboard.press('Escape')
assert.equal(await page.locator('.sheet').count(), 0)
assert.equal(await page.locator('li.goal').count(), 2)

// A new goal, with its plan.
await page.tap('.add-goal')
await sheet.locator('.sheet-title').fill('Run a sub-1:40 half')
await sheet.locator('textarea.text-input').nth(0).fill('1:39:59 or faster on a Saturday half.')
await sheet.locator('textarea.text-input').nth(1).fill('Speed once a week, the long run every Saturday.')
await sheet.locator('.add-line').tap()
await sheet.locator('.step-text-input').nth(0).fill('Tempo run every Tuesday')
await sheet.locator('.sheet-row .btn.fill').tap()
assert.deepEqual(await titles(page, 'in-play'), ['10% bodyfat by summer', 'Find my dream', 'Run a sub-1:40 half'])
const half = card(page, 'Run a sub-1:40 half')
assert.equal(await half.locator('.goal-toggle').getAttribute('aria-expanded'), 'true')
assert.equal(await half.locator('.goal-count').innerText(), '0 of 1 step')
assert.deepEqual(await history(half), [`Started ${today}`])
assert.equal(await text(page, '.board-sum'), '1 of 18 steps done')

// Deleting a goal offers Undo.
await half.locator('.edit-btn').tap()
await sheet.locator('.sheet-row .btn.danger').tap()
assert.equal(await text(page, '.toast-text'), 'Deleted Run a sub-1:40 half')
assert.deepEqual(await titles(page, 'in-play'), ['10% bodyfat by summer', 'Find my dream'])
await page.tap('.toast button')
assert.deepEqual(await titles(page, 'in-play'), ['10% bodyfat by summer', 'Find my dream', 'Run a sub-1:40 half'])

// Scrap the half for the reload.
await mark(half, 'scrapped')
assert.deepEqual(await titles(page, 'scrapped'), ['Run a sub-1:40 half'])

// Every goal, tick and mark is still there after a reload.
await page.waitForTimeout(600)
await page.reload()
await page.waitForSelector('.goal')
assert.deepEqual(await titles(page, 'in-play'), ['10% bodyfat by summer', 'Find my dream'])
assert.deepEqual(await titles(page, 'scrapped'), ['Run a sub-1:40 half'])
assert.equal(await text(page, '.board-sum'), '1 of 17 steps done')
await renamed.locator('.goal-toggle').tap()
assert.equal(await steps(renamed).nth(0).getAttribute('aria-checked'), 'true')
assert.deepEqual(await renamed.locator('.log .log-what').allInnerTexts(), ['Started', 'Changed', 'Completed', 'Back in progress'])
assert.match(await renamed.locator('.log').innerText(), /“DEXA said 9\.8%\.”/)

// No sideways scrolling on a phone.
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
await shot(page, '07-reloaded', true)

// ------------------------------------------------------- as an artifact

const saved = {
  version: 1,
  savedAt: '2026-10-15T17:00:00.000Z',
  goals: [
    {
      id: 'bodyfat',
      title: '10% bodyfat',
      finish: '10% or under on a DEXA scan.',
      approach: 'Lose the fat slowly enough to keep the muscle.',
      steps: [
        { id: 'bodyfat-1', text: 'Get a starting number', detail: 'A DEXA scan.', done: true },
        { id: 'bodyfat-2', text: 'Find your maintenance calories', detail: '', done: false },
      ],
      status: 'active',
      log: [{ status: 'active', on: '2026-10-15', note: '' }],
    },
    {
      id: 'dream',
      title: 'Find my dream',
      finish: "One sentence you'd bet the next five years on.",
      approach: '',
      steps: [{ id: 'dream-1', text: 'Keep an energy log for 30 days', detail: '', done: false }],
      status: 'active',
      log: [{ status: 'active', on: '2026-10-15', note: '' }],
    },
  ],
}

/** Stands in for `window.claude` and the artifact's database, before the page's own script runs. */
const fakeHost = ({ doc, db = true, delay = 300 }) => {
  const writes = []
  let body = doc
  let listener = null
  const snap = () => ({ exists: body !== undefined, data: () => body, metadata: { hasPendingWrites: false, fromCache: false } })
  const ref = {
    async set(data) {
      writes.push(JSON.parse(JSON.stringify(data)))
      body = data
      setTimeout(() => listener?.(snap()), 20)
    },
    onSnapshot(next) {
      listener = next
      setTimeout(() => next(snap()), 30)
      return () => (listener = null)
    },
  }
  window.__writes = writes
  window.__remote = (data) => {
    body = data
    listener?.(snap())
  }
  window.claude = {
    use: (name) => new Promise((resolve) => setTimeout(() => resolve(name === 'db' && db ? { doc: () => ref } : null), delay)),
  }
}

async function hosted(options, check) {
  const ctx = await browser.newContext(IPHONE)
  await ctx.addInitScript(fakeHost, options)
  const p = await ctx.newPage()
  const errs = watchErrors(p)
  await p.goto(artifact.url)
  await check(p)
  await ctx.close()
  pageErrors.push(...errs)
}

// The shared copy loads after a moment, and edits are written back to it.
await hosted({ doc: saved }, async (p) => {
  await p.waitForSelector('.app[aria-busy="true"]')
  await shot(p, '08-artifact-loading')
  await p.waitForSelector('.goal-title')
  assert.deepEqual(await titles(p, 'in-play'), ['10% bodyfat', 'Find my dream'])
  assert.equal(await text(p, '.board-sum'), '1 of 3 steps done')
  assert.equal(await text(p, '.sync'), 'Saved')
  const goal = card(p, 'Find my dream')
  await goal.locator('.goal-toggle').tap()
  await steps(goal).nth(0).tap()
  await p.waitForTimeout(700)
  const writes = await p.evaluate(() => window.__writes)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].version, 1)
  assert.equal(typeof writes[0].savedAt, 'string')
  assert.equal(writes[0].goals[1].steps[0].done, true)
  assert.equal(await text(p, '.sync'), 'Saved')
  // Another device's change shows up here.
  await p.evaluate((doc) => window.__remote({ ...doc, goals: [{ ...doc.goals[0], status: 'complete' }, doc.goals[1]] }), saved)
  assert.deepEqual(await titles(p, 'complete'), ['10% bodyfat'])
})

// A plan written by hand, with plain-text steps, opens and saves in full.
await hosted({ doc: { goals: [{ title: 'Learn Spanish', steps: ['Duolingo every day', 'Book a tutor'] }] } }, async (p) => {
  await p.waitForSelector('.goal-title')
  const goal = card(p, 'Learn Spanish')
  assert.equal(await goal.locator('.goal-count').innerText(), '0 of 2 steps')
  await goal.locator('.goal-toggle').tap()
  assert.deepEqual(await goal.locator('.waypoint-text').allInnerTexts(), ['Duolingo every day', 'Book a tutor', 'FINISH LINE'])
  await mark(goal, 'changed', 'Portuguese instead.')
  await p.waitForTimeout(700)
  const [written] = await p.evaluate(() => window.__writes)
  assert.equal(written.goals[0].status, 'changed')
  assert.equal(written.goals[0].steps[1].text, 'Book a tutor')
  assert.equal(typeof written.goals[0].id, 'string')
})

// A database with nothing in it yet opens an empty plan, ready to fill in.
await hosted({ doc: undefined }, async (p) => {
  await p.waitForSelector('.empty')
  assert.match(await text(p, '.empty'), /No goals yet\s+Add a goal, then write the plan of attack/)
  await shot(p, '09-artifact-empty', true)
  await p.tap('.add-goal')
  await p.locator('.sheet-title').fill('Read 20 books')
  await p.locator('.sheet-row .btn.fill').tap()
  await p.waitForTimeout(700)
  const writes = await p.evaluate(() => window.__writes)
  assert.equal(writes.at(-1).goals[0].title, 'Read 20 books')
  assert.deepEqual(await titles(p, 'in-play'), ['Read 20 books'])
})

// Without a database the artifact keeps the plan in the browser.
await hosted({ db: false, delay: 50 }, async (p) => {
  await p.waitForSelector('.app:not([aria-busy])')
  assert.equal(await text(p, '.sync'), 'Saved on this device')
})

await browser.close()
server.close()
artifact.close()

if (pageErrors.length) {
  console.error(pageErrors.join('\n'))
  process.exit(1)
}
console.log('smoke test passed')
