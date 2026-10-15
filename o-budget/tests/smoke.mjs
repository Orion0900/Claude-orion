// Drives the built app on an iPhone-sized, touch-enabled screen: the month
// at a glance, the paycheck plan and its ticks, the card check-in, the
// Investing and Living detail with a category's popout and the
// subscriptions, gross pay and the 401k, the projection, undo, and a reload.
// Then the artifact build with a stand-in for the artifact's database:
// loading the shared copy, one saved by the first version, writing edits,
// another device's change, an empty database and none at all. Fails on any
// page or console error.
// Run after `npm run build && npm run artifact`. SHOTS=<dir> saves screenshots.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { IPHONE, launch, serve, watchErrors } from './harness.mjs'

const shots = process.env.SHOTS
const server = await serve(4193)
const artifact = await serve(4196, fileURLToPath(new URL('../dist-artifact/', import.meta.url)))
const browser = await launch()

const text = (page, selector) => page.locator(selector).first().innerText()
const value = (page, selector) => page.locator(selector).first().inputValue()
/** The month's income, which the paycheck fills in. */
const income = (page) => text(page, '.hero-money .num')
const shot = (page, name, fullPage = false) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage })
/** Types into a field the way a thumb would: tap, type over it, done. */
async function enter(page, selector, typed) {
  await page.tap(selector)
  await page.waitForTimeout(50)
  await page.keyboard.type(typed)
  await page.keyboard.press('Enter')
}

// ------------------------------------------------------------ installed app

const context = await browser.newContext(IPHONE)
const page = await context.newPage()
const pageErrors = watchErrors(page)
await page.goto(server.url)
await page.waitForSelector('.hero-money')
await shot(page, '01-open', true)

// The month: $3,900 twice a month makes $7,800, $3,900 Investing, $3,053 Living, $847 left.
assert.equal(await income(page), '7,800')
assert.equal(await value(page, '#paycheck'), '3,900')
assert.equal(await value(page, '#cadence'), 'semimonthly')
assert.match(await text(page, '.pay-note'), /^24 paychecks a year · \$93,600 take-home/)
assert.match(await text(page, '.bucket.invest'), /INVESTING\s+\$3,900\s+50% of income\s+\$2,900 markets · \$1,000 self/)
assert.match(await text(page, '.bucket.living'), /LIVING\s+\$3,053\s+39\.1% of income\s+\$2,053 fixed · \$1,000 variable/)
assert.match(await text(page, '.left-line'), /\$847 left over, unplanned/)
assert.equal(await page.locator('.split-bar .seg').count(), 3)
assert.equal(await text(page, '.sync'), 'Saved on this device')

// Each paycheck: the rules, then every dollar in order.
assert.deepEqual(await page.locator('.rules li').allInnerTexts(), [
  '$1,450 into VTI the day it lands.',
  'Chase Sapphire for fixed bills and STNDRD, $3,053 a month.',
  "Amazon card for everything variable (food, gas, random), $1,000 a month. It's the only one to watch.",
])
// The paycheck starts the run; the 401k is out before it, noted under the paycheck.
assert.deepEqual(await page.locator('.step-text').allInnerTexts(), ['Deposit into VTI', 'Set aside for Chase Sapphire', 'Set aside for Amazon card'])
assert.deepEqual(await page.locator('.steps .step-amount').allInnerTexts(), ['$3,900', '$1,450', '$1,527', '$500', '$423'])
assert.match(await text(page, '.step >> nth=1'), /plus STNDRD/)
assert.match(await text(page, '.pay-note'), /After \$405 into the 401k, taken out before each paycheck/)
assert.match(await text(page, '.step-edge.end'), /Left in checking\s+\$423/)

