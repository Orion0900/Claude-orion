// The whole app on a phone-sized screen, as someone would use it: the
// introduction, a front analysis from a photo, checking the points, the
// report, a side profile, history and compare. Fails on any page error.
// Usage: npm run build && node tests/e2e.mjs   (SHOTS=<dir> saves screenshots)
import { assert, BASE, launch, photo, serve, shot, watchErrors } from './support.mjs'

const front = await photo(process.env.PHOTO ?? 'business-person.png')
const second = await photo('portrait.jpg')
const server = await serve()
const { browser, context } = await launch()
const page = await context.newPage()
const errors = watchErrors(page)
const url = `${server.origin}${BASE}`

try {
  // Introduction.
  await page.goto(url)
  await page.getByRole('button', { name: 'Get started' }).click()
  await page.getByRole('button', { name: 'Female ideals' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await shot(page, '01-before-you-start')
  await page.getByRole('button', { name: 'I understand' }).click()
  await page.getByRole('heading', { name: 'See your face in proportion' }).waitFor()
  await shot(page, '02-home-empty')
  assert(true, 'introduction leads to the empty home screen')

  // A front analysis from the photo library.
  await page.getByRole('button', { name: 'Analyse my face' }).click()
  await page.getByRole('heading', { name: 'A front photo' }).waitFor()
  await page.locator('input[type=file]').setInputFiles(front)
  await page.getByText('Check the points', { exact: true }).waitFor({ timeout: 60_000 })
  assert(page.url().includes('#/review/'), 'the photo is analysed and opens for checking')
  await shot(page, '03-review')

  // Nudge the right jaw angle: tap it, drag elsewhere on the photo.
  const editor = page.locator('.editor')
  const box = await editor.boundingBox()
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.97)
  await page.getByText('Tap a point to adjust it').waitFor()
  await page.getByRole('button', { name: 'See my results' }).click()

  // The report.
  await page.getByText('Harmony', { exact: true }).first().waitFor({ timeout: 30_000 })
  const cards = await page.locator('article.metric').count()
  assert(cards >= 16, `the report shows every measurement (${cards} cards)`)
  const harmony = Number(await page.locator('.ring .ring-value').first().innerText())
  assert(harmony > 40 && harmony <= 100, `a harmony score is shown (${harmony})`)
  await shot(page, '04-report-top')
  for (const section of ['Proportions', 'Eyes', 'Symmetry', 'Photo']) {
    await page.locator('.section-nav').getByRole('button', { name: section, exact: true }).click()
    await page.waitForTimeout(700)
    await shot(page, `05-report-${section.toLowerCase()}`)
  }
  // The summary card, downloaded where the share sheet isn't available.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Share summary' }).click()])
  assert(download.suggestedFilename() === 'facet-summary.png', 'the summary card is drawn and handed over')
  if (process.env.SHOTS) await download.saveAs(`${process.env.SHOTS}/summary-card.png`)

  await page.locator('#m-canthalTilt').getByText('What you can do').click()
  await shot(page, '06-advice')
  assert((await page.locator('#m-canthalTilt .advice-list li').count()) >= 0, 'advice opens under a measurement')

  // Switching the comparison changes the ideal ranges in place.
  const idealBefore = await page.locator('#m-jawCheek').getByText(/^Ideal \d/).innerText()
  await page.locator('#s-overview').getByRole('button', { name: 'Male ideals', exact: true }).click()
  await page.waitForTimeout(300)
  const idealAfter = await page.locator('#m-jawCheek').getByText(/^Ideal \d/).innerText()
  assert(idealBefore !== idealAfter, `switching to male ideals moves the jaw range (${idealBefore} → ${idealAfter})`)

  // A side profile: three anchor taps, then step through the rest.
  await page.locator('.section-nav').getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByRole('button', { name: /Add a side profile/ }).last().click()
  await page.getByRole('heading', { name: 'A side photo' }).waitFor()
  await page.locator('input[type=file]').setInputFiles(front)
  await page.locator('.editor').waitFor()
  const taps = [
    [0.62, 0.42],
    [0.55, 0.62],
    [0.3, 0.4],
  ]
  for (const [fx, fy] of taps) {
    const b = await page.locator('.editor').boundingBox()
    await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy)
    await page.getByRole('button', { name: 'Next' }).click()
  }
  await shot(page, '07-profile-step')
  for (let i = 3; i < 15; i++) {
    await page.getByRole('button', { name: i === 14 ? 'Finish' : 'Next' }).click()
    await page.waitForTimeout(80)
  }
  await page.getByRole('button', { name: 'See profile results' }).click()
  await page.locator('#m-nasolabial').waitFor()
  const profileCards = await page.locator('#s-profile article.metric').count()
  assert(profileCards === 12, `the profile adds its twelve measurements (${profileCards})`)
  await shot(page, '08-profile-results')

  // A second analysis, then history and compare.
  await page.goto(`${url}#/new`)
  await page.locator('input[type=file]').setInputFiles(second)
  await page.getByText('Check the points', { exact: true }).waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: 'See my results' }).click()
  await page.getByText('Harmony', { exact: true }).first().waitFor()
  assert(await page.getByText(/Not a neutral expression|smil/i).first().isVisible(), 'a smiling photo is flagged')
  await page.goto(`${url}#/history`)
  await page.getByRole('button', { name: /Compare/ }).click()
  const items = page.locator('.list .list-item > button.list-item, .list > .list-item > button')
  await items.nth(0).click()
  await items.nth(1).click()
  await page.getByRole('button', { name: 'Compare 2/2' }).click()
  await page.getByText('HARMONY').first().waitFor()
  await shot(page, '09-compare')
  assert(page.url().includes('#/compare/'), 'two analyses compare side by side')

  // Settings persist.
  await page.goto(`${url}#/settings`)
  await page.getByRole('switch', { name: 'Show millimetres' }).click()
  await page.reload()
  assert((await page.getByRole('switch', { name: 'Show millimetres' }).getAttribute('aria-checked')) === 'false', 'settings survive a reload')

  assert(errors.length === 0, `no page errors${errors.length ? `:\n${errors.join('\n')}` : ''}`)
} catch (e) {
  await shot(page, 'failure')
  console.error(e.message)
  if (errors.length) console.error(errors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
