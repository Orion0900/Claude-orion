// Drives the built app on an iPhone-sized, touch-enabled screen: the split,
// the paycheck steps, a category's details and the subscriptions, undo, and
// a reload. Then the artifact build with a stand-in for the artifact's
// database: loading the shared copy, writing edits, another device's change,
// an empty database and none at all. Fails on any page or console error.
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

// The budget as written down.
assert.equal(await value(page, '#income'), '7,800')
assert.equal(await value(page, '#investing'), '4,000')
assert.equal(await value(page, '#living'), '3,800')
assert.equal(await value(page, '#investing-pct'), '51.3')
assert.equal(await value(page, '#living-pct'), '48.7')
assert.equal(await text(page, '.paychecks .each'), '$3,900 each')
assert.match(await text(page, '.bucket.invest'), /\$2,000 a paycheck/)
assert.match(await text(page, '.bucket.living'), /\$1,900 a paycheck/)
assert.equal(await text(page, '.spent-total'), '$3,853')
assert.equal(await text(page, '.expenses .pill'), '$53 over')
assert.equal(await page.locator('.cat').count(), 7)
assert.match(await text(page, '.cat >> nth=3'), /Subscriptions\s+10 items\s+\$223/)
assert.equal(await page.locator('.step').count(), 3)
assert.deepEqual(await page.locator('.step-check').allInnerTexts(), ['0', '1', '2'])
assert.deepEqual(await page.locator('.step-left').allInnerTexts(), ['then $3,495 left', 'then $1,995 left', 'then $95 left'])
assert.match(await text(page, '.step-edge.end'), /Left over\s+\$95/)
assert.equal(await text(page, '.sync'), 'Saved on this device')

// A raise goes to Living, and the expenses fit.
await enter(page, '#income', '8200')
assert.equal(await value(page, '#income'), '8,200')
assert.equal(await value(page, '#living'), '4,200')
assert.equal(await text(page, '.expenses .pill'), '$347 to spare')
assert.equal(await text(page, '.paychecks .each'), '$4,100 each')
await enter(page, '#income', '7800')

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

// Three paychecks a month, then back to two.
await page.tap('.stepper [aria-label="One more"]')
assert.equal(await text(page, '.paychecks .each'), '$2,600 each')
await page.tap('.stepper [aria-label="One fewer"]')
assert.equal(await text(page, '.paychecks .each'), '$3,900 each')

// Payday: tick the steps off, then clear them for next time.
await page.tap('.step-check >> nth=0')
await page.tap('.step-check >> nth=1')
assert.equal(await text(page, '.progress'), '2 of 3 done')
assert.equal(await page.locator('.step-check[aria-checked="true"]').count(), 2)
await page.tap('.step-check >> nth=2')
assert.equal(await text(page, '.progress'), 'All done')
await shot(page, '02-all-done')
await page.tap('.btn >> text=Start next paycheck')
assert.equal(await page.locator('.step-check[aria-checked="true"]').count(), 0)
assert.equal(await page.locator('.progress').count(), 0)

// Edit a step: more into VTI leaves the paycheck short, and it can move.
await page.tap('.step-main >> nth=1')
await page.waitForSelector('.sheet')
assert.equal(await page.evaluate(() => document.activeElement?.id), '', 'opening a step keeps the keyboard down')
await enter(page, '#step-amount', '1600')
assert.match(await text(page, '.field-hint'), /\$1,895 of the paycheck left/)
await page.tap('.sheet .btn >> text=Later')
assert.match(await text(page, '.sheet .eyebrow'), /Step 2/i)
await shot(page, '03-step-sheet')
await page.tap('.sheet [aria-label="Close"]')
await page.waitForSelector('.sheet', { state: 'detached' })
assert.deepEqual(await page.locator('.step-text').allInnerTexts(), ['Goes into 401k', 'Remains for 2 wks', 'Invest in VTI'])
assert.match(await text(page, '.step-edge.end'), /Short\s+\$5/)
await page.tap('.step-main >> nth=2')
await page.tap('.sheet .btn >> text=Earlier')
await enter(page, '#step-amount', '1500')
await page.keyboard.press('Escape')
assert.deepEqual(await page.locator('.step-text').allInnerTexts(), ['Goes into 401k', 'Invest in VTI', 'Remains for 2 wks'])

// A new step for the $95 left over; a blank one isn't kept.
await page.tap('.btn >> text=Add step')
await page.waitForSelector('.sheet')
assert.equal(await page.evaluate(() => document.activeElement?.id), 'step-text', 'a new step is ready to type into')
await page.keyboard.type('Top up savings')
await enter(page, '#step-amount', '95')
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
assert.match(await text(page, '.facts'), /A paycheck\s+\$111\.50\s+A year\s+\$2,676\s+Of Living\s+5\.9%/)
await shot(page, '04-subscriptions')
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
await shot(page, '05-undo')
await page.tap('.toast button')
assert.equal(await page.locator('.cat').count(), 8)
assert.equal(await text(page, '.spent-total'), '$3,919')

// Everything is still there after a reload.
await page.waitForTimeout(600)
await page.reload()
await page.waitForSelector('.hero-money')
assert.equal(await value(page, '#income'), '7,800')
assert.equal(await page.locator('.step').count(), 4)
assert.equal(await page.locator('.cat').count(), 8)
assert.equal(await text(page, '.spent-total'), '$3,919')
await page.tap('.cat >> text="Subscriptions"')
assert.equal(await page.locator('#category-note').inputValue(), 'Spotify renews on the 3rd')
await page.keyboard.press('Escape')
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('o-budget.state')))
assert.equal(saved.version, 1)

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
  await shot(p, '06-artifact-loading')
  await p.waitForSelector('.hero-money')
  assert.equal(await value(p, '#income'), '7,800')
  assert.equal(await text(p, '.spent-total'), '$3,919')
  assert.equal(await text(p, '.sync'), 'Saved')
  await enter(p, '#income', '8000')
  await p.waitForTimeout(700)
  const writes = await p.evaluate(() => window.__writes)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].income, 8000)
  assert.equal(typeof writes[0].savedAt, 'string')
  assert.equal(await text(p, '.sync'), 'Saved')
  // Another device's change shows up here.
  await p.evaluate((doc) => window.__remote({ ...doc, income: 9100 }), saved)
  assert.equal(await value(p, '#income'), '9,100')
})

// A database with nothing in it yet opens an empty budget, ready to fill in.
await hosted({ doc: undefined }, async (p) => {
  await p.waitForSelector('.hero-money')
  assert.equal(await value(p, '#income'), '0')
  assert.match(await text(p, '.income'), /Enter what comes in each month to start/)
  assert.match(await text(p, '.expenses'), /No expenses yet/)
  assert.equal(await p.locator('.step').count(), 0)
  await shot(p, '07-artifact-empty', true)
  await enter(p, '#income', '5000')
  await p.waitForTimeout(700)
  assert.equal((await p.evaluate(() => window.__writes))[0].income, 5000)
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