// A raise lands in checking.
await enter(page, '#paycheck', '4100')
assert.equal(await income(page), '8,200')
assert.match(await text(page, '.left-line'), /\$1,247 left over/)
assert.match(await text(page, '.step-edge.lands'), /Paycheck lands\s+\$4,100/)
assert.match(await text(page, '.step-edge.end'), /Left in checking\s+\$623/)
await enter(page, '#paycheck', '3900')

// Every two weeks: 26 paychecks a year, averaged over the months.
await page.selectOption('#cadence', 'biweekly')
assert.equal(await income(page), '8,450')
assert.match(await text(page, '.pay-note'), /^26 paychecks a year · \$101,400 take-home/)
assert.match(await text(page, '.step >> nth=0'), /Deposit into VTI\s+\$1,338/)
await page.selectOption('#cadence', 'monthly')
assert.equal(await income(page), '3,900')
assert.match(await text(page, '.left-line.short'), /\$3,053 more planned than comes in/)
await page.selectOption('#cadence', 'semimonthly')
assert.equal(await income(page), '7,800')

// Payday checklist: VTI, fixed bills, the variable budget, for this pay period.
assert.deepEqual(await page.locator('.check-text').allInnerTexts(), ['$1,450 VTI', 'Fixed expenses as expected', 'Under variable budget'])
assert.match(await text(page, '.checklist-head'), /(1–14|15–\d\d), 20\d\d · 0 of 3/)
assert.match(await text(page, '#check-fixed .check-hint'), /Chase Sapphire: \$3,053 a month expected, with STNDRD/)
assert.match(await text(page, '#check-variable .check-hint'), /Amazon card: \$\d[\d,]* of \$1,000 so far/)
await page.tap('#check-invest')
await page.tap('#check-variable')
assert.equal(await page.locator('.check[aria-checked="true"]').count(), 2)
assert.match(await text(page, '.checklist-head'), /2 of 3/)
await page.tap('#check-fixed')
assert.match(await text(page, '.checklist-head'), /All done/)
await shot(page, '02-all-done')
await page.tap('#check-fixed')
assert.equal(await page.locator('.history').count(), 0)

// The card check-in: what's on the Amazon card against $1,000.
await page.locator('.card-check').scrollIntoViewIfNeeded()
assert.match(await text(page, '#card-title'), /Amazon card check-in/i)
assert.equal(await text(page, '.check-left'), '$1,000')
assert.match(await text(page, '.check-parts'), /Food \$600 · Gas \$150 · Random \$250/)
await enter(page, '#spent', '400')
assert.equal(await text(page, '.check-left'), '$600')
assert.match(await text(page, '.check-line'), /a day/)
await enter(page, '#spent', '1200')
assert.equal(await text(page, '.check-left.over'), '$200')
assert.match(await text(page, '.check-line.warn'), /\$200 over the \$1,000 budget/)
await shot(page, '03-card-over')
await enter(page, '#spent', '400')

// The cards can be renamed, and the plan follows.
await page.locator('#card-variable').fill('Prime Visa')
assert.match(await text(page, '#card-title'), /Prime Visa check-in/i)
assert.match(await text(page, '.step >> nth=2'), /Set aside for Prime Visa/)
await page.locator('#card-variable').fill('Amazon card')

// Investing and Living in detail.
await page.tap('.bucket.invest')
assert.equal(await text(page, '.group-investing .spent-total'), '$3,900')
assert.deepEqual(await page.locator('.group-investing .part-total').allInnerTexts(), ['$2,900', '$1,000'])
assert.equal(await text(page, '.group-living .spent-total'), '$3,053')
assert.deepEqual(await page.locator('.group-living .part-total').allInnerTexts(), ['$2,053', '$1,000'])
assert.equal(await page.locator('.part-fixed .cat').count(), 5)
assert.equal(await page.locator('.part-variable .cat').count(), 3)
// Living lists the biggest first.
assert.deepEqual(await page.locator('.part-variable .cat-name-text').allInnerTexts(), ['Food', 'Random', 'Gas'])
assert.match(await text(page, '.part-fixed .cat >> nth=2'), /Subscriptions\s+10 items\s+\$223/)

