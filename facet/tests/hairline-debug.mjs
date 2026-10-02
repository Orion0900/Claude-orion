// Saves the hairline search drawn over each photo: node tests/hairline-debug.mjs <outdir>
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.argv[2] ?? join(root, 'test-results')
mkdirSync(out, { recursive: true })
const server = await createServer({ root, logLevel: 'error', server: { port: 5198, strictPort: true } })
await server.listen()
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('http://localhost:5198/tests/harness.html')
await page.evaluate(() => window.ready)
for (const f of readdirSync(join(root, 'tests/.cache')).filter((f) => /\.(jpe?g|png)$/i.test(f))) {
  const data = await page.evaluate((u) => window.hairlineDebug(u), `/tests/.cache/${f}`)
  if (data) writeFileSync(join(out, `hairline-${f}.jpg`), Buffer.from(data.split(',')[1], 'base64'))
}
await browser.close()
await server.close()
