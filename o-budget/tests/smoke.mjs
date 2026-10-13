// Drives the built app on an iPhone-sized, touch-enabled screen: the net
// paycheck and its cadence, gross pay and bonus, the split, the paycheck
// steps, a category's details and the subscriptions, undo, and a reload. Then the artifact build with a stand-in for the artifact's
// database: loading the shared copy, one saved by the first version, writing
// edits, another device's change, an empty database and none at all. Fails on any page or console error.
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

// The budget as written down: $3,900 twice a month makes $7,800.
assert.equal(await income(page), '7,800')
assert.equal(await value(page, '#paycheck'), '3,900')
assert.equal(await value(page, '#cadence'), 'semimonthly')
assert.equal(await text(page, '.pay-note'), '24 paychecks a year · $93,600 take-home')
assert.equal(await value(page, '#investing'), '4,000')
assert.equal(await value(page, '#living'), '3,800')
assert.equal(await value(page, '#investing-pct'), '51.3')
assert.equal(await value(page, '#living-pct'), '48.7')
assert.match(await text(page, '.bucket.invest'), /\$2,000 a paycheck/)
assert.match(await text(page, '.bucket.living'), /\$1,900 a paycheck/)
assert.equal(await text(page, '.spent-total'), '$3,853')
assert.equal(await text(page, '.expenses .pill'), '$53 over')
assert.equal(await page.locator('.cat').count(), 7)
assert.match(await text(page, '.cat >> nth=3'), /Subscriptions\s+10 items\s+\$223/)
assert.equal(await page.locator('.step').count(), 3)
assert.deepEqual(await page.locator('.step-check').allInnerTexts(), ['0', '1', '2'])
// The 401k comes out before the paycheck lands, so it doesn't come out of it.
assert.deepEqual(await page.locator('.step-left').allInnerTexts(), ['out before the paycheck lands', 'then $2,400 left', 'then $500 left'])
assert.match(await text(page, '.step-edge.end'), /Left over\s+\$500/)
assert.equal(await text(page, '.sync'), 'Saved on this device')
assert.match(await text(page, '.gross'), /Add your gross income and bonus/)

// A raise goes to Living, and the expenses fit.
await enter(page, '#paycheck', '4100')
assert.equal(await income(page), '8,200')
assert.equal(await value(page, '#living'), '4,200')
assert.equal(await text(page, '.expenses .pill'), '$347 to spare')
assert.match(await text(page, '.step-edge'), /Paycheck lands\s+\$4,100/)
await enter(page, '#paycheck', '3900')

// Every two weeks: 26 paychecks a year, averaged over the months.
await page.selectOption('#cadence', 'biweekly')
assert.equal(await income(page), '8,450')
assert.equal(await text(page, '.pay-note'), '26 paychecks a year · $101,400 take-home')
assert.match(await text(page, '.pay-note.muted'), /Most months bring 2 paychecks \(\$7,800\); two bring 3/)
assert.match(await text(page, '.bucket.invest'), /\$1,846 a paycheck/)
assert.match(await text(page, '.step-edge'), /Paycheck lands\s+\$3,900/)
await shot(page, '02-biweekly')
await page.selectOption('#cadence', 'monthly')
assert.equal(await income(page), '3,900')
assert.equal(await text(page, '.income .note-line.warn'), 'Investing is more than income.')
assert.equal(await page.locator('.pay-note.muted').count(), 0)
await page.selectOption('#cadence', 'semimonthly')
assert.equal(await income(page), '7,800')

// Gross pay and bonus, beside the take-home and out of the month's income.
await enter(page, '#gross', '120000')
await enter(page, '#bonus', '15000')
assert.equal(await value(page, '#bonus-pct'), '12.5')
assert.match(await text(page, '.gross-facts'), /Total a year\s+\$135,000\s+Gross a month\s+\$10,000\s+Take-home\s+78%/)
await enter(page, '#bonus-pct', '10')
assert.equal(await value(page, '#bonus'), '12,000')
assert.equal(await income(page), '7,800')
await shot(page, '03-gross')

