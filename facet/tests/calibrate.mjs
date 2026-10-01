// Prints every measurement for a set of photos, to sanity-check the numbers
// against what the literature says typical faces measure.
// Usage: node tests/calibrate.mjs [image…]   (defaults to tests/.cache/*)
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const images = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(join(root, 'tests/.cache')).filter((f) => /\.(jpe?g|png)$/i.test(f)).map((f) => `tests/.cache/${f}`)
const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: true } })
await server.listen()
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', (e) => console.error('page error:', e.message))
await page.goto('http://localhost:5199/tests/harness.html')
await page.evaluate(() => window.ready)
for (const img of images) {
  const r = await page.evaluate(([url, sex]) => window.analyzeUrl(url, sex), [`/${img}`, process.env.SEX ?? 'female'])
  console.log(`\n=== ${img}`)
  if (!r) { console.log('no face'); continue }
  console.log('size', r.size, 'pose', Object.fromEntries(Object.entries(r.pose ?? {}).map(([k, v]) => [k, +v.toFixed(1)])), 'mm/px', r.mmPerPx?.toFixed(3), 'hairline', r.hairline, r.pixels.hairline.confidence.toFixed(2))
  console.log('pixels', { brightness: r.pixels.brightness.toFixed(0), sideBalance: r.pixels.sideBalance.toFixed(2), clipped: r.pixels.clipped.toFixed(3), sharpness: r.pixels.sharpness.toFixed(1) })
  console.log('harmony', r.harmony, 'groups', r.groups.map((g) => `${g.id}:${g.score?.toFixed(1) ?? '-'}`).join(' '))
  console.log('shape', r.shape.shape, `(${(r.shape.confidence * 100).toFixed(0)}%, then ${r.shape.runnerUp})`, Object.fromEntries(Object.entries(r.shape.features).map(([k, v]) => [k, +v.toFixed(3)])))
  console.log('symmetry', r.symmetry.score.toFixed(1), 'asym', r.symmetry.asymmetry.toFixed(2), r.symmetry.regions.map((x) => `${x.id}:${x.asymmetry.toFixed(2)}`).join(' '))
  console.log('findings', r.symmetry.findings.map((f) => `${f.id}:${f.amount.toFixed(1)}${f.unit}(${f.side},${f.level})`).join(' '))
  for (const m of r.metrics) console.log(`  ${m.id.padEnd(14)} ${m.display.padEnd(20)} score ${m.score?.toFixed(1) ?? '  - '}  ideal ${m.ideal ?? '-'}  [${m.key}]  ${m.details.map((d) => `${d.label}: ${d.value}`).join('; ')}`)
  console.log('quality', r.quality.join(' | '))
}
await browser.close()
await server.close()
