// Draws the PWA icons: the O from the app's header, a ring filling clockwise
// from the dot it starts at the way a plan fills in step by step, in lilac on
// the app's night. Renders with Playwright's Chromium. Run: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(out, { recursive: true })

const DONE = 0.72
const R = 12
const LOOP = 2 * Math.PI * R

/** `scale` shrinks the ring into the middle (maskable icons keep to the safe zone); `corner` rounds the tile. */
const page = (size, { scale, corner }) => `<!doctype html>
<style>
  html, body { margin: 0; background: transparent; }
  .tile {
    width: ${size}px; height: ${size}px; border-radius: ${corner * size}px;
    background: radial-gradient(circle at 50% 30%, #241f42, #0e0c18 72%);
    display: grid; place-items: center;
  }
  svg { width: ${size * 0.62 * scale}px; height: ${size * 0.62 * scale}px; }
  circle { fill: none; stroke-width: 5.4; }
  .start { fill: #f0eefb; stroke: none; }
</style>
<div class="tile">
  <svg viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="${R}" stroke="#2f2a4c" />
    <g transform="rotate(-90 16 16)">
      <circle cx="16" cy="16" r="${R}" stroke="#9a86ff" stroke-linecap="round"
        stroke-dasharray="${DONE * LOOP} ${LOOP}" />
    </g>
    <circle class="start" cx="16" cy="${16 - R}" r="3.6" />
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
