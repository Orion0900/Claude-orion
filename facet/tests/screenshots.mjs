// Takes the README screenshots from the built-in demo (a synthetic face, not
// a real person). Usage: npm run build && node tests/screenshots.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { assert, BASE, launch, root, serve, watchErrors } from './support.mjs'

const out = join(root, 'docs')
mkdirSync(out, { recursive: true })
const server = await serve(4412)
const { browser, context } = await launch()
const page = await context.newPage()
const errors = watchErrors(page)
const sex = process.env.SEX ?? 'male'

const capture = async (name) => {
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log(`docs/${name}.png`)
}
/** Scrolls so `selector` sits just under the sticky header. */
const scrollTo = async (selector, offset = 112) => {
  await page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel)
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off)
    },
    [selector, offset],
  )
}

try {
  await page.goto(`${server.origin}${BASE}`)
  await page.evaluate((s) => localStorage.setItem('facet.settings', JSON.stringify({ sex: s, onboarded: true, showClinical: true, showMm: true })), sex)
  await page.reload()
  await page.getByRole('button', { name: 'See a demo report first' }).click()
  await page.locator('#s-overview .ring').first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(1200)
  await capture('screenshot')

  await scrollTo('#m-thirds')
  await capture('screenshot-thirds')

  await scrollTo('#m-canthalTilt')
  await capture('screenshot-eyes')

  await scrollTo('#s-symmetry', 100)
  await capture('screenshot-symmetry')

  await scrollTo('#m-convexity')
  await capture('screenshot-profile')


  const id = page.url().split('#/report/')[1].split('/')[0]
  await page.goto(`${server.origin}${BASE}#/review/${id}`)
  await page.locator('.editor').waitFor()
  await page.waitForTimeout(600)
  await capture('screenshot-points')

  assert(errors.length === 0, `no page errors${errors.length ? `:\n${errors.join('\n')}` : ''}`)
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