// The subscriptions popout.
await page.tap('.cat >> text="Subscriptions"')
await page.waitForSelector('.sheet')
assert.equal(await value(page, '#category-name'), 'Subscriptions')
assert.equal(await text(page, '.sheet-total'), '$223')
assert.equal(await page.locator('.item').count(), 10)
assert.match(await text(page, '.sheet .facts'), /A paycheck\s+\$112\s+A year\s+\$2,676\s+Of Living\s+7\.3%/)
assert.equal(await value(page, '#category-bucket'), 'fixed')
await shot(page, '04-subscriptions')
const spotify = page.locator('.item', { has: page.locator('input[value="Spotify"]') })
await spotify.locator('.item-money input').tap()
await page.waitForTimeout(50)
await page.keyboard.type('17')
await page.keyboard.press('Enter')
assert.equal(await text(page, '.sheet-total'), '$225')
await page.locator('.item', { has: page.locator('input[value="HBO"]') }).locator('[aria-label="Remove HBO"]').tap()
assert.equal(await page.locator('.item').count(), 9)
assert.equal(await text(page, '.toast-text'), 'Removed HBO')
await page.tap('.toast button')
assert.equal(await page.locator('.item').count(), 10)
await page.tap('.sheet .btn >> text=Add item')
assert.equal(await page.evaluate(() => document.activeElement?.className), 'item-name', 'a new item is ready to name')
await page.keyboard.type('YouTube')
await page.locator('.item-money input').last().fill('14')
assert.equal(await text(page, '.sheet-total'), '$239')
await page.locator('#category-note').fill('Spotify renews on the 3rd')
await page.keyboard.press('Escape')
await page.waitForSelector('.sheet', { state: 'detached' })
assert.equal(await text(page, '.part-fixed .part-total'), '$2,069')
assert.match(await text(page, '.step >> nth=1'), /Set aside for Chase Sapphire\s+\$1,535/)

// Break a plain category down without its total jumping.
await page.tap('.cat >> text="Car"')
await page.tap('.sheet .btn >> text=Add details')
assert.equal(await value(page, '.item-money input'), '250')
await page.keyboard.type('Insurance')
await page.locator('.item-money input').fill('150')
await page.tap('.sheet .btn >> text=Add item')
await page.keyboard.type('Upkeep')
await page.locator('.item-money input').last().fill('100')
assert.equal(await text(page, '.sheet-total'), '$250')
await page.keyboard.press('Escape')

// A new variable category goes on the Amazon card budget; one left blank isn't kept.
await page.tap('.part-variable .add-line')
await page.waitForSelector('.sheet')
assert.equal(await page.evaluate(() => document.activeElement?.id), 'category-name')
await page.keyboard.type('Gifts')
await enter(page, '#category-amount', '50')
await page.keyboard.press('Escape')
assert.match(await text(page, '.part-variable .cat >> nth=3'), /Gifts\s+\$50/)
assert.equal(await text(page, '.part-variable .part-total'), '$1,050')
assert.match(await text(page, '.check-parts'), /Gifts \$50/)
await page.tap('.part-variable .add-line')
await page.waitForSelector('.sheet')
await page.keyboard.press('Escape')
assert.equal(await page.locator('.part-variable .cat').count(), 4)

// A category can move, say to self investment, and back.
await page.tap('.cat >> text="Gifts"')
await page.selectOption('#category-bucket', 'self')
await page.keyboard.press('Escape')
assert.equal(await page.locator('.part-self .cat').count(), 2)
assert.equal(await text(page, '.group-investing .spent-total'), '$3,950')
await page.tap('.cat >> text="Gifts"')
await page.selectOption('#category-bucket', 'variable')
await page.keyboard.press('Escape')
assert.equal(await page.locator('.part-variable .cat').count(), 4)