// Split by percent, by the slider, and by the Living amount.
await enter(page, '#investing-pct', '50')
assert.equal(await value(page, '#investing'), '3,900')
assert.equal(await value(page, '#living-pct'), '50')
await page.locator('#split').evaluate((el) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '4500')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
assert.equal(await value(page, '#investing'), '4,500')
assert.equal(await value(page, '#living'), '3,300')
await enter(page, '#living', '3800')
assert.equal(await value(page, '#investing'), '4,000')
assert.equal(await value(page, '#investing-pct'), '51.3')

// Payday: tick the steps off, then clear them for next time.
await page.tap('.step-check >> nth=0')
await page.tap('.step-check >> nth=1')
assert.equal(await text(page, '.progress'), '2 of 3 done')
assert.equal(await page.locator('.step-check[aria-checked="true"]').count(), 2)
await page.tap('.step-check >> nth=2')
assert.equal(await text(page, '.progress'), 'All done')
await shot(page, '04-all-done')
await page.tap('.btn >> text=Start next paycheck')
assert.equal(await page.locator('.step-check[aria-checked="true"]').count(), 0)
assert.equal(await page.locator('.progress').count(), 0)

// The 401k's switch says it comes out before the paycheck; off, the paycheck pays for it.
await page.tap('.step-main >> nth=0')
await page.waitForSelector('.sheet')
assert.equal(await page.locator('#step-before-pay').isChecked(), true)
assert.equal(await text(page, '.field-hint'), 'Not taken from the $3,900 paycheck.')
assert.equal(await page.locator('.sheet .btn >> text=Later').isDisabled(), true)
await page.locator('#step-before-pay').uncheck()
assert.match(await text(page, '.step-edge.end'), /Left over\s+\$95/)
assert.match(await text(page, '.field-hint'), /\$3,495 of the paycheck left/)
await page.locator('#step-before-pay').check()
assert.match(await text(page, '.step-edge.end'), /Left over\s+\$500/)
await page.keyboard.press('Escape')
await page.waitForSelector('.sheet', { state: 'detached' })

// Edit a step: more into VTI leaves the paycheck short, and it can move.
await page.tap('.step-main >> nth=1')
await page.waitForSelector('.sheet')
assert.equal(await page.evaluate(() => document.activeElement?.id), '', 'opening a step keeps the keyboard down')
assert.equal(await page.locator('.sheet .btn >> text=Earlier').isDisabled(), true, 'the paycheck steps stay after the 401k')
await enter(page, '#step-amount', '2100')
assert.match(await text(page, '.field-hint'), /\$1,800 of the paycheck left/)
await page.tap('.sheet .btn >> text=Later')
assert.match(await text(page, '.sheet .eyebrow'), /Step 2/i)
await shot(page, '05-step-sheet')
await page.tap('.sheet [aria-label="Close"]')
await page.waitForSelector('.sheet', { state: 'detached' })
assert.deepEqual(await page.locator('.step-text').allInnerTexts(), ['Goes into 401k', 'Remains for 2 wks', 'Invest in VTI'])
assert.match(await text(page, '.step-edge.end'), /Short\s+\$100/)
await page.tap('.step-main >> nth=2')
await page.tap('.sheet .btn >> text=Earlier')
await enter(page, '#step-amount', '1500')
await page.keyboard.press('Escape')
assert.deepEqual(await page.locator('.step-text').allInnerTexts(), ['Goes into 401k', 'Invest in VTI', 'Remains for 2 wks'])

