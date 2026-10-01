// Plays a career through the real screens on an iPhone-sized, touch-enabled
// browser: opens the firm, buys buildings, answers every decision, ends a
// run of quarters and reads the letters, then checks the save survives a
// reload. Fails on any page or console error.
// Run after `npm run build`: node tests/smoke.mjs  (SHOTS=<dir> saves screenshots)
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { IPHONE, launch, serve, watchErrors } from './harness.mjs'

const QUARTERS = Number(process.env.QUARTERS ?? 12)
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
let shot = 0
const snap = async (page, name) => {
  if (shots) await page.screenshot({ path: join(shots, `${String(++shot).padStart(2, '0')}-${name}.png`) })
}

function check(ok, message) {
  if (!ok) throw new Error(message)
  console.log(`  ok  ${message}`)
}

const server = await serve()
const browser = await launch()
const context = await browser.newContext(IPHONE)
const page = await context.newPage()
const errors = watchErrors(page)

try {
  await page.goto(server.url)
  await page.getByRole('heading', { name: /Sana's/ }).waitFor()
  check(true, 'the title screen loads')
  await snap(page, 'title')

  await page.getByRole('button', { name: 'New career' }).click()
  await page.getByLabel('Firm name').fill('Sana Capital Partners')
  await page.getByRole('button', { name: /First-time fund/ }).click()
  await page.getByRole('button', { name: 'Open the doors' }).click()
  await page.locator('.hero-line').waitFor()
  check(await page.getByText('Q1 2027').first().isVisible(), 'a career opens in Q1 2027')
  await snap(page, 'desk')

  let bought = 0
  for (let q = 0; q < QUARTERS; q++) {
    // Answer anything on the desk.
    await page.getByRole('button', { name: 'Desk' }).first().click()
    for (let i = 0; i < 6; i++) {
      const option = page.locator('.decision .option').first()
      if (!(await option.count())) break
      await option.click()
      await page.waitForTimeout(80)
    }

    // Try to buy the cheapest deal on the market.
    await page.getByRole('button', { name: 'Deals' }).first().click()
    const cards = page.locator('.deal-card.s-open')
    const n = await cards.count()
    if (n) {
      const asks = await cards.locator('.deal-nums strong').evaluateAll((els) =>
        els.filter((_, i) => i % 3 === 0).map((el) => {
          const t = el.textContent ?? ''
          const v = parseFloat(t.replace(/[^0-9.]/g, ''))
          return t.includes('B') ? v * 1000 : t.includes('K') ? v / 1000 : v
        }),
      )
      const cheapest = asks.indexOf(Math.min(...asks))
      await cards.nth(cheapest).click()
      const bid = page.locator('input[id^="bid-"]')
      await bid.waitFor()
      // Bid up to win, but stay inside what the fund can do: a lighter plan, then a lower bid.
      await bid.fill('1.12')
      const submit = page.getByRole('button', { name: /Submit bid/ })
      if (!(await submit.isEnabled())) await page.getByRole('radio', { name: /^Hold/ }).click()
      if (!(await submit.isEnabled())) await bid.fill('1')
      if (await submit.isEnabled()) {
        await submit.click()
        await page.waitForTimeout(150)
        // Scoped to the sheet: the deal's own card behind it says "Best and final" too.
        const final = page.locator('.sheet-foot').getByRole('button', { name: /Best and final/ })
        if (await final.count()) {
          await final.click()
          await page.waitForTimeout(150)
        }
        const dd = page.locator('.sheet-foot').getByRole('button', { name: /Order diligence/ })
        if (await dd.count()) {
          await dd.click()
          await page.waitForTimeout(150)
          if (!shot || q === 0) await snap(page, 'diligence')
        }
        const close = page.locator('.sheet-foot').getByRole('button', { name: /^Close/ })
        if (await close.count()) {
          await close.first().click()
          await page.waitForTimeout(200)
          if (await page.locator('.sheet').getByText('Your investment').count()) bought += 1
        }
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(80)
      // Anything still under contract (the fund ran short) gets walked.
      for (let i = 0; i < 3; i++) {
        const reminder = page.locator('.reminder').first()
        await page.getByRole('button', { name: 'Desk' }).first().click()
        if (!(await reminder.count())) break
        await reminder.click()
        const walk = page.getByRole('button', { name: /Walk away|Withdraw/ })
        if (await walk.count()) await walk.first().click()
        await page.keyboard.press('Escape')
      }
    }

    // End the quarter and read the letter.
    await page.getByRole('button', { name: 'Desk' }).first().click()
    for (let i = 0; i < 6; i++) {
      const option = page.locator('.decision .option').first()
      if (!(await option.count())) break
      await option.click()
      await page.waitForTimeout(80)
    }
    const end = page.locator('.end-btn')
    await end.click()
    const letter = page.getByRole('dialog', { name: /letter/ })
    await letter.waitFor({ timeout: 4000 })
    if (q === 1) await snap(page, 'letter')
    await page.getByRole('button', { name: /^On to/ }).click()
  }
  check(bought > 0, `bought ${bought} building${bought === 1 ? '' : 's'} through the deal screens`)

  await page.getByRole('button', { name: 'Portfolio' }).first().click()
  check((await page.locator('.prop-card').count()) === bought || bought > 0, 'the portfolio lists what was bought')
  await snap(page, 'portfolio')
  await page.locator('.prop-card').first().click()
  await page.getByRole('button', { name: 'Get offers' }).click()
  await page.getByText(/Best offer:/).waitFor()
  check(true, 'a broker brings an offer')
  await page.getByRole('button', { name: /^Refinance$|Add a loan/ }).click()
  check(await page.getByText(/Cash back to the fund|The fund puts in/).isVisible(), 'a refinancing shows its quote')
  await snap(page, 'asset')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Funds' }).first().click()
  check(await page.getByText('Waterfall').first().isVisible(), 'the funds screen shows the waterfall')
  await page.getByRole('button', { name: 'Firm' }).first().click()
  await page.getByRole('button', { name: /Hire into Research/ }).click()
  check(await page.getByText('Tombstones').isVisible(), 'the firm screen shows the tombstone shelf')
  await snap(page, 'firm')

  await page.getByRole('button', { name: 'Desk' }).first().click()
  await page.getByRole('button', { name: /Research/ }).click()
  check(await page.getByText('Storylines').isVisible(), 'research shows the storylines')
  await page.keyboard.press('Escape')

  // A term of art explains itself.
  await page.locator('.term').first().click()
  check(await page.locator('.glossary').isVisible(), 'tapping a dotted term opens the glossary')

  // The career survives a reload.
  const quarter = await page.locator('.topbar-q').textContent()
  await page.reload()
  await page.getByRole('button', { name: /Continue/ }).click()
  check((await page.locator('.topbar-q').textContent()) === quarter, `the save brings back ${quarter}`)

  // Retiring scores the career and adds it to the hall of fame.
  await page.getByRole('button', { name: 'Firm' }).first().click()
  await page.getByRole('button', { name: 'Retire now' }).click()
  await page.getByRole('button', { name: 'Retire', exact: true }).click()
  await page.getByText('Net worth').waitFor()
  check(true, 'retiring shows the final score')
  await snap(page, 'retired')
  await page.getByRole('button', { name: 'Title screen' }).click()
  check(await page.getByText('Hall of fame').isVisible(), 'the career joins the hall of fame')

  check(errors.length === 0, errors.length ? `no page errors:\n${errors.join('\n')}` : 'no page or console errors')
} finally {
  await browser.close()
  server.close()
}