// Delete a category, then think better of it.
await page.tap('.cat >> text="Haircut"')
await page.tap('.sheet .btn >> text=Delete category')
assert.equal(await page.locator('.part-fixed .cat').count(), 4)
assert.equal(await text(page, '.toast-text'), 'Deleted Haircut')
await shot(page, '05-undo')
await page.tap('.toast button')
assert.equal(await page.locator('.part-fixed .cat').count(), 5)
assert.equal(await text(page, '.group-living .spent-total'), '$3,119')

// The investment projection: VTI's $2,900 and the 401k's $810 a month at 7% for 30 years, then $13,780 up front and 20 years.
await page.locator('.projection').scrollIntoViewIfNeeded()
assert.equal(await value(page, '#proj-monthly'), '2,900')
assert.equal(await value(page, '#proj-401k'), '810')
assert.match(await text(page, '.proj-facts'), /In 30 years\s+\$4\.\d+M\s+Put in\s+\$1\.3M/)
await enter(page, '#proj-start', '13780')
// Years can be typed as well as slid.
await enter(page, '#proj-years-typed', '25')
assert.equal(await value(page, '#proj-years'), '25')
assert.match(await text(page, '.proj-facts'), /In 25 years/)
await enter(page, '#proj-years-typed', '99')
assert.equal(await value(page, '#proj-years-typed'), '60')
await page.locator('#proj-years').fill('20')
assert.equal(await value(page, '#proj-years-typed'), '20')
assert.match(await text(page, '.proj-facts'), /In 20 years/)
const box = await page.locator('.chart svg').boundingBox()
await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2)
assert.match(await text(page, '.tip'), /Year 20\s+\$[\d,]+ total\s+\$904,180 put in/)
await shot(page, '06-projection')

// Gross pay, bonus and the 401k, which comes out before the paycheck.
await page.locator('.gross').scrollIntoViewIfNeeded()
assert.match(await text(page, '.gross'), /Add your gross income and bonus/)
assert.equal(await value(page, '#k401'), '405')
assert.match(await text(page, '.k401-tile'), /\$810 a month · \$9,720 a year/)
await enter(page, '#gross', '120000')
await enter(page, '#bonus', '15000')
assert.equal(await value(page, '#bonus-pct'), '12.5')
assert.match(await text(page, '.gross-facts'), /Total a year\s+\$135,000\s+Gross a month\s+\$10,000\s+Take-home\s+78%/)
await enter(page, '#bonus-pct', '10')
assert.equal(await value(page, '#bonus'), '12,000')
assert.equal(await income(page), '7,800')
await enter(page, '#k401', '500')
assert.match(await text(page, '.pay-note'), /After \$500 into the 401k/)
assert.equal(await page.locator('.step-text').count(), 3)
assert.match(await text(page, '.link-btn'), /Use the paycheck's 401k, \$1,000 a month/)
await enter(page, '#k401', '405')
assert.match(await text(page, '.step-edge.end'), /Left in checking\s+\$390/)
await shot(page, '07-gross')

// Everything is still there after a reload.
await page.waitForTimeout(600)
await page.reload()
await page.waitForSelector('.hero-money')
assert.equal(await income(page), '7,800')
assert.equal(await value(page, '#gross'), '120,000')
assert.equal(await value(page, '#bonus'), '12,000')
assert.equal(await value(page, '#spent'), '400')
assert.equal(await value(page, '#proj-start'), '13,780')
assert.equal(await value(page, '#proj-years'), '20')
assert.equal(await text(page, '.group-living .spent-total'), '$3,119')
await page.tap('.cat >> text="Subscriptions"')
assert.equal(await page.locator('#category-note').inputValue(), 'Spotify renews on the 3rd')
await page.keyboard.press('Escape')
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('o-budget.state')))
assert.equal(saved.version, 5)
assert.equal(saved.k401, 405)
assert.deepEqual(saved.cards, { fixed: 'Chase Sapphire', variable: 'Amazon card' })
assert.equal(saved.spent.amount, 400)
assert.equal(saved.paycheck, 3900)
assert.equal('steps' in saved, false)