// A new step for the $500 left over; a blank one isn't kept.
await page.tap('.btn >> text=Add step')
await page.waitForSelector('.sheet')
assert.equal(await page.evaluate(() => document.activeElement?.id), 'step-text', 'a new step is ready to type into')
await page.keyboard.type('Top up savings')
await enter(page, '#step-amount', '500')
await page.keyboard.press('Escape')
assert.equal(await page.locator('.step').count(), 4)
assert.match(await text(page, '.step-edge.end'), /Left over\s+\$0/)
await page.tap('.btn >> text=Add step')
await page.waitForSelector('.sheet')
await page.tap('.sheet [aria-label="Close"]')
assert.equal(await page.locator('.step').count(), 4)

// The subscriptions popout.
await page.tap('.cat >> text="Subscriptions"')
await page.waitForSelector('.sheet')
assert.equal(await value(page, '#category-name'), 'Subscriptions')
assert.equal(await text(page, '.sheet-total'), '$223')
assert.equal(await page.locator('.item').count(), 10)
assert.match(await text(page, '.sheet .facts'), /A paycheck\s+\$111\.50\s+A year\s+\$2,676\s+Of Living\s+5\.9%/)
await shot(page, '06-subscriptions')
const spotify = page.locator('.item', { has: page.locator('input[value="Spotify"]') })
await spotify.locator('.item-money input').tap()
await page.waitForTimeout(50)
await page.keyboard.type('17')
await page.keyboard.press('Enter')
assert.equal(await text(page, '.sheet-total'), '$225')
await page.locator('.item', { has: page.locator('input[value="HBO"]') }).locator('[aria-label="Remove HBO"]').tap()
assert.equal(await page.locator('.item').count(), 9)
assert.equal(await text(page, '.sheet-total'), '$205')
assert.equal(await text(page, '.toast-text'), 'Removed HBO')
await page.tap('.toast button')
assert.equal(await page.locator('.item').count(), 10)
assert.equal(await text(page, '.sheet-total'), '$225')
await page.tap('.sheet .btn >> text=Add item')
assert.equal(await page.evaluate(() => document.activeElement?.className), 'item-name', 'a new item is ready to name')
await page.keyboard.type('YouTube')
await page.locator('.item-money input').last().fill('14')
assert.equal(await text(page, '.sheet-total'), '$239')
await page.locator('#category-note').fill('Spotify renews on the 3rd')
await page.keyboard.press('Escape')
await page.waitForSelector('.sheet', { state: 'detached' })
assert.match(await text(page, '.cat >> nth=3'), /Subscriptions\s+11 items\s+\$239/)
assert.equal(await text(page, '.spent-total'), '$3,869')

// Break a plain category down without its total jumping.
await page.tap('.cat >> text="Car"')
await page.tap('.sheet .btn >> text=Add details')
assert.equal(await value(page, '.item-money input'), '250')
await page.keyboard.type('Insurance')
await page.locator('.item-money input').fill('150')
await page.tap('.sheet .btn >> text=Add item')
await page.keyboard.type('Gas')
await page.locator('.item-money input').last().fill('100')
assert.equal(await text(page, '.sheet-total'), '$250')
await page.keyboard.press('Escape')

// A new category, renamed and priced; one left blank isn't kept.
await page.tap('.btn >> text=Add category')
await page.waitForSelector('.sheet')
assert.equal(await page.evaluate(() => document.activeElement?.id), 'category-name')
await page.keyboard.type('Gifts')
await enter(page, '#category-amount', '50')
await page.keyboard.press('Escape')
assert.match(await text(page, '.cat >> nth=7'), /Gifts\s+\$50/)
await page.tap('.btn >> text=Add category')
await page.waitForSelector('.sheet')
await page.keyboard.press('Escape')
assert.equal(await page.locator('.cat').count(), 8)

// Delete a category, then think better of it.
await page.tap('.cat >> text="Haircut"')
await page.tap('.sheet .btn >> text=Delete category')
assert.equal(await page.locator('.cat').count(), 7)
assert.equal(await text(page, '.toast-text'), 'Deleted Haircut')
await shot(page, '07-undo')
await page.tap('.toast button')
assert.equal(await page.locator('.cat').count(), 8)
assert.equal(await text(page, '.spent-total'), '$3,919')

