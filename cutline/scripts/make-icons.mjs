// Draws the PWA icons in the app's own type: CUT in white over LINE on a
// caption-yellow tab, on the violet gradient. Renders with Playwright's
// Chromium so the Montserrat face is the real one. Run: npm run icons
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public')
mkdirSync(out, { recursive: true })
const font = readFileSync(join(root, 'node_modules/@fontsource/montserrat/files/montserrat-latin-900-normal.woff2')).toString('base64')

/** `scale` shrinks the mark into the middle (maskable icons keep to the safe zone); `corner` rounds the tile. */
const page = (size, { scale, corner }) => `<!doctype html>
<style>
  @font-face { font-family: Montserrat; font-weight: 900; src: url(data:font/woff2;base64,${font}) format('woff2'); }
  html, body { margin: 0; background: transparent; }
  .tile {
    width: ${size}px; height: ${size}px; border-radius: ${corner * size}px; overflow: hidden;
    background:
      radial-gradient(circle at 78% 18%, rgba(255, 255, 255, 0.22), transparent 42%),
      linear-gradient(140deg, #7c5cff 0%, #a64dff 55%, #d94dc8 100%);
    display: grid; place-content: center;
  }
  .mark { display: grid; justify-items: center; transform: scale(${scale}); font-family: Montserrat; font-weight: 900; line-height: 1; }
  .cut {
    font-size: ${size * 0.34}px; color: #fff; letter-spacing: -0.02em;
    -webkit-text-stroke: ${size * 0.012}px #0b0b0f; paint-order: stroke fill;
    text-shadow: 0 ${size * 0.02}px ${size * 0.04}px rgba(0, 0, 0, 0.25);
  }
  .line {
    margin-top: ${size * 0.02}px; padding: ${size * 0.035}px ${size * 0.06}px ${size * 0.045}px;
    font-size: ${size * 0.17}px; color: #0b0b0f; background: #ffe14d; border-radius: ${size * 0.05}px;
    transform: rotate(-4deg); box-shadow: 0 ${size * 0.02}px ${size * 0.05}px rgba(0, 0, 0, 0.25);
  }
</style>
<div class="tile"><div class="mark"><span class="cut">CUT</span><span class="line">LINE</span></div></div>`

const browser = await chromium.launch()
async function render(file, size, options) {
  const tab = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await tab.setContent(page(size, options))
  await tab.evaluate(() => document.fonts.ready)
  writeFileSync(join(out, file), await tab.screenshot({ omitBackground: options.corner > 0 }))
  await tab.close()
}

// iOS masks the Home Screen icon itself and wants it square and opaque.
await render('apple-touch-icon.png', 180, { scale: 1, corner: 0 })
await render('icon-192.png', 192, { scale: 1, corner: 0.22 })
await render('icon-512.png', 512, { scale: 1, corner: 0.22 })
await render('icon-maskable-512.png', 512, { scale: 0.78, corner: 0 })
await browser.close()
console.log('icons written to', out)
