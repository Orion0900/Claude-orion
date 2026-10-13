// Draws the PWA icons: the O from the app's header, a ring split between
// Investing (cobalt) and Living (amber) the way $7,800 splits, on the app's
// navy. Renders with Playwright's Chromium. Run: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(out, { recursive: true })

const INVESTING = 4000 / 7800
const R = 12
const LOOP = 2 * Math.PI * R
const GAP = 2.4

/** `scale` shrinks the ring into the middle (maskable icons keep to the safe zone); `corner` rounds the tile. */
const page = (size, { scale, corner }) => `<!doctype html>
<style>
  html, body { margin: 0; background: transparent; }
  .tile {
    width: ${size}px; height: ${size}px; border-radius: ${corner * size}px;
    background: radial-gradient(circle at 50% 32%, #1b1f38, #0b0d19 72%);
    display: grid; place-items: center;
  }
  svg { width: ${size * 0.62 * scale}px; height: ${size * 0.62 * scale}px; }
  circle { fill: none; stroke-width: 5.4; }
</style>
<div class="tile">
  <svg viewBox="0 0 32 32">
    <g transform="rotate(-90 16 16)">
      <circle cx="16" cy="16" r="${R}" stroke="#5f70f0"
        stroke-dasharray="${INVESTING * LOOP - GAP} ${LOOP}" stroke-dashoffset="${-GAP / 2}" />
      <circle cx="16" cy="16" r="${R}" stroke="#c8841a"
        stroke-dasharray="${(1 - INVESTING) * LOOP - GAP} ${LOOP}" stroke-dashoffset="${-(INVESTING * LOOP + GAP / 2)}" />
    </g>
  </svg>
</div>`

const browser = await chromium.launch()
async function render(file, size, options) {
  const tab = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await tab.setContent(page(size, options))
  writeFileSync(join(out, file), await tab.screenshot({ omitBackground: options.corner > 0 }))
  await tab.close()
}

// iOS masks the Home Screen icon itself and wants it square and opaque.
await render('apple-touch-icon.png', 180, { scale: 1, corner: 0 })
await render('icon-192.png', 192, { scale: 1, corner: 0.22 })
await render('icon-512.png', 512, { scale: 1, corner: 0.22 })
await render('icon-maskable-512.png', 512, { scale: 0.8, corner: 0 })
await browser.close()
console.log('icons written to', out)