// The investment projection: Investing's $4,000 a month at 7% for 30 years, then $13,780 up front and 20 years.
await page.locator('.projection').scrollIntoViewIfNeeded()
assert.equal(await value(page, '#proj-monthly'), '4,000')
assert.equal(await value(page, '#proj-401k'), '810')
assert.match(await text(page, '.proj-facts'), /In 30 years\s+\$5\.\d+M\s+Put in\s+\$1\.7M/)
await enter(page, '#proj-start', '13780')
await page.locator('#proj-years').fill('20')
assert.match(await text(page, '.proj-facts'), /In 20 years/)
const box = await page.locator('.chart svg').boundingBox()
await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2)
assert.match(await text(page, '.tip'), /Year 20\s+\$[\d,]+ total\s+\$1,168,180 put in/)
await shot(page, '07b-projection')

// Everything is still there after a reload.
await page.waitForTimeout(600)
await page.reload()
await page.waitForSelector('.hero-money')
assert.equal(await income(page), '7,800')
assert.equal(await value(page, '#gross'), '120,000')
assert.equal(await value(page, '#bonus'), '12,000')
assert.equal(await value(page, '#proj-start'), '13,780')
assert.equal(await value(page, '#proj-years'), '20')
assert.equal(await page.locator('.step').count(), 4)
assert.equal(await page.locator('.cat').count(), 8)
assert.equal(await text(page, '.spent-total'), '$3,919')
await page.tap('.cat >> text="Subscriptions"')
assert.equal(await page.locator('#category-note').inputValue(), 'Spotify renews on the 3rd')
await page.keyboard.press('Escape')
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('o-budget.state')))
assert.equal(saved.version, 3)
assert.equal(saved.steps[0].beforePay, true)
assert.equal(saved.paycheck, 3900)
assert.equal(saved.cadence, 'semimonthly')
assert.equal('income' in saved, false)

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
  assert.equal(await text(p, '.spent-total'), '$3,919')
  assert.equal(await text(p, '.sync'), 'Saved')
  await enter(p, '#paycheck', '4000')
  await p.waitForTimeout(700)
  const writes = await p.evaluate(() => window.__writes)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].paycheck, 4000)
  assert.equal(writes[0].version, 3)
  assert.equal(typeof writes[0].savedAt, 'string')
  assert.equal(await text(p, '.sync'), 'Saved')
  // Another device's change shows up here.
  await p.evaluate((doc) => window.__remote({ ...doc, paycheck: 4550 }), saved)
  assert.equal(await income(p), '9,100')
})

// A shared copy saved by the first version, which kept a monthly income, opens unchanged.
await hosted(
  {
    doc: { version: 1, income: 7800, paychecks: 2, investing: 4000, steps: [], categories: [{ id: 'food', name: 'Food', amount: 800, note: '', items: [] }] },
  },
  async (p) => {
    await p.waitForSelector('.hero-money')
    assert.equal(await income(p), '7,800')
    assert.equal(await value(p, '#paycheck'), '3,900')
    assert.equal(await value(p, '#cadence'), 'semimonthly')
    assert.equal(await value(p, '#living'), '3,800')
    await enter(p, '#gross', '120000')
    await p.waitForTimeout(700)
    const [written] = await p.evaluate(() => window.__writes)
    assert.equal(written.version, 3)
    assert.equal(written.paycheck, 3900)
    assert.equal(written.gross, 120000)
    assert.equal('income' in written, false)
  },
)

// A database with nothing in it yet opens an empty budget, ready to fill in.
await hosted({ doc: undefined }, async (p) => {
  await p.waitForSelector('.hero-money')
  assert.equal(await income(p), '0')
  assert.match(await text(p, '.income'), /Enter your net paycheck and how often it comes to start/)
  assert.match(await text(p, '.expenses'), /No expenses yet/)
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