// Earlier pay periods are kept as history; this one starts fresh each 1st and 15th.
await page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('o-budget.state'))
  saved.checks['2026-09-15'] = { done: ['invest', 'fixed'], invest: 1500 }
  saved.checks['2026-09-1'] = { done: ['invest', 'fixed', 'variable'], invest: 1450 }
  localStorage.setItem('o-budget.state', JSON.stringify(saved))
})
await page.reload()
await page.waitForSelector('.hero-money')
assert.equal(await page.locator('.check[aria-checked="true"]').count(), 2)
await page.tap('.history summary')
assert.match(await text(page, '.history summary'), /History · 2 pay periods/)
assert.deepEqual(await page.locator('.history-period').allInnerTexts(), ['Sep 15–30, 2026', 'Sep 1–14, 2026'])
assert.equal(await page.locator('.history-list li >> nth=0').locator('.mark.miss').count(), 1)
assert.match(await text(page, '.history-list li >> nth=0'), /\$1,500 VTI/)
await shot(page, '07c-history')

// No sideways scrolling on a phone.
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)

// ------------------------------------------------------- as an artifact

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
  await p.waitForSelector('.hero-money')
  assert.equal(await income(p), '7,800')
  assert.equal(await text(p, '.group-living .spent-total'), '$3,119')
  assert.equal(await text(p, '.sync'), 'Saved')
  await enter(p, '#paycheck', '4000')
  await p.waitForTimeout(700)
  const writes = await p.evaluate(() => window.__writes)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].paycheck, 4000)
  assert.equal(writes[0].version, 5)
  assert.equal(typeof writes[0].savedAt, 'string')
  assert.equal(await text(p, '.sync'), 'Saved')
  // Another device's change shows up here.
  await p.evaluate((doc) => window.__remote({ ...doc, paycheck: 4550 }), saved)
  assert.equal(await income(p), '9,100')
})

// A shared copy saved by the first version opens on the card system, keeping its income.
await hosted(
  {
    doc: { version: 1, income: 7800, paychecks: 2, investing: 4000, steps: [], categories: [{ id: 'food', name: 'Food', amount: 800, note: '', items: [] }] },
  },
  async (p) => {
    await p.waitForSelector('.hero-money')
    assert.equal(await income(p), '7,800')
    assert.equal(await value(p, '#paycheck'), '3,900')
    assert.equal(await text(p, '.group-investing .spent-total'), '$2,900')
    assert.equal(await text(p, '.group-living .spent-total'), '$1,000')
    await enter(p, '#gross', '120000')
    await p.waitForTimeout(700)
    const [written] = await p.evaluate(() => window.__writes)
    assert.equal(written.version, 5)
    assert.equal(written.paycheck, 3900)
    assert.equal(written.gross, 120000)
    assert.equal('income' in written, false)
  },
)

// A database with nothing in it yet opens an empty budget, ready to fill in.
await hosted({ doc: undefined }, async (p) => {
  await p.waitForSelector('.hero-money')
  assert.equal(await income(p), '0')
  assert.match(await text(p, '.overview'), /Enter your net paycheck and how often it comes to start/)
  assert.match(await text(p, '.group-living'), /Add rent/)
  assert.equal(await p.locator('.step').count(), 0)
  await shot(p, '09-artifact-empty', true)
  await enter(p, '#paycheck', '2500')
  await p.waitForTimeout(700)
  assert.equal((await p.evaluate(() => window.__writes))[0].paycheck, 2500)
  assert.equal(await income(p), '5,000')
})

// Without a database the artifact keeps the budget in the browser.
await hosted({ db: false, delay: 50 }, async (p) => {
  await p.waitForSelector('.hero-money')
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
